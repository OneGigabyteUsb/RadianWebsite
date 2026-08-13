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
