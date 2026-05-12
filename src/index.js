import { SCHEMA_SQL } from "./schema.js";

const INIT_TOKEN = "setup-hockey-db-2026";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "MyHockeyBlog",
        message: "NEW SOURCE CODE IS DEPLOYED",
        build_marker: "browser-d1-installer-001",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/version") {
      return json({
        ok: true,
        version: "browser-d1-installer-001",
        message: "This is the updated src/index.js from GitHub main.",
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

    if (url.pathname === "/api/admin/init-db") {
      const token = url.searchParams.get("token");

      if (token !== INIT_TOKEN) {
        return json(
          {
            ok: false,
            error: "Unauthorized"
          },
          401
        );
      }

      const executed = [];

      try {
        for (let i = 0; i < SCHEMA_SQL.length; i++) {
          const statement = SCHEMA_SQL[i];

          const result = await env.DB
            .prepare(statement)
            .run();

          executed.push({
            index: i + 1,
            success: result.success === true,
            meta: result.meta || null
          });
        }

        const tables = await env.DB
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all();

        return json({
          ok: true,
          service: "MyHockeyBlog",
          message: "Database schema initialized successfully.",
          statements_executed: executed.length,
          tables: tables.results || []
        });
      } catch (error) {
        return json(
          {
            ok: false,
            service: "MyHockeyBlog",
            message: "Database schema initialization failed.",
            error: error.message,
            statements_executed_before_failure: executed.length,
            last_successful_statement: executed.length ? executed[executed.length - 1] : null
          },
          500
        );
      }
    }

    if (url.pathname === "/api/admin/tables") {
      const token = url.searchParams.get("token");

      if (token !== INIT_TOKEN) {
        return json(
          {
            ok: false,
            error: "Unauthorized"
          },
          401
        );
      }

      const tables = await env.DB
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all();

      return json({
        ok: true,
        tables: tables.results || []
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        {
          ok: false,
          error: "API route not found",
          path: url.pathname
        },
        404
      );
    }

    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
