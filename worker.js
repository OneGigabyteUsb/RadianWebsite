const PBKDF2_ITERATIONS = 200000;

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

        // API routes
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

            return Response.json(user);
        }

        if (url.pathname === "/api/test-hash" && request.method === "GET") {
              const hash = await hashPassword("TestPassword123!");
              return Response.json({ hash });
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

        // Everything else goes to your website
        return env.ASSETS.fetch(request);
    }
};
