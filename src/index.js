const SEED_TOKEN = "seed-hockey-demo-2026";

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
        version: "0.3.0",
        message: "Demo D1 API routes added.",
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

    // Temporary development route.
    // Use once to create demo data in D1.
    if (url.pathname === "/api/dev/seed" && method === "GET") {
      const token = url.searchParams.get("token");

      if (token !== SEED_TOKEN) {
        return json(
          {
            ok: false,
            error: "Unauthorized"
          },
          401
        );
      }

      return seedDemoData(env);
    }

    // Get recent public posts.
    if (url.pathname === "/api/posts" && method === "GET") {
      return getPosts(env);
    }

    // Get a public profile by username.
    // Example: /api/profile/demo-skater
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

async function seedDemoData(env) {
  const now = new Date().toISOString();

  const demoUserId = "user_demo_001";
  const demoProfileId = "profile_demo_001";
  const demoPostId = "post_demo_001";
  const demoEventId = "event_demo_001";
  const demoStatsId = "stats_demo_001";
  const demoTagId = "tag_demo_progress";
  const demoPostTagId = "post_tag_demo_001";
  const demoCommentId = "comment_demo_001";

  try {
    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO users (
        id,
        email,
        display_name,
        auth_provider,
        auth_provider_user_id,
        role,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        demoUserId,
        "demo@example.com",
        "Demo Skater",
        "demo",
        "demo-user-001",
        "user",
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO profiles (
        id,
        user_id,
        username,
        display_name,
        bio,
        position,
        shoots,
        jersey_number,
        team_name,
        home_rink,
        skill_level,
        profile_visibility,
        show_stats_publicly,
        show_calendar_publicly,
        allow_post_tagging,
        allow_media_tagging,
        require_tag_approval,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        demoProfileId,
        demoUserId,
        "demo-skater",
        "Demo Skater",
        "Adult hockey player tracking progress, ice sessions, games, and skill development.",
        "Wing",
        "right",
        "00",
        "MyHockeyBlog Demo Team",
        "Demo Ice Arena",
        "Beginner / beer league",
        "public",
        1,
        1,
        1,
        1,
        1,
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO posts (
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
        demoPostId,
        demoUserId,
        "First progress post",
        "Today I created my hockey progress blog infrastructure. Next step: start logging ice sessions, game stats, photos, and videos.",
        "progress",
        "public",
        1,
        "published",
        now,
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO calendar_events (
        id,
        owner_user_id,
        title,
        description,
        event_type,
        starts_at,
        ends_at,
        location,
        opponent,
        home_away,
        visibility,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        demoEventId,
        demoUserId,
        "Demo beer league game",
        "Sample calendar event connected to game stats.",
        "game",
        now,
        null,
        "Demo Ice Arena",
        "Demo Opponent",
        "home",
        "public",
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO game_stats (
        id,
        event_id,
        user_id,
        goals,
        assists,
        points,
        plus_minus,
        shots_on_goal,
        hits,
        blocked_shots,
        penalty_minutes,
        result,
        team_score,
        opponent_score,
        notes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        demoStatsId,
        demoEventId,
        demoUserId,
        1,
        1,
        2,
        1,
        4,
        0,
        1,
        0,
        "win",
        5,
        3,
        "Demo stat line for testing the game stats table.",
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO tags (
        id,
        name,
        slug,
        created_by_user_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
      `
    )
      .bind(
        demoTagId,
        "progress",
        "progress",
        demoUserId,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO post_tags (
        id,
        post_id,
        tag_id,
        created_at
      )
      VALUES (?, ?, ?, ?)
      `
    )
      .bind(
        demoPostTagId,
        demoPostId,
        demoTagId,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO comments (
        id,
        post_id,
        author_user_id,
        parent_comment_id,
        body,
        score,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        demoCommentId,
        demoPostId,
        demoUserId,
        null,
        "Demo comment: nice work getting the infrastructure online.",
        1,
        "visible",
        now,
        now
      )
      .run();

    return json({
      ok: true,
      message: "Demo data seeded successfully.",
      demo_urls: {
        posts: "/api/posts",
        profile: "/api/profile/demo-skater"
      }
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Demo seed failed.",
        error: error.message
      },
      500
    );
  }
}

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
