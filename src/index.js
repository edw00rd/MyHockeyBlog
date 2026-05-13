const DEMO_USER_ID = "user_demo_001";
const DEMO_PROFILE_ID = "profile_demo_001";
const DEMO_USERNAME = "demo-skater";

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
        version: "0.8.1",
        message: "Chirp Watch added. Posts and comments can now be chirped. -replace getPosts fucntion",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/db-test") {
      return dbTest(env);
    }

    if (url.pathname === "/api/posts" && method === "GET") {
      return getPosts(env);
    }

    if (url.pathname === "/api/posts" && method === "POST") {
      return createPost(request, env);
    }
    const commentsMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
    
    if (commentsMatch && method === "GET") {
      return getComments(env, commentsMatch[1]);
    }
    
    if (commentsMatch && method === "POST") {
      return createComment(request, env, commentsMatch[1]);
    }

    const commentVoteMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/vote$/);

    if (commentVoteMatch && method === "POST") {
      return voteOnComment(request, env, commentVoteMatch[1]);
    }

    if (url.pathname === "/api/chirps" && method === "POST") {
      return createChirp(request, env);
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

async function dbTest(env) {
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
        profiles.jersey_number AS author_jersey_number,

        COALESCE(
          (
            SELECT GROUP_CONCAT(tags.name, ',')
            FROM post_tags
            JOIN tags ON tags.id = post_tags.tag_id
            WHERE post_tags.post_id = posts.id
          ),
          ''
        ) AS tags,

        (
          SELECT COUNT(*)
          FROM comments
          WHERE comments.post_id = posts.id
            AND comments.status = 'visible'
        ) AS comment_count,

        (
          SELECT COUNT(*)
          FROM content_chirps
          WHERE content_chirps.content_type = 'post'
            AND content_chirps.content_id = posts.id
            AND content_chirps.status = 'active'
        ) AS chirp_count,

        COALESCE(
          (
            SELECT 1
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.chirped_by_user_id = ?
              AND content_chirps.status = 'active'
            LIMIT 1
          ),
          0
        ) AS user_chirped

      FROM posts
      JOIN users ON users.id = posts.author_user_id
      LEFT JOIN profiles ON profiles.user_id = users.id
      WHERE posts.visibility = 'public'
        AND posts.status = 'published'
      ORDER BY posts.created_at DESC
      LIMIT 25
      `
    )
      .bind(DEMO_USER_ID)
      .all();

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

async function createPost(request, env) {
  try {
    const body = await readJsonBody(request);

    const title = String(body.title || "").trim();
    const content = String(body.body || "").trim();
    const postType = String(body.post_type || "progress").trim();
    const visibility = String(body.visibility || "public").trim();
    const commentsEnabled = body.comments_enabled === false ? 0 : 1;
    const rawTags = body.tags || "";

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

    await ensureDemoAuthor(env, now);

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
        DEMO_USER_ID,
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

    const savedTags = await savePostTags(env, postId, rawTags, DEMO_USER_ID, now);

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
          tags: savedTags,
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

async function getComments(env, postId) {
  try {
    const post = await env.DB.prepare(
      `
      SELECT id, comments_enabled
      FROM posts
      WHERE id = ?
        AND visibility = 'public'
        AND status = 'published'
      LIMIT 1
      `
    )
      .bind(postId)
      .first();

    if (!post) {
      return json(
        {
          ok: false,
          error: "Post not found."
        },
        404
      );
    }

    const result = await env.DB.prepare(
      `
      SELECT
        comments.id,
        comments.post_id,
        comments.author_user_id,
        comments.parent_comment_id,
        comments.body,
        comments.score,
        comments.status,
        comments.created_at,
        comments.updated_at,
        users.display_name AS author_display_name,
        profiles.username AS author_username,
        COALESCE(
          (
            SELECT comment_votes.vote_value
            FROM comment_votes
            WHERE comment_votes.comment_id = comments.id
              AND comment_votes.voter_user_id = ?
            LIMIT 1
          ),
          0
        ) AS user_vote,
        (
          SELECT COUNT(*)
          FROM content_chirps
          WHERE content_chirps.content_type = 'comment'
            AND content_chirps.content_id = comments.id
            AND content_chirps.status = 'active'
        ) AS chirp_count,
        COALESCE(
          (
            SELECT 1
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.chirped_by_user_id = ?
              AND content_chirps.status = 'active'
            LIMIT 1
          ),
          0
        ) AS user_chirped
      FROM comments
      LEFT JOIN users ON users.id = comments.author_user_id
      LEFT JOIN profiles ON profiles.user_id = users.id
      WHERE comments.post_id = ?
        AND comments.status = 'visible'
      ORDER BY comments.created_at ASC
      LIMIT 100
      `
    )
      .bind(DEMO_USER_ID, DEMO_USER_ID, postId)
      .all();

    return json({
      ok: true,
      post_id: postId,
      comments_enabled: Number(post.comments_enabled) === 1,
      comments: result.results || []
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load comments.",
        error: error.message
      },
      500
    );
  }
}

async function createComment(request, env, postId) {
  try {
    const body = await readJsonBody(request);
    const commentBody = String(body.body || "").trim();

    if (!commentBody) {
      return json(
        {
          ok: false,
          error: "Comment body is required."
        },
        400
      );
    }

    if (commentBody.length > 1000) {
      return json(
        {
          ok: false,
          error: "Comment is too long. Keep it under 1000 characters."
        },
        400
      );
    }

    const post = await env.DB.prepare(
      `
      SELECT id, comments_enabled
      FROM posts
      WHERE id = ?
        AND visibility = 'public'
        AND status = 'published'
      LIMIT 1
      `
    )
      .bind(postId)
      .first();

    if (!post) {
      return json(
        {
          ok: false,
          error: "Post not found."
        },
        404
      );
    }

    if (Number(post.comments_enabled) !== 1) {
      return json(
        {
          ok: false,
          error: "Comments are disabled for this post."
        },
        403
      );
    }

    const now = new Date().toISOString();

    await ensureDemoAuthor(env, now);

    const commentId = crypto.randomUUID();

    await env.DB.prepare(
      `
      INSERT INTO comments (
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
        commentId,
        postId,
        DEMO_USER_ID,
        null,
        commentBody,
        0,
        "visible",
        now,
        now
      )
      .run();

    return json(
      {
        ok: true,
        message: "Comment created successfully.",
        comment: {
          id: commentId,
          post_id: postId,
          author_user_id: DEMO_USER_ID,
          body: commentBody,
          score: 0,
          status: "visible",
          created_at: now
        }
      },
      201
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to create comment.",
        error: error.message
      },
      500
    );
  }
}

async function voteOnComment(request, env, commentId) {
  try {
    const body = await readJsonBody(request);
    const requestedVote = Number(body.vote_value);

    if (![1, -1].includes(requestedVote)) {
      return json(
        {
          ok: false,
          error: "vote_value must be 1 for upvote or -1 for downvote."
        },
        400
      );
    }

    const comment = await env.DB.prepare(
      `
      SELECT
        comments.id,
        comments.post_id,
        comments.status,
        posts.visibility,
        posts.status AS post_status
      FROM comments
      JOIN posts ON posts.id = comments.post_id
      WHERE comments.id = ?
      LIMIT 1
      `
    )
      .bind(commentId)
      .first();

    if (!comment || comment.status !== "visible" || comment.visibility !== "public" || comment.post_status !== "published") {
      return json(
        {
          ok: false,
          error: "Comment not found."
        },
        404
      );
    }

    const now = new Date().toISOString();

    await ensureDemoAuthor(env, now);

    const existingVote = await env.DB.prepare(
      `
      SELECT id, vote_value
      FROM comment_votes
      WHERE comment_id = ?
        AND voter_user_id = ?
      LIMIT 1
      `
    )
      .bind(commentId, DEMO_USER_ID)
      .first();

    let userVote = requestedVote;

    if (existingVote && Number(existingVote.vote_value) === requestedVote) {
      // Same vote clicked twice = remove vote.
      await env.DB.prepare(
        `
        DELETE FROM comment_votes
        WHERE id = ?
        `
      )
        .bind(existingVote.id)
        .run();

      userVote = 0;
    } else if (existingVote) {
      // Switch upvote to downvote, or downvote to upvote.
      await env.DB.prepare(
        `
        UPDATE comment_votes
        SET vote_value = ?, updated_at = ?
        WHERE id = ?
        `
      )
        .bind(requestedVote, now, existingVote.id)
        .run();
    } else {
      // New vote.
      await env.DB.prepare(
        `
        INSERT INTO comment_votes (
          id,
          comment_id,
          voter_user_id,
          voter_fingerprint,
          vote_value,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
        .bind(
          crypto.randomUUID(),
          commentId,
          DEMO_USER_ID,
          null,
          requestedVote,
          now,
          now
        )
        .run();
    }

    const scoreRow = await env.DB.prepare(
      `
      SELECT COALESCE(SUM(vote_value), 0) AS score
      FROM comment_votes
      WHERE comment_id = ?
      `
    )
      .bind(commentId)
      .first();

    const score = Number(scoreRow?.score || 0);

    await env.DB.prepare(
      `
      UPDATE comments
      SET score = ?, updated_at = ?
      WHERE id = ?
      `
    )
      .bind(score, now, commentId)
      .run();

    return json({
      ok: true,
      message: "Vote saved.",
      comment_id: commentId,
      score,
      user_vote: userVote
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to vote on comment.",
        error: error.message
      },
      500
    );
  }
}

async function createChirp(request, env) {
  try {
    const body = await readJsonBody(request);

    const contentType = String(body.content_type || "").trim();
    const contentId = String(body.content_id || "").trim();
    const reason = String(body.reason || "other").trim();
    const note = String(body.note || "").trim();

    const allowedContentTypes = ["post", "comment"];
    const allowedReasons = [
      "too_personal",
      "targeted_bullying",
      "trash_talk_too_far",
      "spam_trolling",
      "other"
    ];

    if (!allowedContentTypes.includes(contentType)) {
      return json(
        {
          ok: false,
          error: "content_type must be 'post' or 'comment'."
        },
        400
      );
    }

    if (!contentId) {
      return json(
        {
          ok: false,
          error: "content_id is required."
        },
        400
      );
    }

    const safeReason = allowedReasons.includes(reason) ? reason : "other";
    const safeNote = note.slice(0, 500);
    const now = new Date().toISOString();

    await ensureDemoAuthor(env, now);

    const contentExists = await verifyChirpContentExists(env, contentType, contentId);

    if (!contentExists) {
      return json(
        {
          ok: false,
          error: "Content not found."
        },
        404
      );
    }

    const existing = await env.DB.prepare(
      `
      SELECT id, status
      FROM content_chirps
      WHERE content_type = ?
        AND content_id = ?
        AND chirped_by_user_id = ?
      LIMIT 1
      `
    )
      .bind(contentType, contentId, DEMO_USER_ID)
      .first();

    let userChirped = true;

    if (existing && existing.status === "active") {
      // Clicking Chirp again removes the user's chirp.
      await env.DB.prepare(
        `
        UPDATE content_chirps
        SET status = 'dismissed',
            updated_at = ?
        WHERE id = ?
        `
      )
        .bind(now, existing.id)
        .run();

      userChirped = false;
    } else if (existing) {
      // Re-activate a previously dismissed chirp.
      await env.DB.prepare(
        `
        UPDATE content_chirps
        SET reason = ?,
            note = ?,
            status = 'active',
            updated_at = ?
        WHERE id = ?
        `
      )
        .bind(safeReason, safeNote, now, existing.id)
        .run();
    } else {
      await env.DB.prepare(
        `
        INSERT INTO content_chirps (
          id,
          content_type,
          content_id,
          chirped_by_user_id,
          reason,
          note,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
        .bind(
          crypto.randomUUID(),
          contentType,
          contentId,
          DEMO_USER_ID,
          safeReason,
          safeNote,
          "active",
          now,
          now
        )
        .run();
    }

    const countRow = await env.DB.prepare(
      `
      SELECT COUNT(*) AS chirp_count
      FROM content_chirps
      WHERE content_type = ?
        AND content_id = ?
        AND status = 'active'
      `
    )
      .bind(contentType, contentId)
      .first();

    const chirpCount = Number(countRow?.chirp_count || 0);

    return json({
      ok: true,
      message: userChirped ? "Content chirped." : "Chirp removed.",
      content_type: contentType,
      content_id: contentId,
      chirp_count: chirpCount,
      user_chirped: userChirped,
      chirp_status: getChirpStatus(chirpCount)
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to chirp content.",
        error: error.message
      },
      500
    );
  }
}

async function verifyChirpContentExists(env, contentType, contentId) {
  if (contentType === "post") {
    const post = await env.DB.prepare(
      `
      SELECT id
      FROM posts
      WHERE id = ?
        AND visibility = 'public'
        AND status = 'published'
      LIMIT 1
      `
    )
      .bind(contentId)
      .first();

    return Boolean(post);
  }

  if (contentType === "comment") {
    const comment = await env.DB.prepare(
      `
      SELECT
        comments.id
      FROM comments
      JOIN posts ON posts.id = comments.post_id
      WHERE comments.id = ?
        AND comments.status = 'visible'
        AND posts.visibility = 'public'
        AND posts.status = 'published'
      LIMIT 1
      `
    )
      .bind(contentId)
      .first();

    return Boolean(comment);
  }

  return false;
}

function getChirpStatus(chirpCount) {
  if (chirpCount >= 5) return "sent_to_the_box";
  if (chirpCount >= 3) return "chirp_watch";
  return "normal";
}

async function getProfileByUsername(env, username) {
  try {
    if (username === DEMO_USERNAME) {
      await ensureDemoAuthor(env, new Date().toISOString());
    }

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
        posts.created_at,
        COALESCE(
          (
            SELECT GROUP_CONCAT(tag_rows.name, ',')
            FROM (
              SELECT tags.name
              FROM post_tags
              JOIN tags ON tags.id = post_tags.tag_id
              WHERE post_tags.post_id = posts.id
              ORDER BY tags.name
            ) AS tag_rows
          ),
          ''
        ) AS tags
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

async function ensureDemoAuthor(env, now) {
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
      DEMO_USER_ID,
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
      DEMO_PROFILE_ID,
      DEMO_USER_ID,
      DEMO_USERNAME,
      "Demo Skater",
      "Adult hockey player tracking progress, ice sessions, games, photos, videos, and skill development.",
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
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function parseTags(rawTags) {
  if (!rawTags) return [];

  const value = Array.isArray(rawTags) ? rawTags.join(",") : String(rawTags);
  const seenSlugs = new Set();
  const parsedTags = [];

  for (const item of value.split(",")) {
    const name = item
      .trim()
      .replace(/^#/, "")
      .replace(/\s+/g, " ")
      .slice(0, 32);

    if (!name) continue;

    const slug = slugifyTag(name);

    if (!slug || seenSlugs.has(slug)) continue;

    seenSlugs.add(slug);
    parsedTags.push({ name, slug });
  }

  return parsedTags.slice(0, 10);
}

function slugifyTag(tag) {
  return String(tag)
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function savePostTags(env, postId, rawTags, createdByUserId, now) {
  const tags = parseTags(rawTags);
  const savedTags = [];

  for (const tag of tags) {
    const preferredTagId = `tag_${tag.slug}`;

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
      .bind(preferredTagId, tag.name, tag.slug, createdByUserId, now)
      .run();

    const existingTag = await env.DB.prepare(
      `
      SELECT id, name, slug
      FROM tags
      WHERE slug = ?
      LIMIT 1
      `
    )
      .bind(tag.slug)
      .first();

    if (!existingTag) continue;

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
      .bind(`post_tag_${crypto.randomUUID()}`, postId, existingTag.id, now)
      .run();

    savedTags.push({
      name: existingTag.name,
      slug: existingTag.slug
    });
  }

  return savedTags;
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
