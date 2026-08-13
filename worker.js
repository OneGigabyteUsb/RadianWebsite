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

        return env.ASSETS.fetch(request);
    }
};
