-- MyHockeyBlog D1 Schema
-- Initial database schema for public hockey progress profiles, posts, media, comments,
-- tagging, calendar events, game stats, and media view tracking.
--
-- Upload location recommendation:
--   /schema.sql at the root of the GitHub repo, next to wrangler.toml and package.json.
--
-- Notes:
--   - D1 is SQLite-compatible.
--   - IDs are TEXT so the Worker/app can generate UUIDs.
--   - Boolean-style values use INTEGER 0/1.
--   - Media files themselves should live in R2 later; D1 stores metadata only.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Users and Profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  auth_provider TEXT,
  auth_provider_user_id TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  profile_image_media_id TEXT,
  banner_image_media_id TEXT,

  position TEXT,
  shoots TEXT CHECK (shoots IS NULL OR shoots IN ('left', 'right')),
  jersey_number TEXT,
  team_name TEXT,
  home_rink TEXT,
  skill_level TEXT,

  profile_visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (profile_visibility IN ('public', 'private', 'unlisted')),
  show_stats_publicly INTEGER NOT NULL DEFAULT 1 CHECK (show_stats_publicly IN (0, 1)),
  show_calendar_publicly INTEGER NOT NULL DEFAULT 0 CHECK (show_calendar_publicly IN (0, 1)),

  allow_post_tagging INTEGER NOT NULL DEFAULT 1 CHECK (allow_post_tagging IN (0, 1)),
  allow_media_tagging INTEGER NOT NULL DEFAULT 1 CHECK (allow_media_tagging IN (0, 1)),
  require_tag_approval INTEGER NOT NULL DEFAULT 1 CHECK (require_tag_approval IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Posts and Comments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL,
  title TEXT,
  body TEXT,
  post_type TEXT NOT NULL DEFAULT 'progress'
    CHECK (post_type IN ('progress', 'game', 'practice', 'gear', 'training', 'general')),
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'unlisted')),
  comments_enabled INTEGER NOT NULL DEFAULT 1 CHECK (comments_enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived', 'deleted')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_user_id TEXT,
  parent_comment_id TEXT,
  body TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden', 'deleted', 'flagged')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comment_votes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  voter_user_id TEXT,
  voter_fingerprint TEXT,
  vote_value INTEGER NOT NULL CHECK (vote_value IN (-1, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (voter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(comment_id, voter_user_id),
  UNIQUE(comment_id, voter_fingerprint)
);

-- ---------------------------------------------------------------------------
-- Calendar Events and Game Stats
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'other'
    CHECK (event_type IN ('ice_session', 'practice', 'game', 'tournament', 'training', 'gear', 'other')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  location TEXT,
  opponent TEXT,
  home_away TEXT CHECK (home_away IS NULL OR home_away IN ('home', 'away', 'neutral')),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private', 'unlisted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_stats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  goals INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
  assists INTEGER NOT NULL DEFAULT 0 CHECK (assists >= 0),
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  plus_minus INTEGER NOT NULL DEFAULT 0,
  shots_on_goal INTEGER NOT NULL DEFAULT 0 CHECK (shots_on_goal >= 0),
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  blocked_shots INTEGER NOT NULL DEFAULT 0 CHECK (blocked_shots >= 0),
  penalty_minutes INTEGER NOT NULL DEFAULT 0 CHECK (penalty_minutes >= 0),

  goalie_shots_against INTEGER CHECK (goalie_shots_against IS NULL OR goalie_shots_against >= 0),
  goalie_saves INTEGER CHECK (goalie_saves IS NULL OR goalie_saves >= 0),
  goalie_goals_against INTEGER CHECK (goalie_goals_against IS NULL OR goalie_goals_against >= 0),

  result TEXT CHECK (result IS NULL OR result IN ('win', 'loss', 'tie', 'ot_win', 'ot_loss', 'shootout_win', 'shootout_loss')),
  team_score INTEGER CHECK (team_score IS NULL OR team_score >= 0),
  opponent_score INTEGER CHECK (opponent_score IS NULL OR opponent_score >= 0),
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(event_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Media: Photos, Videos, GIFs, and Attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'gif', 'other')),
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  width INTEGER CHECK (width IS NULL OR width >= 0),
  height INTEGER CHECK (height IS NULL OR height >= 0),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  caption TEXT,
  alt_text TEXT,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'unlisted')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'processing', 'failed', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE,
  UNIQUE(post_id, media_id)
);

CREATE TABLE IF NOT EXISTS media_views (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  viewer_user_id TEXT,
  viewer_fingerprint TEXT,
  viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Tags: Topic/Post Tags and User Tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS post_tags (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE(post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS post_user_tags (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  tagged_user_id TEXT NOT NULL,
  tagged_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tagged_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tagged_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(post_id, tagged_user_id)
);

CREATE TABLE IF NOT EXISTS media_user_tags (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  tagged_user_id TEXT NOT NULL,
  tagged_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),

  x_position REAL CHECK (x_position IS NULL OR (x_position >= 0 AND x_position <= 1)),
  y_position REAL CHECK (y_position IS NULL OR (y_position >= 0 AND y_position <= 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (tagged_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tagged_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(media_id, tagged_user_id)
);

-- ---------------------------------------------------------------------------
-- Helpful Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

CREATE INDEX IF NOT EXISTS idx_posts_author_user_id ON posts(author_user_id);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_status ON posts(visibility, status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_user_id ON comments(author_user_id);
CREATE INDEX IF NOT EXISTS idx_comment_votes_comment_id ON comment_votes(comment_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_user_id ON calendar_events(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_game_stats_user_id ON game_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_game_stats_event_id ON game_stats(event_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_user_id ON media_assets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_media_type ON media_assets(media_type);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_media_id ON post_media(media_id);
CREATE INDEX IF NOT EXISTS idx_media_views_media_id ON media_views(media_id);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id ON post_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_post_user_tags_tagged_user_id ON post_user_tags(tagged_user_id);
CREATE INDEX IF NOT EXISTS idx_media_user_tags_tagged_user_id ON media_user_tags(tagged_user_id);
