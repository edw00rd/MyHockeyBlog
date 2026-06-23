const DEMO_USER_ID = "user_demo_001";
const DEMO_PROFILE_ID = "profile_demo_001";
const DEMO_USERNAME = "demo-skater";

const RENT_A_REF_USER_ID = "user_rent_a_ref_001";
const RENT_A_REF_PROFILE_ID = "profile_rent_a_ref_001";
const RENT_A_REF_USERNAME = "rent-a-ref";

const REVIEW_REQUIRED_VOTES = 3; // Max review slots / best-of-3 capacity.
const REVIEW_DECISION_THRESHOLD = 2; // First side to 2 wins.
const REVIEW_TOKEN_TIMEOUT_MINUTES = 10;
const REVIEW_ACTING_USER_ID = DEMO_USER_ID; // Temporary until login/auth exists.

const TERMS_VERSION = "2026-06-23-v1";

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "media-src 'self' https:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join("; "),
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

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
        version: "0.21.0",
        message: "Threaded Comments v1 added.",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/db-test") {
      return dbTest(env);
    }

    if (url.pathname === "/api/me" && method === "GET") {
      return getMe(request, env);
    }
    
    if (url.pathname === "/api/users" && method === "GET") {
      return listUsers(env);
    }
    
    if (url.pathname === "/api/users" && method === "POST") {
      return createUser(request, env);
    }

    if (url.pathname === "/api/posts" && method === "GET") {
      return getPosts(request, env);
    }

    if (url.pathname === "/api/posts" && method === "POST") {
      return createPost(request, env);
    }
    const commentsMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
    
    if (commentsMatch && method === "GET") {
      return getComments(request, env, commentsMatch[1]);
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
  
    if (url.pathname === "/api/reviews" && method === "GET") {
      return getOpenReviews(request, env);
    }
    
    const reviewCheckoutMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)\/checkout$/);
    
    if (reviewCheckoutMatch && method === "POST") {
      return checkoutReview(request, env, reviewCheckoutMatch[1]);
    }
    
    const reviewVoteMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)\/vote$/);
    
    if (reviewVoteMatch && method === "POST") {
      return castReviewVote(request, env, reviewVoteMatch[1]);
    }
    
    const karmaMatch = url.pathname.match(/^\/api\/profile\/([^/]+)\/karma$/);
    
    if (karmaMatch && method === "GET") {
      const username = decodeURIComponent(karmaMatch[1]);
    
      if (!username) {
        return json(
          {
            ok: false,
            error: "Missing username"
          },
          400
        );
      }
    
      return getProfileKarma(env, username);
    }

    const communityVibeMatch = url.pathname.match(/^\/api\/profile\/([^/]+)\/community-vibe$/);
    
    if (communityVibeMatch && method === "GET") {
      const username = decodeURIComponent(communityVibeMatch[1]);
    
      if (!username) {
        return json(
          {
            ok: false,
            error: "Missing username"
          },
          400
        );
      }
    
      return getProfileCommunityVibe(env, username);
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

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
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

function getCurrentUserId(request) {
  const headerUserId = String(request.headers.get("x-demo-user-id") || "").trim();

  if (headerUserId) {
    return headerUserId;
  }

  return DEMO_USER_ID;
}

async function getCurrentUser(request, env) {
  const currentUserId = getCurrentUserId(request);
  const now = new Date().toISOString();

  if (currentUserId === DEMO_USER_ID) {
    await ensureDemoAuthor(env, now);
  }

  const user = await env.DB.prepare(
    `
    SELECT
      users.id AS user_id,
      users.display_name,
      users.role,
      profiles.id AS profile_id,
      profiles.username,
      profiles.position,
      profiles.jersey_number,
      profiles.leadership_role,
      profiles.team_name,
      profiles.skill_level
    FROM users
    LEFT JOIN profiles ON profiles.user_id = users.id
    WHERE users.id = ?
    LIMIT 1
    `
  )
    .bind(currentUserId)
    .first();

  if (!user) {
    throw new Error("Selected user does not exist.");
  }

  return user;
}

function getLeadershipAccess(user = {}) {
  const leadershipRole = String(user.leadership_role || "none")
    .toLowerCase()
    .trim();

  const position = String(user.position || "").toLowerCase();
  const role = String(user.role || "").toLowerCase().trim();

  const isAdmin = role === "admin" || role === "owner";
  const isGoalie = position === "goalie";

  if (isGoalie) {
    return {
      tier: "member",
      label: "Member",
      letter: null,
      can_review_content: false,
      can_review_accounts: false
    };
  }

  if (isAdmin || leadershipRole === "captain") {
    return {
      tier: "captain",
      label: "Captain",
      letter: "C",
      can_review_content: true,
      can_review_accounts: true
    };
  }

  if (leadershipRole === "alternate_captain") {
    return {
      tier: "alternate_captain",
      label: "Alternate Captain",
      letter: "A",
      can_review_content: true,
      can_review_accounts: false
    };
  }

  return {
    tier: "member",
    label: "Member",
    letter: null,
    can_review_content: false,
    can_review_accounts: false
  };
}

function leadershipForbiddenResponse() {
  return json(
    {
      ok: false,
      error: "Leadership review access required.",
      message: "Only Captains and Alternate Captains can review Situation Room cases."
    },
    403
  );
}

async function getMe(request, env) {
  try {
    const user = await getCurrentUser(request, env);

    return json({
      ok: true,
      user: {
        ...user,
        leadership_access: getLeadershipAccess(user)
      }
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load current user.",
        error: error.message
      },
      500
    );
  }
}

async function listUsers(env) {
  try {
    const now = new Date().toISOString();

    await ensureDemoAuthor(env, now);

    const result = await env.DB.prepare(
      `
      SELECT
        users.id AS user_id,
        users.display_name,
        users.role,
        profiles.id AS profile_id,
        profiles.username,
        profiles.position,
        profiles.jersey_number,
        profiles.leadership_role,
        profiles.team_name,
        profiles.skill_level,
        profiles.created_at
      FROM users
      LEFT JOIN profiles ON profiles.user_id = users.id
      WHERE users.id <> ?
      ORDER BY profiles.created_at ASC, users.created_at ASC
      `
    )
      .bind(RENT_A_REF_USER_ID)
      .all();

    return json({
      ok: true,
      users: (result.results || []).map((user) => ({
        ...user,
        leadership_access: getLeadershipAccess(user)
      }))
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load users.",
        error: error.message
      },
      500
    );
  }
}

function normalizePlainText(value = "", maxLength = 1000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function containsHtmlLikeMarkup(value = "") {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function containsSuspiciousProtocol(value = "") {
  return /\b(javascript|data|vbscript|file|blob|chrome|about):/i.test(String(value || ""));
}

function containsSuspiciousScriptPattern(value = "") {
  const text = String(value || "");

  return (
    /<\s*script/i.test(text) ||
    /\bon[a-z]+\s*=/i.test(text) ||
    /srcdoc\s*=/i.test(text) ||
    /document\.cookie/i.test(text) ||
    /localStorage/i.test(text) ||
    /sessionStorage/i.test(text)
  );
}

function validatePlainUserText(value, {
  fieldName = "Text",
  minLength = 1,
  maxLength = 1000,
  allowLinks = true
} = {}) {
  const original = String(value || "");
  const text = normalizePlainText(original, maxLength);

  if (text.length < minLength) {
    return {
      ok: false,
      error: `${fieldName} is required.`
    };
  }

  if (original.trim().length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} is too long. Keep it under ${maxLength} characters.`
    };
  }

  if (containsHtmlLikeMarkup(text)) {
    return {
      ok: false,
      error: `${fieldName} cannot contain HTML.`
    };
  }

  if (containsSuspiciousProtocol(text) || containsSuspiciousScriptPattern(text)) {
    return {
      ok: false,
      error: `${fieldName} contains unsafe content.`
    };
  }

  if (!allowLinks && /(https?:\/\/|www\.|\.com\b|\.net\b|\.org\b|\.io\b)/i.test(text)) {
    return {
      ok: false,
      error: `${fieldName} cannot contain links.`
    };
  }

  return {
    ok: true,
    value: text
  };
}

function validateTagsInput(rawTags) {
  const raw = String(rawTags || "");

  if (raw.length > 300) {
    return {
      ok: false,
      error: "Tags are too long. Keep the tag field under 300 characters."
    };
  }

  if (containsHtmlLikeMarkup(raw) || containsSuspiciousProtocol(raw) || containsSuspiciousScriptPattern(raw)) {
    return {
      ok: false,
      error: "Tags contain unsafe content."
    };
  }

  const parts = raw
    .split(/[,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);

  if (parts.length > 12) {
    return {
      ok: false,
      error: "Use 12 tags or fewer."
    };
  }

  for (const tag of parts) {
    if (tag.length < 2 || tag.length > 24) {
      return {
        ok: false,
        error: "Each tag must be 2 to 24 characters."
      };
    }

    if (!/^[a-z0-9-]+$/i.test(tag)) {
      return {
        ok: false,
        error: "Tags can only use letters, numbers, and hyphens."
      };
    }
  }

  return {
    ok: true,
    value: parts.join(",")
  };
}

function validateMediaUrlInput(value = "") {
  const raw = String(value || "").trim();

  if (!raw) {
    return {
      ok: true,
      value: ""
    };
  }

  if (raw.length > 500) {
    return {
      ok: false,
      error: "Media URL or note is too long. Keep it under 500 characters."
    };
  }

  if (containsHtmlLikeMarkup(raw) || containsSuspiciousProtocol(raw) || containsSuspiciousScriptPattern(raw)) {
    return {
      ok: false,
      error: "Media URL or note contains unsafe content."
    };
  }

  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(raw);

  if (!looksLikeUrl) {
    return {
      ok: true,
      value: raw
    };
  }

  let url;

  try {
    url = new URL(raw.startsWith("www.") ? `https://${raw}` : raw);
  } catch {
    return {
      ok: false,
      error: "Media URL is not a valid URL."
    };
  }

  if (!["https:"].includes(url.protocol)) {
    return {
      ok: false,
      error: "Media URL must use https."
    };
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  const isYouTube =
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "youtu.be" ||
    hostname === "www.youtu.be" ||
    hostname === "youtube-nocookie.com" ||
    hostname === "www.youtube-nocookie.com";

  const isDirectImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(pathname);
  const isDirectVideo = /\.(mp4|webm|mov)$/i.test(pathname);

  if (!isYouTube && !isDirectImage && !isDirectVideo) {
    return {
      ok: false,
      error: "Media URL must be YouTube, a direct image URL, or a direct video URL."
    };
  }

  return {
    ok: true,
    value: url.toString()
  };
}

function requireCommunityTermsAccepted(body = {}) {
  if (
    body.terms_accepted !== true &&
    body.terms_accepted !== "true" &&
    body.terms_accepted !== "on"
  ) {
    return {
      ok: false,
      error: "You must accept the community terms before creating an account."
    };
  }

  return {
    ok: true
  };
}

async function createUser(request, env) {
  try {
    const body = await readJsonBody(request);

    const termsResult = requireCommunityTermsAccepted(body);

    if (!termsResult.ok) {
      return json(
        {
          ok: false,
          error: termsResult.error,
          terms_version: TERMS_VERSION
        },
        400
      );
    }
    
    const displayNameResult = validatePlainUserText(body.display_name, {
      fieldName: "Display name",
      minLength: 1,
      maxLength: 60,
      allowLinks: false
    });
    
    if (!displayNameResult.ok) {
      return json(
        {
          ok: false,
          error: displayNameResult.error
        },
        400
      );
    }
    
    const displayName = displayNameResult.value;
    const requestedUsername = String(body.username || displayName || "").trim();
    const username = slugifyUsername(requestedUsername);

    const positionResult = normalizeHockeyPosition(body.position);
    const jerseyResult = normalizeJerseyNumber(body.jersey_number);
    const leadershipResult = normalizeLeadershipRole(body.leadership_role, positionResult.position);

    const teamNameResult = validatePlainUserText(body.team_name || "MyHockeyBlog Test Team", {
      fieldName: "Team name",
      minLength: 1,
      maxLength: 80,
      allowLinks: false
    });
    
    if (!teamNameResult.ok) {
      return json(
        {
          ok: false,
          error: teamNameResult.error
        },
        400
      );
    }
    
    const teamName = teamNameResult.value;
    const skillLevel = "Demo user";

    if (!username) {
      return json(
        {
          ok: false,
          error: "A valid username is required."
        },
        400
      );
    }

    if (!positionResult.ok) {
      return json(
        {
          ok: false,
          error: positionResult.error,
          allowed_positions: positionResult.allowed_positions
        },
        400
      );
    }

    if (!jerseyResult.ok) {
      return json(
        {
          ok: false,
          error: jerseyResult.error
        },
        400
      );
    }

    if (!leadershipResult.ok) {
      return json(
        {
          ok: false,
          error: leadershipResult.error,
          allowed_leadership_roles: leadershipResult.allowed_leadership_roles
        },
        400
      );
    }

    const existing = await env.DB.prepare(
      `
      SELECT user_id, username
      FROM profiles
      WHERE username = ?
      LIMIT 1
      `
    )
      .bind(username)
      .first();

    if (existing) {
      return json(
        {
          ok: false,
          error: "Username is already taken."
        },
        409
      );
    }

    const now = new Date().toISOString();
    const userId = `user_${crypto.randomUUID()}`;
    const profileId = `profile_${crypto.randomUUID()}`;

    await env.DB.prepare(
      `
      INSERT INTO users (
        id,
        email,
        display_name,
        auth_provider,
        auth_provider_user_id,
        role,
        terms_accepted_at,
        terms_version,
        community_guidelines_accepted_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        userId,
        `${username}@example.com`,
        displayName,
        "demo",
        `demo-${userId}`,
        "user",
        now,
        TERMS_VERSION,
        now,
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `
      INSERT INTO profiles (
        id,
        user_id,
        username,
        display_name,
        bio,
        position,
        shoots,
        jersey_number,
        leadership_role,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        profileId,
        userId,
        username,
        displayName,
        "Demo user account for MyHockeyBlog testing.",
        positionResult.position,
        null,
        jerseyResult.jersey_number,
        leadershipResult.leadership_role,
        teamName,
        "Demo Ice Arena",
        skillLevel,
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

    return json(
      {
        ok: true,
        user: {
          user_id: userId,
          profile_id: profileId,
          username,
          display_name: displayName,
          position: positionResult.position,
          jersey_number: jerseyResult.jersey_number,
          leadership_role: leadershipResult.leadership_role,
          leadership_label: leadershipResult.label,
          team_name: teamName,
          skill_level: skillLevel,
          jersey_warnings: jerseyResult.warnings
        }
      },
      201
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to create user.",
        error: error.message
      },
      500
    );
  }
}

async function getPosts(request, env) {
  try {
    const currentUser = await getCurrentUser(request, env);
    const result = await env.DB.prepare(
      `
      SELECT
        posts.id,
        posts.title,
        posts.body,
        COALESCE(posts.media_url, '') AS media_url,
        posts.post_type,
        posts.visibility,
        posts.comments_enabled,
        posts.status,
        posts.published_at,
        posts.created_at,
        posts.updated_at,
        COALESCE(posts.moderation_status, 'visible') AS moderation_status,
        COALESCE(posts.moderation_reason, '') AS moderation_reason,
        posts.moderated_at,
        posts.moderated_by_user_id,
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

        COALESCE(
          (
            SELECT MAX(comments.created_at)
            FROM comments
            WHERE comments.post_id = posts.id
              AND comments.status = 'visible'
              AND comments.author_user_id = ?
          ),
          ''
        ) AS last_rent_a_ref_at,

        COALESCE(
          (
            SELECT MAX(comments.created_at)
            FROM comments
            WHERE comments.post_id = posts.id
              AND comments.status = 'visible'
              AND comments.author_user_id <> ?
          ),
          ''
        ) AS last_non_ref_comment_at,

        (
          SELECT COUNT(*)
          FROM content_chirps
          WHERE content_chirps.content_type = 'post'
            AND content_chirps.content_id = posts.id
            AND content_chirps.status = 'active'
        ) AS chirp_count,

        COALESCE(
          (
            SELECT ROUND(AVG(helpful_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS helpful_score,

        COALESCE(
          (
            SELECT ROUND(AVG(funny_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS funny_score,

        COALESCE(
          (
            SELECT ROUND(AVG(heat_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS heat_score,

        COALESCE(
          (
            SELECT ROUND(AVG(rude_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS rude_score,

        COALESCE(
          (
            SELECT ROUND(AVG(targeted_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS targeted_score,

        COALESCE(
          (
            SELECT ROUND(AVG(spam_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS spam_score,

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
        ) AS user_chirped,

        COALESCE(
          (
            SELECT content_chirps.chirp_type
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.chirped_by_user_id = ?
              AND content_chirps.status = 'active'
            LIMIT 1
          ),
          ''
        ) AS user_chirp_type,
        
        COALESCE(
          (
            SELECT COALESCE(content_chirps.updated_at, content_chirps.created_at)
            FROM content_chirps
            WHERE content_chirps.content_type = 'post'
              AND content_chirps.content_id = posts.id
              AND content_chirps.chirped_by_user_id = ?
              AND content_chirps.status = 'active'
            LIMIT 1
          ),
          ''
        ) AS user_chirp_at,
        
        COALESCE(
          (
            SELECT rent_a_ref_calls.called_at
            FROM rent_a_ref_calls
            WHERE rent_a_ref_calls.content_type = 'post'
              AND rent_a_ref_calls.content_id = posts.id
              AND rent_a_ref_calls.called_by_user_id = ?
            LIMIT 1
          ),
          ''
        ) AS user_rent_a_ref_called_at,

        COALESCE(
          (
            SELECT rent_a_ref_rulings.ruling_key
            FROM rent_a_ref_rulings
            WHERE rent_a_ref_rulings.content_type = 'post'
              AND rent_a_ref_rulings.content_id = posts.id
            LIMIT 1
          ),
          'play_on'
        ) AS rent_a_ref_ruling,
        
        COALESCE(
          (
            SELECT rent_a_ref_rulings.ruling_message
            FROM rent_a_ref_rulings
            WHERE rent_a_ref_rulings.content_type = 'post'
              AND rent_a_ref_rulings.content_id = posts.id
            LIMIT 1
          ),
          ''
        ) AS rent_a_ref_message,
        
        COALESCE(
          (
            SELECT rent_a_ref_rulings.avatar_key
            FROM rent_a_ref_rulings
            WHERE rent_a_ref_rulings.content_type = 'post'
              AND rent_a_ref_rulings.content_id = posts.id
            LIMIT 1
          ),
          ''
        ) AS rent_a_ref_avatar_key

      FROM posts
      JOIN users ON users.id = posts.author_user_id
      LEFT JOIN profiles ON profiles.user_id = users.id
      WHERE posts.visibility = 'public'
        AND posts.status = 'published'
      ORDER BY posts.created_at DESC
      LIMIT 25
      `
    )
      .bind(
        RENT_A_REF_USER_ID,
        RENT_A_REF_USER_ID,
        currentUser.user_id,
        currentUser.user_id,
        currentUser.user_id,
        currentUser.user_id
      )
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
    const titleResult = validatePlainUserText(body.title, {
      fieldName: "Post title",
      minLength: 1,
      maxLength: 120,
      allowLinks: false
    });
    
    if (!titleResult.ok) {
      return json(
        {
          ok: false,
          error: titleResult.error
        },
        400
      );
    }
    
    const bodyResult = validatePlainUserText(body.body, {
      fieldName: "Post body",
      minLength: 1,
      maxLength: 3000,
      allowLinks: true
    });
    
    if (!bodyResult.ok) {
      return json(
        {
          ok: false,
          error: bodyResult.error
        },
        400
      );
    }
    const tagsResult = validateTagsInput(body.tags || "");
    
    if (!tagsResult.ok) {
      return json(
        {
          ok: false,
          error: tagsResult.error
        },
        400
      );
    }
    
    const mediaResult = validateMediaUrlInput(body.media_url || body.video || "");
    
    if (!mediaResult.ok) {
      return json(
        {
          ok: false,
          error: mediaResult.error
        },
        400
      );
    }
    
    const title = titleResult.value;
    const content = bodyResult.value;
    const mediaUrl = mediaResult.value;
    const postType = String(body.post_type || "progress").trim();
    const visibility = String(body.visibility || "public").trim();
    const commentsEnabled = body.comments_enabled === false ? 0 : 1;
    const rawTags = tagsResult.value;

    const allowedTypes = ["progress", "game", "practice", "gear", "training", "general"];
    const allowedVisibility = ["public", "private", "unlisted"];

    const safePostType = allowedTypes.includes(postType) ? postType : "progress";
    const safeVisibility = allowedVisibility.includes(visibility) ? visibility : "public";

    const now = new Date().toISOString();

   const currentUser = await getCurrentUser(request, env);

    const postId = crypto.randomUUID();

    await env.DB.prepare(
      `
      INSERT INTO posts (
        id,
        author_user_id,
        title,
        body,
        media_url,
        post_type,
        visibility,
        comments_enabled,
        status,
        published_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        postId,
        currentUser.user_id,
        title,
        content,
        mediaUrl,
        safePostType,
        safeVisibility,
        commentsEnabled,
        "published",
        now,
        now,
        now
      )
      .run();

    const savedTags = await savePostTags(env, postId, rawTags, currentUser.user_id, now);

    return json(
      {
        ok: true,
        message: "Post created successfully.",
        post: {
          id: postId,
          title,
          body: content,
          media_url: mediaUrl,
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

async function getComments(request, env, postId) {
  try {
    const currentUser = await getCurrentUser(request, env);
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
        COALESCE(comments.moderation_status, 'visible') AS moderation_status,
        COALESCE(comments.moderation_reason, '') AS moderation_reason,
        comments.moderated_at,
        comments.moderated_by_user_id,
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
            SELECT ROUND(AVG(helpful_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS helpful_score,

        COALESCE(
          (
            SELECT ROUND(AVG(funny_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS funny_score,

        COALESCE(
          (
            SELECT ROUND(AVG(heat_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS heat_score,

        COALESCE(
          (
            SELECT ROUND(AVG(rude_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS rude_score,

        COALESCE(
          (
            SELECT ROUND(AVG(targeted_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS targeted_score,

        COALESCE(
          (
            SELECT ROUND(AVG(spam_score), 1)
            FROM content_chirps
            WHERE content_chirps.content_type = 'comment'
              AND content_chirps.content_id = comments.id
              AND content_chirps.status = 'active'
          ),
          0
        ) AS spam_score,

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
      ) AS user_chirped,

      COALESCE(
        (
          SELECT content_chirps.chirp_type
          FROM content_chirps
          WHERE content_chirps.content_type = 'comment'
            AND content_chirps.content_id = comments.id
            AND content_chirps.chirped_by_user_id = ?
            AND content_chirps.status = 'active'
          LIMIT 1
        ),
        ''
      ) AS user_chirp_type,
      
      COALESCE(
        (
          SELECT COALESCE(content_chirps.updated_at, content_chirps.created_at)
          FROM content_chirps
          WHERE content_chirps.content_type = 'comment'
            AND content_chirps.content_id = comments.id
            AND content_chirps.chirped_by_user_id = ?
            AND content_chirps.status = 'active'
          LIMIT 1
        ),
        ''
      ) AS user_chirp_at,
      
      COALESCE(
        (
          SELECT rent_a_ref_calls.called_at
          FROM rent_a_ref_calls
          WHERE rent_a_ref_calls.content_type = 'comment'
            AND rent_a_ref_calls.content_id = comments.id
            AND rent_a_ref_calls.called_by_user_id = ?
          LIMIT 1
        ),
        ''
      ) AS user_rent_a_ref_called_at,
      
      COALESCE(
        (
          SELECT MAX(ref_comments.created_at)
          FROM comments AS ref_comments
          WHERE ref_comments.parent_comment_id = comments.id
            AND ref_comments.author_user_id = ?
            AND ref_comments.status = 'visible'
        ),
        ''
      ) AS last_rent_a_ref_at,
      
      COALESCE(
        (
          SELECT MAX(COALESCE(content_chirps.updated_at, content_chirps.created_at))
          FROM content_chirps
          WHERE content_chirps.content_type = 'comment'
            AND content_chirps.content_id = comments.id
            AND content_chirps.status = 'active'
        ),
        ''
      ) AS last_comment_chirp_at,

      COALESCE(
        (
          SELECT rent_a_ref_rulings.ruling_key
          FROM rent_a_ref_rulings
          WHERE rent_a_ref_rulings.content_type = 'comment'
            AND rent_a_ref_rulings.content_id = comments.id
          LIMIT 1
        ),
        'play_on'
      ) AS rent_a_ref_ruling,
      
      COALESCE(
        (
          SELECT rent_a_ref_rulings.ruling_message
          FROM rent_a_ref_rulings
          WHERE rent_a_ref_rulings.content_type = 'comment'
            AND rent_a_ref_rulings.content_id = comments.id
          LIMIT 1
        ),
        ''
      ) AS rent_a_ref_message,
      
      COALESCE(
        (
          SELECT rent_a_ref_rulings.avatar_key
          FROM rent_a_ref_rulings
          WHERE rent_a_ref_rulings.content_type = 'comment'
            AND rent_a_ref_rulings.content_id = comments.id
          LIMIT 1
        ),
        ''
      ) AS rent_a_ref_avatar_key
      
      FROM comments
      LEFT JOIN users ON users.id = comments.author_user_id
      LEFT JOIN profiles ON profiles.user_id = users.id
      WHERE comments.post_id = ?
        AND comments.status = 'visible'
      ORDER BY comments.created_at ASC
      LIMIT 100
      `
    )
      .bind(
        currentUser.user_id,
        currentUser.user_id,
        currentUser.user_id,
        currentUser.user_id,
        currentUser.user_id,
        RENT_A_REF_USER_ID,
        postId
      )
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

    const commentBodyResult = validatePlainUserText(body.body, {
      fieldName: "Comment",
      minLength: 1,
      maxLength: 1000,
      allowLinks: false
    });
    
    if (!commentBodyResult.ok) {
      return json(
        {
          ok: false,
          error: commentBodyResult.error
        },
        400
      );
    }
    
    const commentBody = commentBodyResult.value;
    const parentCommentId = String(body.parent_comment_id || "").trim() || null;
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

    if (parentCommentId) {
      const parentComment = await env.DB.prepare(
        `
        SELECT
          id,
          post_id,
          author_user_id,
          status,
          COALESCE(moderation_status, 'visible') AS moderation_status,
          COALESCE(moderation_reason, '') AS moderation_reason
        FROM comments
        WHERE id = ?
        LIMIT 1
        `
      )
        .bind(parentCommentId)
        .first();

      if (!parentComment || parentComment.post_id !== postId) {
        return json(
          {
            ok: false,
            error: "Parent comment not found for this post."
          },
          400
        );
      }

      if (parentComment.status !== "visible") {
        return json(
          {
            ok: false,
            error: "Cannot reply to a hidden comment."
          },
          403
        );
      }

      if (parentComment.moderation_status !== "visible") {
        return json(
          {
            ok: false,
            error: "Cannot reply to a comment that is under review or benched."
          },
          403
        );
      }
      
      if (
        parentComment.author_user_id === RENT_A_REF_USER_ID ||
        String(parentComment.moderation_reason || "").startsWith("rent_a_ref_")
      ) {
        return json(
          {
            ok: false,
            error: "Rent-a-Ref calls cannot be replied to."
          },
          403
        );
      }
    }

    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);

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
        currentUser.user_id,
        parentCommentId,
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
        message: parentCommentId ? "Reply created successfully." : "Comment created successfully.",
        comment: {
          id: commentId,
          post_id: postId,
          author_user_id: currentUser.user_id,
          parent_comment_id: parentCommentId,
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
        comments.author_user_id,
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

    if (comment.author_user_id === RENT_A_REF_USER_ID) {
      return json(
        {
          ok: false,
          error: "Rent-a-Ref comments cannot be voted on."
        },
        403
      );
    }

    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);

    const existingVote = await env.DB.prepare(
      `
      SELECT id, vote_value
      FROM comment_votes
      WHERE comment_id = ?
        AND voter_user_id = ?
      LIMIT 1
      `
    )
      .bind(commentId, currentUser.user_id)
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
          currentUser.user_id,
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
    const chirpType = String(body.chirp_type || "other").trim();
    const note = String(body.note || "").trim();

    const allowedContentTypes = ["post", "comment"];
    const allowedChirpTypes = [
      "good_chirp",
      "tape_to_tape",
      "spicy_but_fair",
      "tone_check",
      "cheap_shot",
      "gongshow",
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

    const safeChirpType = allowedChirpTypes.includes(chirpType) ? chirpType : "other";
    const safeReason = getLegacyReasonForChirpType(safeChirpType);
    const profile = getChirpPresetProfile(safeChirpType);
    const safeNote = note.slice(0, 500);
    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);

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
      SELECT id, status, chirp_type
      FROM content_chirps
      WHERE content_type = ?
        AND content_id = ?
        AND chirped_by_user_id = ?
      LIMIT 1
      `
    )
      .bind(contentType, contentId, currentUser.user_id)
      .first();

    let userChirped = true;

    if (
      existing &&
      existing.status === "active" &&
      existing.chirp_type === safeChirpType
    ) {
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
      await env.DB.prepare(
        `
        UPDATE content_chirps
        SET chirp_type = ?,
            reason = ?,
            note = ?,
            helpful_score = ?,
            funny_score = ?,
            heat_score = ?,
            rude_score = ?,
            targeted_score = ?,
            spam_score = ?,
            status = 'active',
            updated_at = ?
        WHERE id = ?
        `
      )
        .bind(
          safeChirpType,
          safeReason,
          safeNote,
          profile.helpful_score,
          profile.funny_score,
          profile.heat_score,
          profile.rude_score,
          profile.targeted_score,
          profile.spam_score,
          now,
          existing.id
        )
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
          chirp_type,
          helpful_score,
          funny_score,
          heat_score,
          rude_score,
          targeted_score,
          spam_score,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
        .bind(
          crypto.randomUUID(),
          contentType,
          contentId,
          currentUser.user_id,
          safeReason,
          safeNote,
          "active",
          safeChirpType,
          profile.helpful_score,
          profile.funny_score,
          profile.heat_score,
          profile.rude_score,
          profile.targeted_score,
          profile.spam_score,
          now,
          now
        )
        .run();
    }

    const chirpProfile = await getChirpProfile(env, contentType, contentId);
    
    const rentARef = await syncAutomaticRentARef(env, {
      contentType,
      contentId,
      now
    });
    
    return json({
      ok: true,
      message: userChirped ? "Content chirped." : "Chirp removed.",
      content_type: contentType,
      content_id: contentId,
      user_chirped: userChirped,
      ...chirpProfile,
      rent_a_ref: rentARef
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

function getLegacyReasonForChirpType(chirpType) {
  const reasonMap = {
    good_chirp: "other",
    tape_to_tape: "other",
    spicy_but_fair: "trash_talk_too_far",
    tone_check: "too_personal",
    cheap_shot: "targeted_bullying",
    gongshow: "spam_trolling",
    other: "other"
  };

  return reasonMap[chirpType] || "other";
}

function getChirpPresetProfile(chirpType) {
  const presets = {
    good_chirp: {
      helpful_score: 2,
      funny_score: 5,
      heat_score: 2,
      rude_score: 0,
      targeted_score: 0,
      spam_score: 0
    },
    tape_to_tape: {
      helpful_score: 5,
      funny_score: 1,
      heat_score: 1,
      rude_score: 0,
      targeted_score: 0,
      spam_score: 0
    },
    spicy_but_fair: {
      helpful_score: 2,
      funny_score: 4,
      heat_score: 5,
      rude_score: 1,
      targeted_score: 0,
      spam_score: 0
    },
    tone_check: {
      helpful_score: 1,
      funny_score: 1,
      heat_score: 3,
      rude_score: 3,
      targeted_score: 1,
      spam_score: 0
    },
    cheap_shot: {
      helpful_score: 0,
      funny_score: 0,
      heat_score: 4,
      rude_score: 5,
      targeted_score: 2,
      spam_score: 0
    },
    gongshow: {
      helpful_score: 0,
      funny_score: 1,
      heat_score: 2,
      rude_score: 1,
      targeted_score: 0,
      spam_score: 5
    },
    other: {
      helpful_score: 0,
      funny_score: 0,
      heat_score: 1,
      rude_score: 0,
      targeted_score: 0,
      spam_score: 0
    }
  };

  return presets[chirpType] || presets.other;
}

async function getChirpProfile(env, contentType, contentId) {
  const row = await env.DB.prepare(
    `
    SELECT
      COUNT(*) AS chirp_count,
      COALESCE(ROUND(AVG(helpful_score), 1), 0) AS helpful_score,
      COALESCE(ROUND(AVG(funny_score), 1), 0) AS funny_score,
      COALESCE(ROUND(AVG(heat_score), 1), 0) AS heat_score,
      COALESCE(ROUND(AVG(rude_score), 1), 0) AS rude_score,
      COALESCE(ROUND(AVG(targeted_score), 1), 0) AS targeted_score,
      COALESCE(ROUND(AVG(spam_score), 1), 0) AS spam_score
    FROM content_chirps
    WHERE content_type = ?
      AND content_id = ?
      AND status = 'active'
    `
  )
    .bind(contentType, contentId)
    .first();

  const profile = {
    chirp_count: Number(row?.chirp_count || 0),
    helpful_score: Number(row?.helpful_score || 0),
    funny_score: Number(row?.funny_score || 0),
    heat_score: Number(row?.heat_score || 0),
    rude_score: Number(row?.rude_score || 0),
    targeted_score: Number(row?.targeted_score || 0),
    spam_score: Number(row?.spam_score || 0)
  };

  return {
    ...profile,
    chirp_status: getChirpProfileStatus(profile)
  };
}

function getChirpProfileStatus(profile) {
  if (profile.chirp_count === 0) return "normal";

  if (profile.spam_score >= 4) return "gongshow";
  if (profile.rude_score >= 4 && profile.targeted_score >= 3) return "ref_review";
  if (profile.rude_score >= 4) return "cheap_shot";
  if (profile.rude_score >= 3 || profile.targeted_score >= 2) return "tone_check";
  if (profile.heat_score >= 4 && profile.rude_score <= 2) return "spicy_but_fair";
  if (profile.helpful_score >= 4) return "tape_to_tape";
  if (profile.funny_score >= 4) return "good_chirp";

  return "chirp_watch";
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
        AND comments.author_user_id <> ?
        AND comments.status = 'visible'
        AND posts.visibility = 'public'
        AND posts.status = 'published'
      LIMIT 1
      `
    )
      .bind(contentId, RENT_A_REF_USER_ID)
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

function getAutomaticRentARefRulingKey(moderationDecision, chirpProfile) {
  if (moderationDecision.moderation_status === "under_review") {
    return "under_review";
  }

  if (moderationDecision.moderation_status === "benched") {
    return "penalty";
  }

  const chirpStatus = String(chirpProfile.chirp_status || "normal");

  if (chirpStatus === "tone_check") {
    return "tone_check";
  }

  return "play_on";
}

function getStableRefVariant(seed = "") {
  const refImages = [
    "ref-img1.png",
    "ref-img2.png",
    "ref-img5.png"
  ];

  let hash = 0;

  for (const character of String(seed)) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }

  const safeHash = Math.abs(hash);

  return refImages[safeHash % refImages.length];
}
function getRentARefAvatarKey(rulingKey, contentId) {
  if (rulingKey === "under_review") return "ref-img3.png";
  if (rulingKey === "penalty") return "ref-img4.png";

  return getStableRefVariant(contentId);
}

async function getAutomaticRentARefTarget(env, contentType, contentId) {
  if (contentType === "post") {
    return env.DB.prepare(
      `
      SELECT
        id,
        title,
        body,
        comments_enabled,
        COALESCE(moderation_status, 'visible') AS moderation_status,
        COALESCE(moderation_reason, '') AS moderation_reason
      FROM posts
      WHERE id = ?
        AND visibility = 'public'
        AND status = 'published'
      LIMIT 1
      `
    )
      .bind(contentId)
      .first();
  }

  if (contentType === "comment") {
    return env.DB.prepare(
      `
      SELECT
        comments.id,
        comments.post_id,
        comments.body,
        posts.comments_enabled,
        COALESCE(comments.moderation_status, 'visible') AS moderation_status,
        COALESCE(comments.moderation_reason, '') AS moderation_reason
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
  }

  return null;
}

async function updateAutomaticModerationState(
  env,
  contentType,
  contentId,
  moderationDecision,
  now
) {
  if (moderationDecision.moderation_status === "visible") {
    return;
  }

  const tableName = contentType === "comment" ? "comments" : "posts";

  await env.DB.prepare(
    `
    UPDATE ${tableName}
    SET moderation_status = ?,
        moderation_reason = ?,
        moderated_at = ?,
        moderated_by_user_id = ?,
        updated_at = ?
    WHERE id = ?
    `
  )
    .bind(
      moderationDecision.moderation_status,
      moderationDecision.moderation_reason,
      now,
      RENT_A_REF_USER_ID,
      now,
      contentId
    )
    .run();
}

async function createAutomaticRentARefComment(env, {
  contentType,
  target,
  rulingKey,
  message,
  now
}) {
  if (Number(target.comments_enabled) !== 1) {
    return null;
  }

  await ensureRentARefAuthor(env, now);

  const commentId = crypto.randomUUID();
  const postId = contentType === "comment" ? target.post_id : target.id;
  const parentCommentId = contentType === "comment" ? target.id : null;

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
      moderation_status,
      moderation_reason,
      moderated_at,
      moderated_by_user_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      commentId,
      postId,
      RENT_A_REF_USER_ID,
      parentCommentId,
      message,
      0,
      "visible",
      "visible",
      `rent_a_ref_${rulingKey}`,
      now,
      RENT_A_REF_USER_ID,
      now,
      now
    )
    .run();

  return commentId;
}

async function syncAutomaticRentARef(env, {
  contentType,
  contentId,
  now
}) {
  const target = await getAutomaticRentARefTarget(
    env,
    contentType,
    contentId
  );

  if (!target) {
    return null;
  }

  const chirpProfile = await getChirpProfile(
    env,
    contentType,
    contentId
  );

  const contentIsLocked =
    target.moderation_status === "under_review" ||
    target.moderation_status === "benched";

  let moderationDecision = getRentARefModerationDecision(
    target,
    chirpProfile
  );

  if (contentIsLocked) {
    moderationDecision = {
      moderation_status: target.moderation_status,
      moderation_reason: target.moderation_reason
    };
  }

  const rulingKey = getAutomaticRentARefRulingKey(
    moderationDecision,
    chirpProfile
  );

  const existing = await env.DB.prepare(
    `
    SELECT
      id,
      ruling_key,
      ruling_message,
      avatar_key,
      last_comment_id
    FROM rent_a_ref_rulings
    WHERE content_type = ?
      AND content_id = ?
    LIMIT 1
    `
  )
    .bind(contentType, contentId)
    .first();

  const rulingChanged =
    !existing ||
    existing.ruling_key !== rulingKey;

  const avatarKey = rulingChanged || !existing?.avatar_key
    ? getRentARefAvatarKey(rulingKey, contentId)
    : existing.avatar_key;

  const rulingMessage = rulingChanged || !existing?.ruling_message
    ? generateRentARefComment(target, chirpProfile, moderationDecision)
    : existing.ruling_message;

  await updateAutomaticModerationState(
    env,
    contentType,
    contentId,
    moderationDecision,
    now
  );

  if (moderationDecision.moderation_status === "under_review") {
    await ensureContentReviewCase(env, {
      contentType,
      contentId,
      openedByUserId: RENT_A_REF_USER_ID,
      openedReason: moderationDecision.moderation_reason,
      now
    });
  }

  let lastCommentId = existing?.last_comment_id || null;

  const shouldCreateSystemComment =
    rulingChanged &&
    rulingKey !== "play_on";

  if (shouldCreateSystemComment) {
    lastCommentId = await createAutomaticRentARefComment(env, {
      contentType,
      target,
      rulingKey,
      message: rulingMessage,
      now
    });
  }

  await env.DB.prepare(
    `
    INSERT INTO rent_a_ref_rulings (
      id,
      content_type,
      content_id,
      ruling_key,
      ruling_message,
      avatar_key,
      last_comment_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_type, content_id)
    DO UPDATE SET
      ruling_key = excluded.ruling_key,
      ruling_message = excluded.ruling_message,
      avatar_key = excluded.avatar_key,
      last_comment_id = excluded.last_comment_id,
      updated_at = excluded.updated_at
    `
  )
    .bind(
      existing?.id || crypto.randomUUID(),
      contentType,
      contentId,
      rulingKey,
      rulingMessage,
      avatarKey,
      lastCommentId,
      now,
      now
    )
    .run();

  return {
    ruling_key: rulingKey,
    ruling_message: rulingMessage,
    avatar_key: avatarKey,
    last_comment_id: lastCommentId
  };
}

async function getUserRentARefReadiness(env, contentType, contentId, userId) {
  const chirp = await env.DB.prepare(
    `
    SELECT
      id,
      chirp_type,
      created_at,
      updated_at
    FROM content_chirps
    WHERE content_type = ?
      AND content_id = ?
      AND chirped_by_user_id = ?
      AND status = 'active'
    LIMIT 1
    `
  )
    .bind(contentType, contentId, userId)
    .first();

  if (!chirp) {
    return {
      ready: false,
      reason: "chirp_required",
      message: "Chirp this first, then Rent-a-Ref can make a call."
    };
  }

  const existingCall = await env.DB.prepare(
    `
    SELECT called_at
    FROM rent_a_ref_calls
    WHERE content_type = ?
      AND content_id = ?
      AND called_by_user_id = ?
    LIMIT 1
    `
  )
    .bind(contentType, contentId, userId)
    .first();

  if (existingCall) {
    return {
      ready: false,
      reason: "already_called",
      message: "You already called Rent-a-Ref on this one.",
      chirped_at: chirp.created_at,
      called_at: existingCall.called_at
    };
  }

  return {
    ready: true,
    reason: "ready",
    message: "Rent-a-Ref can make a call.",
    chirped_at: chirp.created_at,
    called_at: ""
  };
}

async function recordUserRentARefCall(env, {
  contentType,
  contentId,
  calledByUserId,
  rentARefCommentId,
  now
}) {
  await env.DB.prepare(
    `
    INSERT INTO rent_a_ref_calls (
      id,
      content_type,
      content_id,
      called_by_user_id,
      rent_a_ref_comment_id,
      called_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_type, content_id, called_by_user_id)
    DO UPDATE SET
      rent_a_ref_comment_id = excluded.rent_a_ref_comment_id,
      called_at = excluded.called_at,
      updated_at = excluded.updated_at
    `
  )
    .bind(
      crypto.randomUUID(),
      contentType,
      contentId,
      calledByUserId,
      rentARefCommentId,
      now,
      now,
      now
    )
    .run();
}

async function createRentARefCommentForComment(request, env, commentId) {
  try {
    const targetComment = await env.DB.prepare(
      `
      SELECT
        comments.id,
        comments.post_id,
        comments.author_user_id,
        comments.parent_comment_id,
        comments.body,
        comments.status,
        comments.moderation_status,
        comments.moderation_reason,
        posts.visibility AS post_visibility,
        posts.status AS post_status,
        posts.comments_enabled
      FROM comments
      JOIN posts ON posts.id = comments.post_id
      WHERE comments.id = ?
      LIMIT 1
      `
    )
      .bind(commentId)
      .first();

    if (
      !targetComment ||
      targetComment.status !== "visible" ||
      targetComment.post_visibility !== "public" ||
      targetComment.post_status !== "published"
    ) {
      return json(
        {
          ok: false,
          error: "Comment not found."
        },
        404
      );
    }

    if (targetComment.author_user_id === RENT_A_REF_USER_ID) {
      return json(
        {
          ok: false,
          error: "Rent-a-Ref cannot review Rent-a-Ref comments."
        },
        403
      );
    }

    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);
    
    await ensureRentARefAuthor(env, now);
    
    const rentARefReadiness = await getUserRentARefReadiness(
      env,
      "comment",
      commentId,
      currentUser.user_id
    );
    
    if (!rentARefReadiness.ready) {
      return json(
        {
          ok: false,
          error: rentARefReadiness.message || "Rent-a-Ref is not ready for this user.",
          reason: rentARefReadiness.reason,
          rent_a_ref_ready: false
        },
        403
      );
    }

    const chirpProfile = await getChirpProfile(env, "comment", commentId);
    const moderationDecision = getRentARefModerationDecision(targetComment, chirpProfile);
    const rentARefTone = getRentARefCallTone(moderationDecision, chirpProfile);

    if (moderationDecision.moderation_status !== "visible") {
      await env.DB.prepare(
        `
        UPDATE comments
        SET moderation_status = ?,
            moderation_reason = ?,
            moderated_at = ?,
            moderated_by_user_id = ?,
            updated_at = ?
        WHERE id = ?
        `
      )
        .bind(
          moderationDecision.moderation_status,
          moderationDecision.moderation_reason,
          now,
          RENT_A_REF_USER_ID,
          now,
          commentId
        )
        .run();
    }
   
    if (moderationDecision.moderation_status === "under_review") {
      await ensureContentReviewCase(env, {
        contentType: "comment",
        contentId: commentId,
        openedByUserId: RENT_A_REF_USER_ID,
        openedReason: moderationDecision.moderation_reason,
        now
      });
    }

    const rentARefBody = generateRentARefComment(targetComment, chirpProfile, moderationDecision);
    const rentARefCommentId = crypto.randomUUID();

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
        moderation_status,
        moderation_reason,
        moderated_at,
        moderated_by_user_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        rentARefCommentId,
        targetComment.post_id,
        RENT_A_REF_USER_ID,
        commentId,
        rentARefBody,
        0,
        "visible",
        "visible",
        `rent_a_ref_${rentARefTone}`,
        now,
        RENT_A_REF_USER_ID,
        now,
        now
      )
      .run();

      await recordUserRentARefCall(env, {
        contentType: "comment",
        contentId: commentId,
        calledByUserId: currentUser.user_id,
        rentARefCommentId: rentARefCommentId,
        now
      });
    
    const countRow = await env.DB.prepare(
      `
      SELECT COUNT(*) AS comment_count
      FROM comments
      WHERE post_id = ?
        AND status = 'visible'
      `
    )
      .bind(targetComment.post_id)
      .first();

    return json(
      {
        ok: true,
        message: "Rent-a-Ref made the call on the comment.",
        already_called: false,
        rent_a_ref_ready: false,
        comment_count: Number(countRow?.comment_count || 0),
        moderation: moderationDecision,
        comment: {
          id: rentARefCommentId,
          post_id: targetComment.post_id,
          parent_comment_id: commentId,
          author_user_id: RENT_A_REF_USER_ID,
          author_display_name: "Rent-a-Ref",
          author_username: RENT_A_REF_USERNAME,
          body: rentARefBody,
          score: 0,
          status: "visible",
          moderation_status: "visible",
          moderation_reason: `rent_a_ref_${rentARefTone}`,
          created_at: now
        }
      },
      201
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to summon Rent-a-Ref for comment.",
        error: error.message
      },
      500
    );
  }
}

async function createRentARefComment(request, env, postId) {
  try {
    const post = await env.DB.prepare(
      `
      SELECT
        id,
        title,
        body,
        post_type,
        comments_enabled,
        visibility,
        status,
        COALESCE(moderation_status, 'visible') AS moderation_status,
        COALESCE(moderation_reason, '') AS moderation_reason
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

    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);
    
    await ensureRentARefAuthor(env, now);
    
    const rentARefReadiness = await getUserRentARefReadiness(
      env,
      "post",
      postId,
      currentUser.user_id
    );
    
    if (!rentARefReadiness.ready) {
      return json(
        {
          ok: false,
          error: rentARefReadiness.message || "Rent-a-Ref is not ready for this user.",
          reason: rentARefReadiness.reason,
          rent_a_ref_ready: false
        },
        403
      );
    }

    const chirpProfile = await getChirpProfile(env, "post", postId);
    const moderationDecision = getRentARefModerationDecision(post, chirpProfile);
    const rentARefTone = getRentARefCallTone(moderationDecision, chirpProfile);
    
    if (moderationDecision.moderation_status !== "visible") {
      await env.DB.prepare(
        `
        UPDATE posts
        SET moderation_status = ?,
            moderation_reason = ?,
            moderated_at = ?,
            moderated_by_user_id = ?,
            updated_at = ?
        WHERE id = ?
        `
      )
        .bind(
          moderationDecision.moderation_status,
          moderationDecision.moderation_reason,
          now,
          RENT_A_REF_USER_ID,
          now,
          postId
        )
        .run();
    }

    if (moderationDecision.moderation_status === "under_review") {
      await ensureContentReviewCase(env, {
        contentType: "post",
        contentId: postId,
        openedByUserId: RENT_A_REF_USER_ID,
        openedReason: moderationDecision.moderation_reason,
        now
      });
    }
    
    const rentARefBody = generateRentARefComment(post, chirpProfile, moderationDecision);
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
        moderation_status,
        moderation_reason,
        moderated_at,
        moderated_by_user_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        commentId,
        postId,
        RENT_A_REF_USER_ID,
        null,
        rentARefBody,
        0,
        "visible",
        "visible",
        `rent_a_ref_${rentARefTone}`,
        now,
        RENT_A_REF_USER_ID,
        now,
        now
      )
      .run();

    await recordUserRentARefCall(env, {
      contentType: "post",
      contentId: postId,
      calledByUserId: currentUser.user_id,
      rentARefCommentId: commentId,
      now
    });
    
    const countRow = await env.DB.prepare(
      `
      SELECT COUNT(*) AS comment_count
      FROM comments
      WHERE post_id = ?
        AND status = 'visible'
      `
    )
      .bind(postId)
      .first();

    return json(
      {
        ok: true,
        message: "Rent-a-Ref made the call.",
        already_called: false,
        rent_a_ref_ready: false,
        comment_count: Number(countRow?.comment_count || 0),
        moderation: moderationDecision,
        comment: {
          id: commentId,
          post_id: postId,
          author_user_id: RENT_A_REF_USER_ID,
          author_display_name: "Rent-a-Ref",
          author_username: RENT_A_REF_USERNAME,
          body: rentARefBody,
          score: 0,
          status: "visible",
          moderation_status: "visible",
          moderation_reason: `rent_a_ref_${rentARefTone}`,
          created_at: now
        }
      },
      201
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to summon Rent-a-Ref.",
        error: error.message
      },
      500
    );
  }
}
async function ensureRentARefAuthor(env, now) {
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
      RENT_A_REF_USER_ID,
      "rent-a-ref@example.com",
      "Rent-a-Ref",
      "system",
      "rent-a-ref-bot-001",
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
      leadership_role,
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      RENT_A_REF_PROFILE_ID,
      RENT_A_REF_USER_ID,
      RENT_A_REF_USERNAME,
      "Rent-a-Ref",
      "Cheap whistle. Expensive opinions.",
      "Official",
      null,
      null,
      "none",
      "Beer League Officiating",
      "Late Game Rink",
      "Questionable",
      "public",
      1,
      1,
      0,
      0,
      0,
      now,
      now
    )
    .run();
}

function generateRentARefComment(post, chirpProfile, moderationDecision = null) {
  const status = chirpProfile.chirp_status || "normal";
  const chirpCount = Number(chirpProfile.chirp_count || 0);

  const helpful = Number(chirpProfile.helpful_score || 0);
  const funny = Number(chirpProfile.funny_score || 0);
  const heat = Number(chirpProfile.heat_score || 0);
  const rude = Number(chirpProfile.rude_score || 0);
  const targeted = Number(chirpProfile.targeted_score || 0);
  const spam = Number(chirpProfile.spam_score || 0);

  if (moderationDecision?.moderation_status === "under_review") {
    return pickRentARefLine([
      "We’ve got a link on the play. I’m sending this upstairs before somebody clicks something sketchy.",
      "Media involved. I’m not making that call from the blue line. Sent upstairs for review.",
      "There’s a link in the mix, and the chirp shape looks ugly. Situation Room can sort this one out.",
      "Review on the play. I’m not trusting beer league Wi-Fi and a hot take with this one.",
      "This one’s got link/media risk. I’m blowing it dead and sending it upstairs.",
      "I saw a link, I saw a bad chirp shape, and I’m not wearing that liability. Review on the play.",
      "This is above my pay grade, which is already dangerously close to rink coffee. Sent upstairs."
    ]);
  }

  if (moderationDecision?.moderation_status === "benched") {
    return pickRentARefLine([
      "That one’s a cheap shot. Two minutes for making it weird.",
      "Whistle’s up. Too much head-hunting, not enough hockey.",
      "You can chirp the play without running the goalie. Sent to the box.",
      "That crossed the line from chirp to nonsense. Take a seat.",
      "I’m calling that one. Cheap shot energy, no attempt to play the puck.",
      "That’s not a chirp, that’s a slash after the whistle. Into the box.",
      "The puck was nowhere near that comment. Sit down for two."
    ]);
  }

  if (chirpCount === 0) {
    return pickRentARefLine([
      "No chirps on the sheet yet. Clean enough for beer league. Play on.",
      "No penalty on the play. Little late-game energy, but we skate on.",
      "I’ve seen worse at 10:45 with one ref and a foggy visor. Play on.",
      "No call. Everybody breathe and find your backcheck.",
      "Marginal contact, acceptable chirp. Play on."
    ]);
  }

  if (spam >= 4 || status === "gongshow") {
    return pickRentARefLine([
      "This is drifting into full gongshow territory. Somebody find the puck and settle it down.",
      "That’s a lot of noise for not much hockey. I’m calling this one a rink-lobby argument.",
      "Gongshow energy detected. No goal, no assist, no useful contribution.",
      "This thread is one broken skate lace away from a full collapse.",
      "Too much chaos, not enough hockey. I’m tapping the glass on this one."
    ]);
  }

  if ((rude >= 4 && targeted >= 3) || status === "ref_review") {
    return pickRentARefLine([
      "Whistle’s up. That’s looking personal, and I’m not letting beer league turn into court testimony.",
      "Targeting the player instead of the play. That’s getting a whistle.",
      "Keep it about the hockey. Once it gets personal, you’re skating toward the box.",
      "That’s head-hunting, not chirping. I’m making the call.",
      "You can light up the play. You don’t get to line up the player."
    ]);
  }

  if (rude >= 4 || status === "cheap_shot") {
    return pickRentARefLine([
      "That one’s a cheap shot. Two minutes for making it weird.",
      "Plenty of heat, not enough class. I’ve got that as a minor for unnecessary nonsense.",
      "You can chirp the play without running the goalie. Clean it up.",
      "That one had no puck support and too much attitude.",
      "Cheap shot energy. I saw it, the bench saw it, everybody saw it."
    ]);
  }

  if (rude >= 3 || targeted >= 2 || status === "tone_check") {
    return pickRentARefLine([
      "Tone check. You’re not in the box yet, but you’re leaning over the boards.",
      "I’m letting it go, but keep the elbows tucked. This is beer league, not arbitration.",
      "Little close to the line. Keep it funny or keep it moving.",
      "That’s borderline. I’m not calling it yet, but I’m watching the numbers.",
      "You’re one bad follow-up away from hearing the whistle."
    ]);
  }

  if (heat >= 4 && rude <= 2) {
    return pickRentARefLine([
      "Spicy, but still inside the dots. No call. Play on.",
      "There’s heat on that one, but the elbows are down. I’m letting it go.",
      "Hot take, clean lane. No penalty unless someone starts whining.",
      "Little mustard on it, but nothing illegal. Keep skating.",
      "That’s beer-league spicy, not box-worthy. Play on."
    ]);
  }

  if (helpful >= 4 || status === "tape_to_tape") {
    return pickRentARefLine([
      "That’s tape-to-tape. Actual useful feedback in a beer league thread. Rare, but I’ll allow it.",
      "Clean feed. Helpful, direct, and nobody had to throw a glove. Play on.",
      "That one connected. Good pass, good point, no whistle.",
      "That’s constructive enough to survive a locker room full of bad opinions.",
      "Good hockey note. I’m waving off the nonsense and letting that stand."
    ]);
  }

  if (funny >= 4 || status === "good_chirp") {
    return pickRentARefLine([
      "Clean chirp. Got a laugh, stayed inside the glass. Play on.",
      "Good chirp. Little mustard, no penalty. Keep skating.",
      "That’s legal banter. I checked the rulebook I keep under the coffee cup.",
      "That one’s funny enough to let go. No call.",
      "Harmless chirp, decent delivery. I’ve heard worse from the scorekeeper."
    ]);
  }

  return pickRentARefLine([
    "I don’t hate it. I don’t love it. That’s beer league officiating, baby. Play on.",
    "No call. Everyone gets one before I start pretending this whistle works.",
    "Marginal contact, questionable chirp, acceptable chaos. Play on.",
    "I’m not sure what that was, but it wasn’t enough paperwork for a penalty.",
    "We’re moving on before somebody asks me to explain the rulebook."
  ]);
}

function getRentARefCallTone(moderationDecision, chirpProfile) {
  const moderationStatus = moderationDecision?.moderation_status || "visible";
  const chirpStatus = chirpProfile?.chirp_status || "normal";

  if (moderationStatus === "benched") return "red";
  if (moderationStatus === "under_review") return "yellow";

  if (["tone_check", "ref_review", "cheap_shot", "gongshow"].includes(chirpStatus)) {
    return "yellow";
  }

  return "green";
}

function getRentARefModerationDecision(content, chirpProfile) {
  const status = chirpProfile.chirp_status || "normal";

  const rude = Number(chirpProfile.rude_score || 0);
  const targeted = Number(chirpProfile.targeted_score || 0);
  const spam = Number(chirpProfile.spam_score || 0);

  const wasClearedBySituationRoom =
    String(content.moderation_status || "visible") === "visible" &&
    String(content.moderation_reason || "") === "review_unbenched";
  
  const hasExternalRisk =
    !wasClearedBySituationRoom &&
    contentHasLinkOrMedia(content);

  const isGongshow = spam >= 4 || status === "gongshow";
  const isCheapShot = rude >= 4 || status === "cheap_shot";
  const isHeadHunting =
    targeted >= 3 ||
    status === "ref_review" ||
    (rude >= 4 && targeted >= 2);

  const shouldModerate = isGongshow || isCheapShot || isHeadHunting;

  if (!shouldModerate) {
    return {
      moderation_status: "visible",
      moderation_reason: ""
    };
  }

  let reason = "poor_chirp_profile";

  if (isHeadHunting) {
    reason = "cheap_shot_head_hunting";
  } else if (isCheapShot) {
    reason = "cheap_shot";
  } else if (isGongshow) {
    reason = "gongshow";
  }

  if (hasExternalRisk) {
    return {
      moderation_status: "under_review",
      moderation_reason: `${reason}_with_link_or_media`
    };
  }

  return {
    moderation_status: "benched",
    moderation_reason: reason
  };
}

function contentHasLinkOrMedia(content) {
  const text = [
    content.title,
    content.body,
    content.media_url,
    content.video_url,
    content.url
  ]
    .filter(Boolean)
    .join(" ");

  return /(https?:\/\/|www\.|youtu\.be|youtube\.com|tiktok\.com|instagram\.com|x\.com|twitter\.com|\.com\b|\.net\b|\.org\b|\.io\b)/i.test(text);
}

function pickRentARefLine(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    return "No call on the play. Somehow, we continue.";
  }

  return lines[Math.floor(Math.random() * lines.length)];
}

async function ensureContentReviewCase(env, {
  contentType,
  contentId,
  openedByUserId,
  openedReason,
  now
}) {
  const existing = await env.DB.prepare(
    `
    SELECT id
    FROM content_reviews
    WHERE content_type = ?
      AND content_id = ?
      AND review_status = 'open'
    LIMIT 1
    `
  )
    .bind(contentType, contentId)
    .first();

  if (existing) {
    await ensureReviewTokens(env, existing.id, now);
    return existing.id;
  }

  const reviewId = crypto.randomUUID();

  await env.DB.prepare(
    `
    INSERT INTO content_reviews (
      id,
      content_type,
      content_id,
      opened_by_user_id,
      opened_reason,
      review_status,
      final_decision,
      opened_at,
      resolved_at,
      resolved_by_user_id,
      notes,
      required_votes,
      total_votes,
      unbench_votes,
      keep_benched_votes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      reviewId,
      contentType,
      contentId,
      openedByUserId,
      openedReason,
      "open",
      null,
      now,
      null,
      null,
      null,
      REVIEW_REQUIRED_VOTES,
      0,
      0,
      0
    )
    .run();

  await ensureReviewTokens(env, reviewId, now);

  return reviewId;
}

async function ensureReviewTokens(env, reviewId, now) {
  for (const slotNumber of [1, 2, 3]) {
    await env.DB.prepare(
      `
      INSERT OR IGNORE INTO content_review_tokens (
        id,
        review_id,
        slot_number,
        token_status,
        checked_out_by_user_id,
        checked_out_at,
        expires_at,
        burned_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        `review_token_${reviewId}_${slotNumber}`,
        reviewId,
        slotNumber,
        "available",
        null,
        null,
        null,
        null,
        now,
        now
      )
      .run();
  }
}

async function releaseExpiredReviewTokens(env, now) {
  await env.DB.prepare(
    `
    UPDATE content_review_tokens
    SET token_status = 'available',
        checked_out_by_user_id = NULL,
        checked_out_at = NULL,
        expires_at = NULL,
        updated_at = ?
    WHERE token_status = 'checked_out'
      AND expires_at IS NOT NULL
      AND expires_at <= ?
    `
  )
    .bind(now, now)
    .run();

  await env.DB.prepare(
    `
    DELETE FROM content_review_participants
    WHERE participation_status = 'checked_out'
      AND token_id NOT IN (
        SELECT id
        FROM content_review_tokens
        WHERE token_status = 'checked_out'
      )
    `
  ).run();
}

async function getOpenReviews(request, env) {
  try {
      const now = new Date().toISOString();
      
      await releaseExpiredReviewTokens(env, now);
      const currentUser = await getCurrentUser(request, env);
      const leadershipAccess = getLeadershipAccess(currentUser);
      
      if (!leadershipAccess.can_review_content) {
        return json({
          ok: true,
          reviews: [],
          review_access: leadershipAccess,
          message: "Leadership review access required."
        });
      }
    
    const result = await env.DB.prepare(
      `
      SELECT
        content_reviews.id,
        content_reviews.content_type,
        content_reviews.content_id,
        content_reviews.opened_by_user_id,
        content_reviews.opened_reason,
        content_reviews.review_status,
        content_reviews.final_decision,
        content_reviews.opened_at,
        content_reviews.resolved_at,
        content_reviews.notes,
        content_reviews.required_votes,
        content_reviews.total_votes,

        posts.title AS post_title,
        posts.body AS post_body,
        posts.moderation_status AS post_moderation_status,
        posts.moderation_reason AS post_moderation_reason,

        comments.body AS comment_body,
        comments.post_id AS comment_post_id,
        comments.moderation_status AS comment_moderation_status,
        comments.moderation_reason AS comment_moderation_reason,

        (
          SELECT COUNT(*)
          FROM content_review_tokens
          WHERE content_review_tokens.review_id = content_reviews.id
            AND content_review_tokens.token_status = 'available'
        ) AS tokens_available,

        (
          SELECT COUNT(*)
          FROM content_review_tokens
          WHERE content_review_tokens.review_id = content_reviews.id
            AND content_review_tokens.token_status = 'checked_out'
        ) AS tokens_checked_out,

        (
          SELECT COUNT(*)
          FROM content_review_tokens
          WHERE content_review_tokens.review_id = content_reviews.id
            AND content_review_tokens.token_status = 'burned'
        ) AS tokens_burned

      FROM content_reviews
      LEFT JOIN posts
        ON content_reviews.content_type = 'post'
        AND posts.id = content_reviews.content_id
      LEFT JOIN comments
        ON content_reviews.content_type = 'comment'
        AND comments.id = content_reviews.content_id
      WHERE content_reviews.review_status = 'open'
        AND NOT EXISTS (
          SELECT 1
          FROM content_review_participants
          WHERE content_review_participants.review_id = content_reviews.id
            AND content_review_participants.reviewer_user_id = ?
            AND content_review_participants.participation_status IN ('checked_out', 'completed')
        )
        AND EXISTS (
          SELECT 1
          FROM content_review_tokens
          WHERE content_review_tokens.review_id = content_reviews.id
            AND content_review_tokens.token_status = 'available'
        )
      ORDER BY content_reviews.opened_at DESC
      LIMIT 50
      `
    )
      .bind(currentUser.user_id)
      .all();

      return json({
        ok: true,
        review_access: leadershipAccess,
        reviews: (result.results || []).map((review) => ({
          ...review,
          reviews_needed: Number(review.required_votes || REVIEW_REQUIRED_VOTES),
          reviews_completed: Number(review.total_votes || 0),
          tokens_available: Number(review.tokens_available || 0),
          tokens_checked_out: Number(review.tokens_checked_out || 0),
          tokens_burned: Number(review.tokens_burned || 0)
        }))
      });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load reviews.",
        error: error.message
      },
      500
    );
  }
}

async function checkoutReview(request, env, reviewId) {
  try {
    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);
    const leadershipAccess = getLeadershipAccess(currentUser);
    
    if (!leadershipAccess.can_review_content) {
      return leadershipForbiddenResponse();
    }
    
    await releaseExpiredReviewTokens(env, now);

    const review = await env.DB.prepare(
      `
      SELECT
        id,
        content_type,
        content_id,
        review_status,
        required_votes,
        total_votes
      FROM content_reviews
      WHERE id = ?
      LIMIT 1
      `
    )
      .bind(reviewId)
      .first();

    if (!review || review.review_status !== "open") {
      return json(
        {
          ok: false,
          error: "Open review not found."
        },
        404
      );
    }

    const participant = await env.DB.prepare(
      `
      SELECT id, participation_status, token_id
      FROM content_review_participants
      WHERE review_id = ?
        AND reviewer_user_id = ?
      LIMIT 1
      `
    )
      .bind(reviewId, currentUser.user_id)
      .first();

    if (participant?.participation_status === "completed") {
      return json(
        {
          ok: false,
          error: "You have already reviewed this play."
        },
        403
      );
    }

    if (participant?.participation_status === "checked_out" && participant.token_id) {
      const existingToken = await env.DB.prepare(
        `
        SELECT id, expires_at
        FROM content_review_tokens
        WHERE id = ?
          AND token_status = 'checked_out'
          AND checked_out_by_user_id = ?
        LIMIT 1
        `
      )
        .bind(participant.token_id, currentUser.user_id)
        .first();

      if (existingToken) {
        return json({
          ok: true,
          review_id: reviewId,
          token_id: existingToken.id,
          expires_at: existingToken.expires_at,
          already_checked_out: true
        });
      }
    }

    const token = await env.DB.prepare(
      `
      SELECT id
      FROM content_review_tokens
      WHERE review_id = ?
        AND token_status = 'available'
      ORDER BY slot_number ASC
      LIMIT 1
      `
    )
      .bind(reviewId)
      .first();

    if (!token) {
      return json(
        {
          ok: false,
          error: "No review tokens available."
        },
        409
      );
    }

    const expiresAt = new Date(
      Date.now() + REVIEW_TOKEN_TIMEOUT_MINUTES * 60 * 1000
    ).toISOString();

    await env.DB.prepare(
      `
      UPDATE content_review_tokens
      SET token_status = 'checked_out',
          checked_out_by_user_id = ?,
          checked_out_at = ?,
          expires_at = ?,
          updated_at = ?
      WHERE id = ?
        AND token_status = 'available'
      `
    )
      .bind(currentUser.user_id, now, expiresAt, now, token.id)
      .run();

    await env.DB.prepare(
      `
      INSERT INTO content_review_participants (
        id,
        review_id,
        reviewer_user_id,
        participation_status,
        token_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id, reviewer_user_id)
      DO UPDATE SET
        participation_status = excluded.participation_status,
        token_id = excluded.token_id,
        updated_at = excluded.updated_at
      `
    )
      .bind(
        crypto.randomUUID(),
        reviewId,
        currentUser.user_id,
        "checked_out",
        token.id,
        now,
        now
      )
      .run();

    return json({
      ok: true,
      review_id: reviewId,
      token_id: token.id,
      expires_at: expiresAt,
      already_checked_out: false
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to check out review.",
        error: error.message
      },
      500
    );
  }
}

async function castReviewVote(request, env, reviewId) {
  try {
    const body = await request.json().catch(() => ({}));
    const tokenId = String(body.token_id || "").trim();
    const vote = String(body.vote || "").trim();

    const allowedVotes = new Set(["unbench", "keep_benched"]);

    if (!tokenId) {
      return json(
        {
          ok: false,
          error: "token_id is required."
        },
        400
      );
    }

    if (!allowedVotes.has(vote)) {
      return json(
        {
          ok: false,
          error: "Invalid review vote."
        },
        400
      );
    }

    const now = new Date().toISOString();
    const currentUser = await getCurrentUser(request, env);
    const leadershipAccess = getLeadershipAccess(currentUser);
    
    if (!leadershipAccess.can_review_content) {
      return leadershipForbiddenResponse();
    }
    
    await releaseExpiredReviewTokens(env, now);

    const review = await env.DB.prepare(
      `
      SELECT
        id,
        content_type,
        content_id,
        review_status,
        required_votes,
        total_votes,
        unbench_votes,
        keep_benched_votes
      FROM content_reviews
      WHERE id = ?
      LIMIT 1
      `
    )
      .bind(reviewId)
      .first();

    if (!review || review.review_status !== "open") {
      return json(
        {
          ok: false,
          error: "Open review not found."
        },
        404
      );
    }

    const token = await env.DB.prepare(
      `
      SELECT
        id,
        review_id,
        token_status,
        checked_out_by_user_id,
        expires_at
      FROM content_review_tokens
      WHERE id = ?
        AND review_id = ?
      LIMIT 1
      `
    )
      .bind(tokenId, reviewId)
      .first();

    if (
      !token ||
      token.token_status !== "checked_out" ||
      token.checked_out_by_user_id !== currentUser.user_id
    ) {
      return json(
        {
          ok: false,
          error: "Valid checked-out review token not found."
        },
        403
      );
    }

    if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
      await releaseExpiredReviewTokens(env, now);

      return json(
        {
          ok: false,
          error: "Review token expired. Please check out the review again."
        },
        409
      );
    }

    const unbenchIncrement = vote === "unbench" ? 1 : 0;
    const keepBenchedIncrement = vote === "keep_benched" ? 1 : 0;

    await env.DB.prepare(
      `
      UPDATE content_reviews
      SET total_votes = total_votes + 1,
          unbench_votes = unbench_votes + ?,
          keep_benched_votes = keep_benched_votes + ?
      WHERE id = ?
        AND review_status = 'open'
      `
    )
      .bind(unbenchIncrement, keepBenchedIncrement, reviewId)
      .run();

    await env.DB.prepare(
      `
      UPDATE content_review_tokens
      SET token_status = 'burned',
          checked_out_by_user_id = NULL,
          checked_out_at = NULL,
          expires_at = NULL,
          burned_at = ?,
          updated_at = ?
      WHERE id = ?
      `
    )
      .bind(now, now, tokenId)
      .run();

    await env.DB.prepare(
      `
      UPDATE content_review_participants
      SET participation_status = 'completed',
          token_id = NULL,
          updated_at = ?
      WHERE review_id = ?
        AND reviewer_user_id = ?
      `
    )
      .bind(now, reviewId, currentUser.user_id)
      .run();

    const updatedReview = await env.DB.prepare(
      `
      SELECT
        id,
        content_type,
        content_id,
        review_status,
        required_votes,
        total_votes,
        unbench_votes,
        keep_benched_votes
      FROM content_reviews
      WHERE id = ?
      LIMIT 1
      `
    )
      .bind(reviewId)
      .first();

    const resolution = await resolveReviewIfReady(env, updatedReview, now);

    return json({
      ok: true,
      review_id: reviewId,
      token_burned: true,
      resolved: resolution.resolved,
      decision: resolution.decision,
      reviews_completed: Number(updatedReview?.total_votes || 0),
      reviews_needed: Number(updatedReview?.required_votes || REVIEW_REQUIRED_VOTES)
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to cast anonymous review vote.",
        error: error.message
      },
      500
    );
  }
}

async function resolveReviewIfReady(env, review, now) {
  if (!review || review.review_status !== "open") {
    return {
      resolved: false,
      decision: null
    };
  }

  const requiredVotes = Number(review.required_votes || REVIEW_REQUIRED_VOTES);
  const totalVotes = Number(review.total_votes || 0);
  const unbenchVotes = Number(review.unbench_votes || 0);
  const keepBenchedVotes = Number(review.keep_benched_votes || 0);

  let decision = null;

  if (unbenchVotes >= REVIEW_DECISION_THRESHOLD) {
    decision = "unbench";
  }

  if (keepBenchedVotes >= REVIEW_DECISION_THRESHOLD) {
    decision = "keep_benched";
  }

  if (!decision && totalVotes >= requiredVotes) {
    decision = unbenchVotes > keepBenchedVotes
      ? "unbench"
      : "keep_benched";
  }

  if (!decision) {
    return {
      resolved: false,
      decision: null
    };
  }

  await applyReviewDecision(env, review, decision, now);

  await env.DB.prepare(
    `
    UPDATE content_reviews
    SET review_status = 'resolved',
        final_decision = ?,
        resolved_at = ?,
        resolved_by_user_id = ?
    WHERE id = ?
    `
  )
    .bind(
      decision,
      now,
      null,
      review.id
    )
    .run();

  await env.DB.prepare(
    `
    UPDATE content_review_tokens
    SET token_status = 'burned',
        checked_out_by_user_id = NULL,
        checked_out_at = NULL,
        expires_at = NULL,
        burned_at = COALESCE(burned_at, ?),
        updated_at = ?
    WHERE review_id = ?
      AND token_status IN ('available', 'checked_out')
    `
  )
   .bind(now, now, review.id)
    .run();

  return {
    resolved: true,
    decision
  };
}

async function applyReviewDecision(env, review, decision, now) {
  let moderationStatus = "under_review";
  let moderationReason = `review_${decision}`;

  if (decision === "unbench") {
    moderationStatus = "visible";
    moderationReason = "review_unbenched";
  }

  if (decision === "keep_benched") {
    moderationStatus = "benched";
    moderationReason = "review_keep_benched";
  }

  if (decision === "warn_user") {
    moderationStatus = "visible";
    moderationReason = "review_warn_user";
  }

  if (decision === "escalate_user") {
    moderationStatus = "benched";
    moderationReason = "review_escalated_user";
  }

  if (review.content_type === "post") {
    await env.DB.prepare(
      `
      UPDATE posts
      SET moderation_status = ?,
          moderation_reason = ?,
          moderated_at = ?,
          moderated_by_user_id = ?,
          updated_at = ?
      WHERE id = ?
      `
    )
      .bind(
        moderationStatus,
        moderationReason,
        now,
        RENT_A_REF_USER_ID,
        now,
        review.content_id
      )
      .run();

    return;
  }

  if (review.content_type === "comment") {
    await env.DB.prepare(
      `
      UPDATE comments
      SET moderation_status = ?,
          moderation_reason = ?,
          moderated_at = ?,
          moderated_by_user_id = ?,
          updated_at = ?
      WHERE id = ?
      `
    )
      .bind(
        moderationStatus,
        moderationReason,
        now,
        RENT_A_REF_USER_ID,
        now,
        review.content_id
      )
      .run();
  }
}

async function getProfileCommunityVibe(env, username) {
  try {
    const now = new Date().toISOString();

    if (username === DEMO_USERNAME && typeof ensureDemoAuthor === "function") {
      await ensureDemoAuthor(env, now);
    }

    const profile = await env.DB.prepare(
      `
      SELECT
        profiles.user_id,
        profiles.username,
        COALESCE(profiles.display_name, users.display_name, profiles.username) AS display_name
      FROM profiles
      JOIN users ON users.id = profiles.user_id
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
          error: "Profile not found."
        },
        404
      );
    }

    const userId = profile.user_id;

    const votesIssued = await env.DB.prepare(
      `
      SELECT
        COUNT(*) AS total_votes_issued,
        COALESCE(SUM(CASE WHEN vote_value = 1 THEN 1 ELSE 0 END), 0) AS upvotes_issued,
        COALESCE(SUM(CASE WHEN vote_value = -1 THEN 1 ELSE 0 END), 0) AS downvotes_issued
      FROM comment_votes
      WHERE voter_user_id = ?
      `
    )
      .bind(userId)
      .first();

    const chirpsIssued = await env.DB.prepare(
      `
      SELECT
        COUNT(*) AS chirps_issued,
        COALESCE(SUM(helpful_score), 0) AS tape_to_tape_issued,
        COALESCE(SUM(funny_score), 0) AS laughs_issued,
        COALESCE(SUM(heat_score), 0) AS heat_issued,
        COALESCE(SUM(rude_score), 0) AS cheap_shot_issued,
        COALESCE(SUM(targeted_score), 0) AS head_hunting_issued,
        COALESCE(SUM(spam_score), 0) AS gongshow_issued
      FROM content_chirps
      WHERE chirped_by_user_id = ?
        AND status = 'active'
      `
    )
      .bind(userId)
      .first();

    const numberValue = (value) => Number(value || 0);

    const totalVotesIssued = numberValue(votesIssued?.total_votes_issued);
    const upvotesIssued = numberValue(votesIssued?.upvotes_issued);
    const downvotesIssued = numberValue(votesIssued?.downvotes_issued);

    const chirpsIssuedCount = numberValue(chirpsIssued?.chirps_issued);

    const positiveChirpScore =
      numberValue(chirpsIssued?.tape_to_tape_issued) +
      numberValue(chirpsIssued?.laughs_issued);

    const spicyChirpScore = numberValue(chirpsIssued?.heat_issued);

    const negativeChirpScore =
      numberValue(chirpsIssued?.cheap_shot_issued) +
      numberValue(chirpsIssued?.head_hunting_issued) +
      numberValue(chirpsIssued?.gongshow_issued);

    const percent = (part, total) => {
      if (!total) return 0;
      return Math.round((Number(part || 0) / Number(total || 0)) * 100);
    };

    const downvoteRate = percent(downvotesIssued, totalVotesIssued);
    const upvoteRate = percent(upvotesIssued, totalVotesIssued);

    const toneTotal = positiveChirpScore + negativeChirpScore;

    const positiveChirpRate = percent(positiveChirpScore, toneTotal);
    const negativeChirpRate = percent(negativeChirpScore, toneTotal);

    const totalIssuedActions = totalVotesIssued + chirpsIssuedCount;

    const vibe = getCommunityVibeLabel({
      totalIssuedActions,
      totalVotesIssued,
      chirpsIssuedCount,
      upvoteRate,
      downvoteRate,
      positiveChirpRate,
      negativeChirpRate,
      negativeChirpScore
    });

    return json({
      ok: true,
      profile: {
        user_id: userId,
        username: profile.username,
        display_name: profile.display_name
      },
      community_vibe: {
        label: vibe.label,
        class_name: vibe.className,
        summary: vibe.summary,

        issued: {
          total_actions: totalIssuedActions,

          votes: {
            total: totalVotesIssued,
            upvotes: upvotesIssued,
            downvotes: downvotesIssued,
            upvote_rate: upvoteRate,
            downvote_rate: downvoteRate
          },

          chirps: {
            total: chirpsIssuedCount,

            positive_score: positiveChirpScore,
            spicy_score: spicyChirpScore,
            negative_score: negativeChirpScore,

            positive_rate: positiveChirpRate,
            negative_rate: negativeChirpRate,

            tape_to_tape_score: numberValue(chirpsIssued?.tape_to_tape_issued),
            laughs_score: numberValue(chirpsIssued?.laughs_issued),
            heat_score: spicyChirpScore,
            cheap_shot_score: numberValue(chirpsIssued?.cheap_shot_issued),
            head_hunting_score: numberValue(chirpsIssued?.head_hunting_issued),
            gongshow_score: numberValue(chirpsIssued?.gongshow_issued)
          }
        }
      }
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to load Community Vibe.",
        error: error.message
      },
      500
    );
  }
}

function getCommunityVibeLabel(metrics) {
  const totalIssuedActions = Number(metrics.totalIssuedActions || 0);
  const totalVotesIssued = Number(metrics.totalVotesIssued || 0);
  const chirpsIssuedCount = Number(metrics.chirpsIssuedCount || 0);
  const upvoteRate = Number(metrics.upvoteRate || 0);
  const downvoteRate = Number(metrics.downvoteRate || 0);
  const positiveChirpRate = Number(metrics.positiveChirpRate || 0);
  const negativeChirpRate = Number(metrics.negativeChirpRate || 0);
  const negativeChirpScore = Number(metrics.negativeChirpScore || 0);

  if (totalIssuedActions < 10) {
    return {
      label: "Still Warming Up",
      className: "vibe-warming-up",
      summary: "Not enough voting or chirping history yet."
    };
  }

  if (totalVotesIssued >= 15 && downvoteRate >= 70) {
    return {
      label: "Hard Marker",
      className: "vibe-hard-marker",
      summary: "Mostly uses votes to knock content down."
    };
  }

  if (chirpsIssuedCount >= 8 && negativeChirpRate >= 70) {
    return {
      label: "Chirp Goblin",
      className: "vibe-chirp-goblin",
      summary: "Throws a lot of negative chirp energy."
    };
  }

  if (negativeChirpScore >= 25 && negativeChirpRate >= 55) {
    return {
      label: "Bench Scout",
      className: "vibe-bench-scout",
      summary: "Often spots rough tone, but may lean critical."
    };
  }

  if (totalVotesIssued >= 10 && upvoteRate >= 70 && positiveChirpRate >= 50) {
    return {
      label: "Good Teammate",
      className: "vibe-good-teammate",
      summary: "Mostly boosts and supports the room."
    };
  }

  if (chirpsIssuedCount >= 8 && positiveChirpRate >= 70) {
    return {
      label: "Playmaker",
      className: "vibe-playmaker",
      summary: "Uses chirps to highlight good contributions."
    };
  }

  return {
    label: "Balanced Teammate",
    className: "vibe-balanced-teammate",
    summary: "Mixes positive and critical feedback."
  };
}

async function getProfileKarma(env, username) {
  try {
    if (username === DEMO_USERNAME) {
      await ensureDemoAuthor(env, new Date().toISOString());
    }

    const profile = await env.DB.prepare(
      `
      SELECT
        profiles.user_id,
        profiles.username,
        profiles.display_name
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
          error: "Profile not found."
        },
        404
      );
    }

    const postStats = await env.DB.prepare(
      `
      SELECT COUNT(*) AS public_posts
      FROM posts
      WHERE author_user_id = ?
        AND visibility = 'public'
        AND status = 'published'
      `
    )
      .bind(profile.user_id)
      .first();

    const commentStats = await env.DB.prepare(
      `
      SELECT
        COUNT(*) AS visible_comments,
        COALESCE(SUM(score), 0) AS comment_karma
      FROM comments
      WHERE author_user_id = ?
        AND status = 'visible'
      `
    )
      .bind(profile.user_id)
      .first();

    const postChirps = await env.DB.prepare(
      `
      SELECT COUNT(*) AS chirps_on_posts
      FROM content_chirps
      WHERE content_type = 'post'
        AND status = 'active'
        AND content_id IN (
          SELECT id
          FROM posts
          WHERE author_user_id = ?
        )
      `
    )
      .bind(profile.user_id)
      .first();

    const commentChirps = await env.DB.prepare(
      `
      SELECT COUNT(*) AS chirps_on_comments
      FROM content_chirps
      WHERE content_type = 'comment'
        AND status = 'active'
        AND content_id IN (
          SELECT id
          FROM comments
          WHERE author_user_id = ?
        )
      `
    )
      .bind(profile.user_id)
      .first();

    const chirpProfileStats = await env.DB.prepare(
      `
      SELECT
        COUNT(*) AS active_chirps_received,
        COALESCE(SUM(helpful_score), 0) AS helpful_score_sum,
        COALESCE(SUM(funny_score), 0) AS funny_score_sum,
        COALESCE(SUM(heat_score), 0) AS heat_score_sum,
        COALESCE(SUM(rude_score), 0) AS rude_score_sum,
        COALESCE(SUM(targeted_score), 0) AS targeted_score_sum,
        COALESCE(SUM(spam_score), 0) AS spam_score_sum
      FROM content_chirps
      WHERE status = 'active'
        AND (
          (
            content_type = 'post'
            AND content_id IN (
              SELECT id
              FROM posts
              WHERE author_user_id = ?
            )
          )
          OR
          (
            content_type = 'comment'
            AND content_id IN (
              SELECT id
              FROM comments
              WHERE author_user_id = ?
            )
          )
        )
      `
    )
      .bind(profile.user_id, profile.user_id)
      .first();

    const publicPosts = Number(postStats?.public_posts || 0);
    const visibleComments = Number(commentStats?.visible_comments || 0);
    const commentKarma = Number(commentStats?.comment_karma || 0);

    const chirpsOnPosts = Number(postChirps?.chirps_on_posts || 0);
    const chirpsOnComments = Number(commentChirps?.chirps_on_comments || 0);
    const chirpsReceived = Number(chirpProfileStats?.active_chirps_received || 0);

    const helpfulTotal = Number(chirpProfileStats?.helpful_score_sum || 0);
    const funnyTotal = Number(chirpProfileStats?.funny_score_sum || 0);
    const heatTotal = Number(chirpProfileStats?.heat_score_sum || 0);
    const rudeTotal = Number(chirpProfileStats?.rude_score_sum || 0);
    const targetedTotal = Number(chirpProfileStats?.targeted_score_sum || 0);
    const spamTotal = Number(chirpProfileStats?.spam_score_sum || 0);

    const postKarma = publicPosts;

    const positiveChirpKarma = Math.round(
      helpfulTotal * 0.35 +
      funnyTotal * 0.25
    );

    const chirpPenalty = Math.round(
      rudeTotal * 0.6 +
      targetedTotal * 1.2 +
      spamTotal * 0.8
    );

    const lockerRoomKarma =
      postKarma +
      commentKarma +
      positiveChirpKarma -
      chirpPenalty;

    const leadership = getLeadershipTier({
      lockerRoomKarma,
      chirpsReceived,
      helpfulTotal,
      funnyTotal,
      rudeTotal,
      targetedTotal,
      spamTotal
    });

    let karmaLabel = "Rookie";

    if (lockerRoomKarma >= 100) {
      karmaLabel = "Locker Room Legend";
    } else if (lockerRoomKarma >= 50) {
      karmaLabel = "Captain Material";
    } else if (lockerRoomKarma >= 25) {
      karmaLabel = "Team Leader";
    } else if (lockerRoomKarma >= 10) {
      karmaLabel = "Good Teammate";
    } else if (lockerRoomKarma < 0) {
      karmaLabel = "In the Box";
    }

    return json({
      ok: true,
      username: profile.username,
      display_name: profile.display_name,
      karma: {
        locker_room_karma: lockerRoomKarma,
        karma_label: karmaLabel,
        leadership,

        post_karma: postKarma,
        comment_karma: commentKarma,
        positive_chirp_karma: positiveChirpKarma,
        chirp_penalty: chirpPenalty,

        public_posts: publicPosts,
        visible_comments: visibleComments,

        chirps_received: chirpsReceived,
        chirps_on_posts: chirpsOnPosts,
        chirps_on_comments: chirpsOnComments,

        chirp_profile_totals: {
          tape_to_tape: helpfulTotal,
          laughs: funnyTotal,
          heat: heatTotal,
          cheap_shot: rudeTotal,
          head_hunting: targetedTotal,
          gongshow: spamTotal
        }
      }
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: "Failed to calculate karma.",
        error: error.message
      },
      500
    );
  }
}

function getLeadershipTier({
  lockerRoomKarma,
  chirpsReceived,
  helpfulTotal,
  funnyTotal,
  rudeTotal,
  targetedTotal,
  spamTotal
}) {
  const positiveRoomEnergy = helpfulTotal + funnyTotal;
  const penaltyEnergy = rudeTotal + targetedTotal * 2 + spamTotal;

  const averagePositive =
    chirpsReceived > 0 ? positiveRoomEnergy / chirpsReceived : 0;

  const averagePenalty =
    chirpsReceived > 0 ? penaltyEnergy / chirpsReceived : 0;

  const cleanEnoughForA = averagePenalty <= 2.75;
  const cleanEnoughForC = averagePenalty <= 1.75;

  if (lockerRoomKarma >= 50 && cleanEnoughForC && averagePositive >= 4) {
    return {
      tier: "captain",
      label: "Captain",
      letter: "C",
      name_class: "name-captain",
      can_review_content: true,
      can_review_accounts: true
    };
  }

  if (lockerRoomKarma >= 25 && cleanEnoughForA) {
    return {
      tier: "alternate_captain",
      label: "Alternate Captain",
      letter: "A",
      name_class: "name-alternate-captain",
      can_review_content: true,
      can_review_accounts: false
    };
  }

  if (lockerRoomKarma >= 10) {
    return {
      tier: "glue_guy",
      label: "Glue Guy",
      letter: null,
      name_class: "name-glue-guy",
      can_review_content: false,
      can_review_accounts: false
    };
  }

  if (lockerRoomKarma >= 3) {
    return {
      tier: "good_teammate",
      label: "Good Teammate",
      letter: null,
      name_class: "name-good-teammate",
      can_review_content: false,
      can_review_accounts: false
    };
  }

  return {
    tier: "rookie",
    label: "Rookie",
    letter: null,
    name_class: "",
    can_review_content: false,
    can_review_accounts: false
  };
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
        profiles.jersey_number,
        profiles.leadership_role,
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
      leadership_role,
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      DEMO_PROFILE_ID,
      DEMO_USER_ID,
      DEMO_USERNAME,
      "Demo Skater",
      "Adult hockey player tracking progress, ice sessions, games, photos, videos, and skill development.",
      "Right Wing",
      "right",
      "11",
      "none",
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

  for (const item of value.split(/[,\s]+/)) {
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

function slugifyUsername(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
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

function normalizeHockeyPosition(value) {
  const allowedPositions = [
    "Right Wing",
    "Left Wing",
    "Center",
    "Right Defenseman",
    "Left Defenseman",
    "Goalie"
  ];

  const aliases = {
    rw: "Right Wing",
    "right wing": "Right Wing",
    lw: "Left Wing",
    "left wing": "Left Wing",
    c: "Center",
    center: "Center",
    centre: "Center",
    rd: "Right Defenseman",
    "right defenseman": "Right Defenseman",
    "right defensemen": "Right Defenseman",
    "right defense": "Right Defenseman",
    ld: "Left Defenseman",
    "left defenseman": "Left Defenseman",
    "left defensemen": "Left Defenseman",
    "left defense": "Left Defenseman",
    goalie: "Goalie",
    goaltender: "Goalie",
    goalkeeper: "Goalie"
  };

  const raw = String(value || "Right Wing").trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");

  const position = aliases[normalized] || allowedPositions.find(
    (allowed) => allowed.toLowerCase() === normalized
  );

  if (!position) {
    return {
      ok: false,
      error: "Position must be a valid hockey position, not a leadership title.",
      allowed_positions: allowedPositions
    };
  }

  return {
    ok: true,
    position,
    allowed_positions: allowedPositions
  };
}

function normalizeLeadershipRole(value, position) {
  const allowedLeadershipRoles = ["none", "alternate_captain", "captain"];

  const aliases = {
    "": "none",
    none: "none",
    member: "none",
    player: "none",
    a: "alternate_captain",
    alternate: "alternate_captain",
    "alternate captain": "alternate_captain",
    "assistant captain": "alternate_captain",
    c: "captain",
    captain: "captain"
  };

  const raw = String(value || "none").trim();
  const normalized = raw.toLowerCase().replace(/[-_\s]+/g, " ");
  const leadershipRole = aliases[normalized] || String(value || "none").trim();

  if (!allowedLeadershipRoles.includes(leadershipRole)) {
    return {
      ok: false,
      error: "leadership_role must be none, alternate_captain, or captain.",
      allowed_leadership_roles: allowedLeadershipRoles
    };
  }

  if (position === "Goalie" && leadershipRole !== "none") {
    return {
      ok: false,
      error: "Goalies cannot be Captain or Alternate Captain in this app model.",
      allowed_leadership_roles: allowedLeadershipRoles
    };
  }

  const labels = {
    none: "None",
    alternate_captain: "Alternate Captain",
    captain: "Captain"
  };

  return {
    ok: true,
    leadership_role: leadershipRole,
    label: labels[leadershipRole],
    allowed_leadership_roles: allowedLeadershipRoles
  };
}

function normalizeJerseyNumber(value) {
  const raw = String(value || "").trim();

  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      error: "Jersey number must be a whole number from 1 to 99."
    };
  }

  if (/^0\d+/.test(raw)) {
    return {
      ok: false,
      error: "Jersey number cannot use leading zeroes. Use 1-99 only."
    };
  }

  const number = Number(raw);

  if (!Number.isInteger(number) || number < 1 || number > 99) {
    return {
      ok: false,
      error: "Jersey number must be a whole number from 1 to 99."
    };
  }

  const warnings = [];

  if (number === 1) {
    warnings.push("Number 1 is traditionally associated with goaltenders.");
  }

  if (number >= 30 && number <= 39) {
    warnings.push("Numbers in the 30s are traditionally common goalie numbers.");
  }

  if (number === 66) {
    warnings.push("Number 66 is widely treated as off-limits out of respect for Mario Lemieux.");
  }

  if (number === 69) {
    warnings.push("Number 69 is often discouraged by teams and leagues.");
  }

  if (number === 99) {
    warnings.push("Number 99 is retired league-wide in the NHL for Wayne Gretzky and is off-limits in many organized leagues.");
  }

  return {
    ok: true,
    jersey_number: String(number),
    warnings
  };
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
      ...SECURITY_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
