const PBKDF2_ITERATIONS = 100000;

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(salt);

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits({
            name: "PBKDF2",
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return `${PBKDF2_ITERATIONS}$${saltHex}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
    try {
        const [iterationsString, saltHex, digest] = stored.split("$");
        const iterations = Number(iterationsString);

        if (!iterations || !saltHex || !digest) {
            return false;
        }

        const salt = hexToBytes(saltHex);

        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );

        const bits = await crypto.subtle.deriveBits({
                name: "PBKDF2",
                salt,
                iterations,
                hash: "SHA-256"
            },
            key,
            256
        );

        return bytesToHex(new Uint8Array(bits)) === digest;
    } catch {
        return false;
    }
}

// Sensible starting point for a brand-new user who has no row in the
// `avatar` table yet -- neutral skin-tone limbs/head, dark legs, no
// accessories equipped, default face.
const DEFAULT_AVATAR_COLORS = {
    head: "#ffb866",
    torso: "#ffb866",
    right_arm: "#ffb866",
    left_arm: "#ffb866",
    right_leg: "#11181d",
    left_leg: "#11181d",
};

const AVATAR_PARTS = new Set(Object.keys(DEFAULT_AVATAR_COLORS));

function parseAvatarRow(row) {
    return {
        id: row.id,
        colors: JSON.parse(row.colors),
        accessories: JSON.parse(row.accessories),
        face_id: row.face_id,
    };
}

// avatar.colors and avatar.accessories are stored as JSON-encoded TEXT
// columns (D1/SQLite has no native JSON column type). Creates a default
// row on first access so every user has one without a separate signup step.
async function getOrCreateAvatar(env, userId) {
    let row = await env.DB
        .prepare("SELECT id, colors, accessories, face_id FROM avatar WHERE id = ?")
        .bind(userId)
        .first();

    if (!row) {
        const colors = JSON.stringify(DEFAULT_AVATAR_COLORS);
        const accessories = JSON.stringify({ ids: [] });

        await env.DB
            .prepare(`
                INSERT INTO avatar (id, colors, accessories, face_id)
                VALUES (?, ?, ?, ?)
            `)
            .bind(userId, colors, accessories, 1)
            .run();

        row = { id: userId, colors, accessories, face_id: 1 };
    }

    return parseAvatarRow(row);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/api/me" && request.method === "GET") {
            const cookie = request.headers.get("Cookie") || "";

            const match = cookie.match(/radian_session=([^;]+)/);

            if (!match) {
                return Response.json({
                    error: "Not logged in."
                }, {
                    status: 401
                });
            }

            const sessionId = match[1];

            const session = await env.DB
                .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                .bind(sessionId)
                .first();

            if (!session) {
                return Response.json({
                    error: "Not logged in."
                }, {
                    status: 401
                });
            }

            const user = await env.DB
                .prepare(`
                    SELECT id, username, bio, visits, created_at,
                           is_deleted, is_staff, is_moderator,
                           is_banned, shirt_id, last_seen
                    FROM users
                    WHERE id = ?
                `)
                .bind(session.user_id)
                .first();

            if (!user) {
                return Response.json({
                    error: "User not found."
                }, {
                    status: 404
                });
            }

            if (user.is_banned) {
                return Response.json({
                    error: "This account has been banned.",
                    banned: true
                }, {
                    status: 403
                });
            }

            // script.js's homePage/profilePage render these counts directly,
            // so /api/me needs to include them alongside the base user row.
            const friendCountRow = await env.DB
                .prepare(`
                    SELECT COUNT(*) AS count
                    FROM friendships
                    WHERE (requester_id = ? OR recipient_id = ?)
                      AND status = 'accepted'
                `)
                .bind(user.id, user.id)
                .first();

            return Response.json({
                ...user,
                friend_count: friendCountRow?.count ?? 0,
                // There's no followers/following table yet, so these are
                // stubbed at 0 rather than left undefined in the response.
                follower_count: 0,
                following_count: 0,
            });
        }

        // showBioEditor() in script.js POSTs the new bio text here, then
        // re-renders the profile with whatever this returns -- so the
        // response needs the same shape as /api/me (friend_count etc.),
        // not just the updated bio field.
        if (url.pathname === "/api/me/bio" && request.method === "POST") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const body = await request.json();
                const bio = typeof body.bio === "string" ? body.bio : "";

                if (bio.length > 300) {
                    return Response.json({
                        error: "Bio must be 300 characters or fewer."
                    }, {
                        status: 400
                    });
                }

                await env.DB
                    .prepare("UPDATE users SET bio = ? WHERE id = ?")
                    .bind(bio, session.user_id)
                    .run();

                const user = await env.DB
                    .prepare(`
                        SELECT id, username, bio, visits, created_at,
                               is_deleted, is_staff, is_moderator,
                               is_banned, shirt_id, last_seen
                        FROM users
                        WHERE id = ?
                    `)
                    .bind(session.user_id)
                    .first();

                const friendCountRow = await env.DB
                    .prepare(`
                        SELECT COUNT(*) AS count
                        FROM friendships
                        WHERE (requester_id = ? OR recipient_id = ?)
                          AND status = 'accepted'
                    `)
                    .bind(session.user_id, session.user_id)
                    .first();

                return Response.json({
                    ...user,
                    friend_count: friendCountRow?.count ?? 0,
                    follower_count: 0,
                    following_count: 0,
                });

            } catch (error) {
                console.error("Update bio error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/me/avatar" && request.method === "GET") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const avatar = await getOrCreateAvatar(env, session.user_id);

                return Response.json(avatar);

            } catch (error) {
                console.error("Get avatar error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/me/avatar/color" && request.method === "POST") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const body = await request.json();
                const part = body.part;
                const color = body.color;

                if (!AVATAR_PARTS.has(part)) {
                    return Response.json({
                        error: "Invalid body part."
                    }, {
                        status: 400
                    });
                }

                if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
                    return Response.json({
                        error: "Color must be a 6-digit hex code, e.g. #ffb866."
                    }, {
                        status: 400
                    });
                }

                const avatar = await getOrCreateAvatar(env, session.user_id);
                avatar.colors[part] = color;

                await env.DB
                    .prepare("UPDATE avatar SET colors = ? WHERE id = ?")
                    .bind(JSON.stringify(avatar.colors), session.user_id)
                    .run();

                return Response.json(avatar);

            } catch (error) {
                console.error("Update avatar color error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/me/avatar/accessory" && request.method === "POST") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const body = await request.json();
                const itemId = Number(body.item_id);
                const equipped = Boolean(body.equipped);

                if (!Number.isInteger(itemId)) {
                    return Response.json({
                        error: "Invalid item ID."
                    }, {
                        status: 400
                    });
                }

                const avatar = await getOrCreateAvatar(env, session.user_id);
                const ids = new Set(avatar.accessories.ids);

                if (equipped) {
                    ids.add(itemId);
                } else {
                    ids.delete(itemId);
                }

                avatar.accessories.ids = Array.from(ids);

                await env.DB
                    .prepare("UPDATE avatar SET accessories = ? WHERE id = ?")
                    .bind(JSON.stringify(avatar.accessories), session.user_id)
                    .run();

                return Response.json(avatar);

            } catch (error) {
                console.error("Update avatar accessory error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/me/friends" && request.method === "GET") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const sessionId = match[1];

                const session = await env.DB
                    .prepare(`
                SELECT user_id
                FROM sessions
                WHERE session_id = ?
            `)
                    .bind(sessionId)
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const friends = await env.DB
                    .prepare(`
                SELECT
                    f.id,
                    u.id AS user_id,
                    u.username,
                    u.bio,
                    u.shirt_id
                FROM friendships f
                JOIN users u
                    ON u.id = CASE
                        WHEN f.requester_id = ? THEN f.recipient_id
                        ELSE f.requester_id
                    END
                WHERE
                    (f.requester_id = ? OR f.recipient_id = ?)
                    AND f.status = 'accepted'
                    AND u.is_deleted = 0
                    AND u.is_banned = 0
                ORDER BY u.username
            `)
                    .bind(
                        session.user_id,
                        session.user_id,
                        session.user_id
                    )
                    .all();

                return Response.json({
                    friends: friends.results || []
                });

            } catch (error) {
                console.error("Me friends error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        // script.js's "Add Friend" button posts here (see renderRelationActions
        // in script.js), so this is aligned to /api/friends/request rather
        // than /api/me/friend-requests, which script.js instead GETs to list
        // incoming requests (not implemented here).
        if (url.pathname === "/api/friends/request" && request.method === "POST") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare(`
                SELECT user_id
                FROM sessions
                WHERE session_id = ?
            `)
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const body = await request.json();
                const recipientId = Number(body.target_id);

                if (!Number.isInteger(recipientId)) {
                    return Response.json({
                        error: "Invalid user ID."
                    }, {
                        status: 400
                    });
                }

                if (recipientId === session.user_id) {
                    return Response.json({
                        error: "You cannot send yourself a friend request."
                    }, {
                        status: 400
                    });
                }

                const recipient = await env.DB
                    .prepare(`
                SELECT id
                FROM users
                WHERE id = ?
                  AND is_deleted = 0
                  AND is_banned = 0
            `)
                    .bind(recipientId)
                    .first();

                if (!recipient) {
                    return Response.json({
                        error: "User not found."
                    }, {
                        status: 404
                    });
                }

                const existing = await env.DB
                    .prepare(`
                SELECT id, status
                FROM friendships
                WHERE
                    (requester_id = ? AND recipient_id = ?)
                    OR
                    (requester_id = ? AND recipient_id = ?)
                LIMIT 1
            `)
                    .bind(
                        session.user_id,
                        recipientId,
                        recipientId,
                        session.user_id
                    )
                    .first();

                if (existing) {
                    return Response.json({
                        error: "A friendship or friend request already exists."
                    }, {
                        status: 409
                    });
                }

                const result = await env.DB
                    .prepare(`
                INSERT INTO friendships (
                    requester_id,
                    recipient_id,
                    status
                )
                VALUES (?, ?, 'pending')
            `)
                    .bind(session.user_id, recipientId)
                    .run();

                return Response.json({
                    id: result.meta.last_row_id,
                    requester_id: session.user_id,
                    recipient_id: recipientId,
                    status: "pending"
                }, {
                    status: 201
                });

            } catch (error) {
                console.error("Send friend request error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        // requestsPage() in script.js (the /friends page) GETs this to list
        // incoming pending requests -- separate from the POST above, which
        // sends a new request.
        if (url.pathname === "/api/me/friend-requests" && request.method === "GET") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const requests = await env.DB
                    .prepare(`
                        SELECT u.id, u.username
                        FROM friendships f
                        JOIN users u ON u.id = f.requester_id
                        WHERE f.recipient_id = ?
                          AND f.status = 'pending'
                          AND u.is_deleted = 0
                          AND u.is_banned = 0
                        ORDER BY u.username
                    `)
                    .bind(session.user_id)
                    .all();

                // requestsPage() expects a bare array, not a wrapped object.
                return Response.json(requests.results || []);

            } catch (error) {
                console.error("List friend requests error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/friends/accept" && request.method === "POST") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const body = await request.json();
                const requesterId = Number(body.requester_id);

                if (!Number.isInteger(requesterId)) {
                    return Response.json({
                        error: "Invalid user ID."
                    }, {
                        status: 400
                    });
                }

                const result = await env.DB
                    .prepare(`
                        UPDATE friendships
                        SET status = 'accepted'
                        WHERE requester_id = ?
                          AND recipient_id = ?
                          AND status = 'pending'
                    `)
                    .bind(requesterId, session.user_id)
                    .run();

                if (!result.meta.changes) {
                    return Response.json({
                        error: "No pending request from that user."
                    }, {
                        status: 404
                    });
                }

                return Response.json({ status: "accepted" });

            } catch (error) {
                console.error("Accept friend request error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/friends/decline" && request.method === "POST") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const session = await env.DB
                    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                    .bind(match[1])
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const body = await request.json();
                const requesterId = Number(body.requester_id);

                if (!Number.isInteger(requesterId)) {
                    return Response.json({
                        error: "Invalid user ID."
                    }, {
                        status: 400
                    });
                }

                // Declining removes the pending row entirely, so the
                // requester is free to send a new request later.
                const result = await env.DB
                    .prepare(`
                        DELETE FROM friendships
                        WHERE requester_id = ?
                          AND recipient_id = ?
                          AND status = 'pending'
                    `)
                    .bind(requesterId, session.user_id)
                    .run();

                if (!result.meta.changes) {
                    return Response.json({
                        error: "No pending request from that user."
                    }, {
                        status: 404
                    });
                }

                return Response.json({ status: "declined" });

            } catch (error) {
                console.error("Decline friend request error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        // profilePage() in script.js fetches this for /profile/:id. Publicly
        // viewable (no login required), but friendship_status is computed
        // relative to whoever's session cookie is present, if any.
        if (url.pathname.startsWith("/api/profile/") && request.method === "GET") {
            try {
                const profileId = Number(url.pathname.slice("/api/profile/".length));

                if (!Number.isInteger(profileId)) {
                    return Response.json({
                        error: "Invalid user ID."
                    }, {
                        status: 400
                    });
                }

                const user = await env.DB
                    .prepare(`
                        SELECT id, username, bio, visits, created_at,
                               is_staff, is_moderator, shirt_id, last_seen
                        FROM users
                        WHERE id = ? AND is_deleted = 0
                    `)
                    .bind(profileId)
                    .first();

                if (!user) {
                    return Response.json({
                        error: "User not found."
                    }, {
                        status: 404
                    });
                }

                const friendCountRow = await env.DB
                    .prepare(`
                        SELECT COUNT(*) AS count
                        FROM friendships
                        WHERE (requester_id = ? OR recipient_id = ?)
                          AND status = 'accepted'
                    `)
                    .bind(user.id, user.id)
                    .first();

                // Figure out the viewer (if any) from the session cookie, so
                // we can report friendship_status relative to them. Not
                // being logged in just means "not_friends" everywhere.
                let friendshipStatus = "not_friends";

                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (match) {
                    const session = await env.DB
                        .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                        .bind(match[1])
                        .first();

                    if (session) {
                        if (session.user_id === user.id) {
                            friendshipStatus = "self";
                        } else {
                            const friendship = await env.DB
                                .prepare(`
                                    SELECT requester_id, recipient_id, status
                                    FROM friendships
                                    WHERE (requester_id = ? AND recipient_id = ?)
                                       OR (requester_id = ? AND recipient_id = ?)
                                    LIMIT 1
                                `)
                                .bind(session.user_id, user.id, user.id, session.user_id)
                                .first();

                            if (friendship) {
                                if (friendship.status === "accepted") {
                                    friendshipStatus = "friends";
                                } else if (friendship.status === "pending") {
                                    friendshipStatus = friendship.requester_id === session.user_id
                                        ? "pending_outgoing"
                                        : "pending_incoming";
                                }
                            }
                        }
                    }
                }

                return Response.json({
                    ...user,
                    friend_count: friendCountRow?.count ?? 0,
                    // No followers table yet.
                    follower_count: 0,
                    following_count: 0,
                    friendship_status: friendshipStatus,
                });

            } catch (error) {
                console.error("Profile error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        // searchPage() in script.js hits this live as the user types.
        // Ported from server.py's _handle_search: matches by substring on
        // username (case-insensitive), capped at 25 results, with
        // friendship_status computed relative to the viewer (if logged in)
        // same as /api/profile/:id. follow_status is intentionally omitted
        // -- there's no followers table yet, and renderRelationActions() in
        // script.js just skips the Follow/Unfollow button when it's absent.
        if (url.pathname === "/api/search" && request.method === "GET") {
            try {
                const term = (url.searchParams.get("q") || "").trim().toLowerCase();

                if (!term) {
                    return Response.json([]);
                }

                let viewerId = null;
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (match) {
                    const session = await env.DB
                        .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
                        .bind(match[1])
                        .first();

                    if (session) viewerId = session.user_id;
                }

                // Escape LIKE wildcards that might appear in the search term.
                const likeTerm = `%${term.replace(/[%_\\]/g, c => `\\${c}`)}%`;

                const usersResult = await env.DB
                    .prepare(`
                        SELECT id, username, last_seen
                        FROM users
                        WHERE is_deleted = 0
                          AND LOWER(username) LIKE ? ESCAPE '\\'
                        ORDER BY username
                        LIMIT 25
                    `)
                    .bind(likeTerm)
                    .all();

                const users = usersResult.results || [];

                // Pull all of the viewer's friendships in one query instead
                // of one per search result.
                const friendshipByOtherId = new Map();

                if (viewerId) {
                    const friendships = await env.DB
                        .prepare(`
                            SELECT requester_id, recipient_id, status
                            FROM friendships
                            WHERE requester_id = ? OR recipient_id = ?
                        `)
                        .bind(viewerId, viewerId)
                        .all();

                    for (const f of (friendships.results || [])) {
                        const otherId = f.requester_id === viewerId ? f.recipient_id : f.requester_id;
                        friendshipByOtherId.set(otherId, f);
                    }
                }

                const ONLINE_WINDOW_MS = 5 * 60 * 1000;
                const now = Date.now();

                const results = users.map(u => {
                    let friendshipStatus = "not_friends";

                    if (viewerId) {
                        if (u.id === viewerId) {
                            friendshipStatus = "self";
                        } else {
                            const f = friendshipByOtherId.get(u.id);

                            if (f) {
                                if (f.status === "accepted") {
                                    friendshipStatus = "friends";
                                } else if (f.status === "pending") {
                                    friendshipStatus = f.requester_id === viewerId
                                        ? "pending_outgoing"
                                        : "pending_incoming";
                                }
                            }
                        }
                    }

                    // last_seen is stored via SQLite's datetime('now'), e.g.
                    // "2026-08-14 12:00:00" (UTC, no offset) -- normalize it
                    // to ISO-8601 so Date.parse treats it as UTC correctly.
                    const lastSeenMs = u.last_seen
                        ? Date.parse(u.last_seen.replace(" ", "T") + "Z")
                        : NaN;

                    const online = !Number.isNaN(lastSeenMs) &&
                        (now - lastSeenMs) < ONLINE_WINDOW_MS;

                    return {
                        id: u.id,
                        username: u.username,
                        online,
                        friendship_status: friendshipStatus,
                    };
                });

                return Response.json(results);

            } catch (error) {
                console.error("Search error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/signup" && request.method === "POST") {
            try {
                const body = await request.json();

                const username = (body.username || "").trim();
                const password = body.password || "";

                if (!username || !password) {
                    return Response.json({
                        error: "Username and password are required."
                    }, {
                        status: 400
                    });
                }

                if (username.length < 3 || username.length > 20) {
                    return Response.json({
                        error: "Username must be between 3 and 20 characters."
                    }, {
                        status: 400
                    });
                }

                if (password.length < 8) {
                    return Response.json({
                        error: "Password must be at least 8 characters."
                    }, {
                        status: 400
                    });
                }

                const existingUser = await env.DB
                    .prepare(`
                SELECT id
                FROM users
                WHERE username = ?
            `)
                    .bind(username)
                    .first();

                if (existingUser) {
                    return Response.json({
                        error: "Username is already taken."
                    }, {
                        status: 409
                    });
                }

                const passwordHash = await hashPassword(password);

                const result = await env.DB
                    .prepare(`
                INSERT INTO users (
                    username,
                    bio,
                    visits,
                    created_at,
                    is_deleted,
                    is_staff,
                    is_moderator,
                    is_banned,
                    shirt_id,
                    last_seen
                )
                VALUES (?, '', 0, datetime('now'), 0, 0, 0, 0, 1, datetime('now'))
            `)
                    .bind(username)
                    .run();

                const userId = result.meta.last_row_id;

                await env.DB
                    .prepare(`
                INSERT INTO playerhashes (
                    id,
                    username,
                    password_hash
                )
                VALUES (?, ?, ?)
            `)
                    .bind(userId, username, passwordHash)
                    .run();

                const sessionId = bytesToHex(
                    crypto.getRandomValues(new Uint8Array(32))
                );

                await env.DB
                    .prepare(`
        INSERT INTO sessions (session_id, user_id)
        VALUES (?, ?)
    `)
                    .bind(sessionId, userId)
                    .run();

                return new Response(
                    JSON.stringify({
                        id: userId,
                        username
                    }), {
                        status: 201,
                        headers: {
                            "Content-Type": "application/json",
                            "Set-Cookie": `radian_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`
                        }
                    }
                );

            } catch (error) {
                console.error("Signup error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/friends" && request.method === "GET") {
            try {
                const cookie = request.headers.get("Cookie") || "";
                const match = cookie.match(/radian_session=([^;]+)/);

                if (!match) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const sessionId = match[1];

                const session = await env.DB
                    .prepare(`
                SELECT user_id
                FROM sessions
                WHERE session_id = ?
            `)
                    .bind(sessionId)
                    .first();

                if (!session) {
                    return Response.json({
                        error: "Not logged in."
                    }, {
                        status: 401
                    });
                }

                const friends = await env.DB
                    .prepare(`
                SELECT
                    f.id,
                    u.id AS user_id,
                    u.username,
                    u.bio,
                    u.shirt_id
                FROM friendships f
                JOIN users u
                    ON u.id = CASE
                        WHEN f.requester_id = ? THEN f.recipient_id
                        ELSE f.requester_id
                    END
                WHERE
                    (f.requester_id = ? OR f.recipient_id = ?)
                    AND f.status = 'accepted'
                    AND u.is_deleted = 0
                    AND u.is_banned = 0
                ORDER BY u.username
            `)
                    .bind(
                        session.user_id,
                        session.user_id,
                        session.user_id
                    )
                    .all();

                return Response.json({
                    friends: friends.results || []
                });

            } catch (error) {
                console.error("Friends error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname === "/api/login" && request.method === "POST") {
            try {
                const body = await request.json();

                const username = (body.username || "").trim();
                const password = body.password || "";

                if (!username || !password) {
                    return Response.json({
                        error: "Username and password are required."
                    }, {
                        status: 400
                    });
                }

                const record = await env.DB
                    .prepare(`
                        SELECT id, username, password_hash
                        FROM playerhashes
                        WHERE username = ?
                    `)
                    .bind(username)
                    .first();

                if (!record || !(await verifyPassword(password, record.password_hash))) {
                    return Response.json({
                        error: "Invalid username or password."
                    }, {
                        status: 401
                    });
                }

                const user = await env.DB
                    .prepare(`
                        SELECT id, username, is_banned
                        FROM users
                        WHERE id = ?
                    `)
                    .bind(record.id)
                    .first();

                if (user?.is_banned) {
                    return Response.json({
                        error: "This account has been banned."
                    }, {
                        status: 403
                    });
                }

                const sessionId = bytesToHex(
                    crypto.getRandomValues(new Uint8Array(32))
                );

                await env.DB
                    .prepare(`
                        INSERT INTO sessions (session_id, user_id)
                        VALUES (?, ?)
                    `)
                    .bind(sessionId, record.id)
                    .run();

                return new Response(
                    JSON.stringify({
                        id: record.id,
                        username: record.username
                    }), {
                        status: 200,
                        headers: {
                            "Content-Type": "application/json",
                            "Set-Cookie": `radian_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`
                        }
                    }
                );

            } catch (error) {
                console.error("Login error:", error);

                return Response.json({
                    error: "Internal server error."
                }, {
                    status: 500
                });
            }
        }

        if (url.pathname.startsWith("/api/")) {
            return new Response("API endpoint not found", {
                status: 404
            });
        }

        const assetResponse = await env.ASSETS.fetch(request);

        if (assetResponse.status === 404 && !url.pathname.includes(".")) {
            return env.ASSETS.fetch(new URL("/index.html", url));
        }

        return assetResponse;
    }
};
