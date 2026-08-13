export default {
  async fetch(request, env) {
    return new Response("HELLO FROM RADIAN WORKER");
  }
};
