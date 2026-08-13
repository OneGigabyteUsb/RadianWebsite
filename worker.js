export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test-db") {
      const result = await env.DB
        .prepare("SELECT id, username FROM users")
        .all();

      return Response.json(result);
    }

    return env.ASSETS.fetch(request);
  }
};
