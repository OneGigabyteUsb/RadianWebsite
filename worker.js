export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API routes
    if (url.pathname === "/api/login" && request.method === "POST") {
      return new Response("LOGIN ROUTE WORKS");
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      return new Response("ME ROUTE WORKS");
    }

    // Everything else goes to your website
    return env.ASSETS.fetch(request);
  }
};
