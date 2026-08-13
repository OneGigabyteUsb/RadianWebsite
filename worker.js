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

  const bits = await crypto.subtle.deriveBits(
    {
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

    const bits = await crypto.subtle.deriveBits(
      {
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
    return Response.json(
      { error: "Not logged in." },
      { status: 401 }
    );
  }

  const sessionId = match[1];

  const session = await env.DB
    .prepare("SELECT user_id FROM sessions WHERE session_id = ?")
    .bind(sessionId)
    .first();

  if (!session) {
    return Response.json(
      { error: "Not logged in." },
      { status: 401 }
    );
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
    return Response.json(
      { error: "User not found." },
      { status: 404 }
    );
  }

  if (user.is_banned) {
    return Response.json(
      {
        error: "This account has been banned.",
        banned: true
      },
      { status: 403 }
    );
  }

  return Response.json(user);
}

    if (url.pathname === "/api/me" && request.method === "GET") {
      return new Response("ME ROUTE WORKS");
    }

    // Everything else goes to your website
    return env.ASSETS.fetch(request);
  }
};
