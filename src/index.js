export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "MyHockeyBlog",
        message: "Worker API is alive.",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/db-test") {
      try {
        const result = await env.DB
          .prepare("SELECT 1 AS ok, datetime('now') AS checked_at")
          .first();

        return json({
          ok: true,
          service: "MyHockeyBlog",
          database: "hockey_blog_db",
          message: "D1 database connection is working.",
          result
        });
      } catch (error) {
        return json(
          {
            ok: false,
            service: "MyHockeyBlog",
            message: "D1 database connection failed.",
            error: error.message
          },
          500
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
