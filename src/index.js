const json = (data, init = {}) => {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "MyHockeyBlog",
        message: "Worker API is alive. Next step: connect D1, R2, auth, and real persistence."
      });
    }

    if (url.pathname === "/api/version") {
      return json({
        name: "my-hockey-blog",
        version: "0.1.0",
        stack: ["Cloudflare Workers", "Static Assets", "Vanilla HTML/CSS/JS"]
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
