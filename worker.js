export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test") {
      return new Response("WORKER IS WORKING!", {
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
