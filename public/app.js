const DEMO_USERNAME = "demo-skater";

const $ = (selector) => document.querySelector(selector);

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Unknown date";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Request failed: ${url}`);
  }

  return data;
}

async function loadHomepage() {
  try {
    const [profileData, postsData] = await Promise.all([
      fetchJson(`/api/profile/${encodeURIComponent(DEMO_USERNAME)}`),
      fetchJson("/api/posts")
    ]);

    renderProfile(profileData);
    renderPosts(postsData.posts || []);
    renderEventsPlaceholder();
    wireForms();
  } catch (error) {
    renderError(error);
  }
}

function renderProfile(data) {
  const profile = data.profile;
  const stats = data.stats || {};
  const posts = data.posts || [];

  setText("#profile-name", profile.display_name || profile.username || "Hockey Player");

  const bioParts = [
    profile.position,
    profile.skill_level,
    profile.team_name
  ].filter(Boolean);

  const bioLine = bioParts.length ? bioParts.join(" • ") : profile.bio;

  setText("#profile-bio", bioLine || "Hockey progress profile powered by D1.");

  setText("#metric-posts", posts.length);
  setText("#metric-views", "0");
  setText("#metric-events", stats.games_played ?? 0);

  setText("#stat-goals", stats.goals ?? 0);
  setText("#stat-assists", stats.assists ?? 0);
  setText("#stat-blocks", stats.blocked_shots ?? 0);
  setText("#stat-sessions", stats.games_played ?? 0);
}

function renderPosts(posts) {
  const container = $("#post-list");
  if (!container) return;

  container.innerHTML = "";

  if (!posts.length) {
    container.innerHTML = `
      <div class="empty-state">
        No public posts found yet.
      </div>
    `;
    return;
  }

  for (const post of posts) {
    const card = document.createElement("article");
    card.className = "post-card";

    const commentsStatus = post.comments_enabled ? "on" : "off";
    const author = post.author_display_name || post.author_username || "Unknown skater";

    card.innerHTML = `
      <div class="post-meta">
        <span class="badge ${escapeHtml(post.visibility)}">${escapeHtml(post.visibility)}</span>
        <span class="badge">${escapeHtml(post.post_type || "post")}</span>
        <span class="badge">comments: ${commentsStatus}</span>
        <span class="badge">${formatDate(post.published_at || post.created_at)}</span>
      </div>

      <h3>${escapeHtml(post.title || "Untitled post")}</h3>

      <p class="muted">${escapeHtml(post.body || "")}</p>

      <p class="muted small">
        Posted by ${escapeHtml(author)}
        ${post.author_position ? ` • ${escapeHtml(post.author_position)}` : ""}
        ${post.author_jersey_number ? ` • #${escapeHtml(post.author_jersey_number)}` : ""}
      </p>
    `;

    container.appendChild(card);
  }
}

function renderEventsPlaceholder() {
  const container = $("#event-list");
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      Calendar writes are coming next. Game stats are already stored in D1 for the demo profile.
    </div>
  `;
}

function wireForms() {
  const postForm = $("#post-form");
  const eventForm = $("#event-form");
  const resetButton = $("#reset-demo");

  if (postForm && !postForm.dataset.wired) {
    postForm.dataset.wired = "true";

    postForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitButton = postForm.querySelector("button[type='submit']");
      const form = new FormData(postForm);

      const title = String(form.get("title") || "").trim();
      const body = String(form.get("body") || "").trim();
      const visibility = String(form.get("visibility") || "public").trim();
      const comments = String(form.get("comments") || "allow").trim();

      if (!title || !body) {
        alert("Please enter both a title and an update.");
        return;
      }

      try {
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = "Saving to D1...";
        }

        await fetchJson("/api/posts", {
          method: "POST",
          body: JSON.stringify({
            title,
            body,
            post_type: "progress",
            visibility,
            comments_enabled: comments === "allow"
          })
        });

        postForm.reset();

        await loadHomepage();

        document.querySelector("#posts")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      } catch (error) {
        alert(`Could not save post: ${error.message}`);
        console.error(error);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Save post";
        }
      }
    });
  }

  if (eventForm && !eventForm.dataset.wired) {
    eventForm.dataset.wired = "true";

    eventForm.addEventListener("submit", (event) => {
      event.preventDefault();
      alert("Calendar event creation is coming next. Posts are the first D1 write feature.");
    });
  }

  if (resetButton && !resetButton.dataset.wired) {
    resetButton.dataset.wired = "true";

    resetButton.addEventListener("click", () => {
      alert("Local demo reset is disabled. Posts are now stored in D1.");
    });
  }
}

function renderError(error) {
  const container = $("#post-list");

  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Could not load D1 data.</strong><br />
        ${escapeHtml(error.message)}
      </div>
    `;
  }

  console.error(error);
}

loadHomepage();
