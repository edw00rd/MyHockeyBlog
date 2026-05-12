export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "MyHockeyBlog",
        message: "Worker API is alive.",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/version") {
      return json({
        ok: true,
        version: "0.4.1",
        message: "POST /api/posts added. Posts can now be saved to D1.",
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

    if (url.pathname === "/api/posts" && method === "GET") {
      return getPosts(env);
    }

    if (url.pathname === "/api/posts" && method === "POST") {
      return createPost(request, env);
    }

    if (url.pathname.startsWith("/api/profile/") && method === "GET") {
      const username = decodeURIComponent(
        url.pathname.replace("/api/profile/", "").trim()
      );

      if (!username) {
        return json(
          {
            ok: false,
            error: "Missing username"
          },
          400
        );
      }

      return getProfileByUsername(env, username);
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

async function getPosts(env) {
  try {
    const result = await env.DB.prepare(
      `
      SELECT
        posts.id,
        posts.title,
        posts.body,
        posts.post_type,
        posts.visibility,
        posts.comments_enabled,
        posts.status,
        posts.published_at,
        posts.created_at,
        posts.updated_at,
        users.display_name AS author_display_name,
        profiles.username AS author_username,
        profiles.position AS author_position,
        profiles.jersey_number AS author_jersey_number
      FROM posts
      JOIN users ON users.id = posts.author_user_id
      LEFT JOIN profiles ON profiles.user_id = users.id
      WHERE posts.visibility = 'public'
        AND posts.status = 'published'
      ORDER BY posts.created_at DESC
      LIMIT 25
      `
    ).all();

    return json({
      ok: true,
      posts: result.results || []
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load posts.",
        error: error.message
      },
      500
    );
  }
}

async function getProfileByUsername(env, username) {
  try {
    const profile = await env.DB.prepare(
      `
      SELECT
        profiles.id,
        profiles.user_id,
        profiles.username,
        profiles.display_name,
        profiles.bio,
        profiles.position,
        profiles.shoots,
        profiles.jersey_number,
        profiles.team_name,
        profiles.home_rink,
        profiles.skill_level,
        profiles.profile_visibility,
        profiles.show_stats_publicly,
        profiles.show_calendar_publicly,
        profiles.allow_post_tagging,
        profiles.allow_media_tagging,
        profiles.require_tag_approval,
        profiles.created_at,
        profiles.updated_at
      FROM profiles
      WHERE profiles.username = ?
        AND profiles.profile_visibility = 'public'
      LIMIT 1
      `
    )
      .bind(username)
      .first();

    if (!profile) {
      return json(
        {
          ok: false,
          error: "Profile not found"
        },
        404
      );
    }

    const posts = await env.DB.prepare(
      `
      SELECT
        posts.id,
        posts.title,
        posts.body,
        posts.post_type,
        posts.visibility,
        posts.comments_enabled,
        posts.status,
        posts.published_at,
        posts.created_at
      FROM posts
      WHERE posts.author_user_id = ?
        AND posts.visibility = 'public'
        AND posts.status = 'published'
      ORDER BY posts.created_at DESC
      LIMIT 10
      `
    )
      .bind(profile.user_id)
      .all();

    const stats = await env.DB.prepare(
      `
      SELECT
        COUNT(*) AS games_played,
        COALESCE(SUM(goals), 0) AS goals,
        COALESCE(SUM(assists), 0) AS assists,
        COALESCE(SUM(points), 0) AS points,
        COALESCE(SUM(shots_on_goal), 0) AS shots_on_goal,
        COALESCE(SUM(blocked_shots), 0) AS blocked_shots,
        COALESCE(SUM(penalty_minutes), 0) AS penalty_minutes
      FROM game_stats
      WHERE user_id = ?
      `
    )
      .bind(profile.user_id)
      .first();

    return json({
      ok: true,
      profile,
      posts: posts.results || [],
      stats: profile.show_stats_publicly ? stats : null
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load profile.",
        error: error.message
      },
      500
    );
  }
}

async function createPost(request, env) {
  try {
    const body = await request.json();

    const title = String(body.title || "").trim();
    const content = String(body.body || "").trim();
    const postType = String(body.post_type || "progress").trim();
    const visibility = String(body.visibility || "public").trim();
    const commentsEnabled = body.comments_enabled === false ? 0 : 1;

    // Temporary demo author until real auth/login exists.
    const demoUserId = "user_demo_001";

    if (!title) {
      return json(
        {
          ok: false,
          error: "Post title is required."
        },
        400
      );
    }

    if (!content) {
      return json(
        {
          ok: false,
          error: "Post body is required."
        },
        400
      );
    }

    const allowedTypes = ["progress", "game", "practice", "gear", "training", "general"];
    const allowedVisibility = ["public", "private", "unlisted"];

    const safePostType = allowedTypes.includes(postType) ? postType : "progress";
    const safeVisibility = allowedVisibility.includes(visibility) ? visibility : "public";

    const now = new Date().toISOString();
    const postId = crypto.randomUUID();

    await env.DB.prepare(
      `
      INSERT INTO posts (
        id,
        author_user_id,
        title,
        body,
        post_type,
        visibility,
        comments_enabled,
        status,
        published_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        postId,
        demoUserId,
        title,
        content,
        safePostType,
        safeVisibility,
        commentsEnabled,
        "published",
        now,
        now,
        now
      )
      .run();

    return json(
      {
        ok: true,
        message: "Post created successfully.",
        post: {
          id: postId,
          title,
          body: content,
          post_type: safePostType,
          visibility: safeVisibility,
          comments_enabled: commentsEnabled === 1,
          published_at: now
        }
      },
      201
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to create post.",
        error: error.message
      },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
