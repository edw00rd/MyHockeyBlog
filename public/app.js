const DEMO_USERNAME = "demo-skater";
const RENT_A_REF_USER_ID = "user_rent_a_ref_001";
const RENT_A_REF_USERNAME = "rent-a-ref";

const SELECTED_USER_STORAGE_KEY = "myhockeyblog.selectedUserId";

let currentUser = null;
let knownUsers = [];

const $ = (selector) => document.querySelector(selector);

const CHIRP_OPTIONS = [
  { value: 1, type: "good_chirp", label: "Good Chirp", description: "funny hockey banter" },
  { value: 2, type: "tape_to_tape", label: "Tape-to-Tape", description: "useful feedback that lands clean" },
  { value: 3, type: "spicy_but_fair", label: "Spicy but Fair", description: "hot, but still in bounds" },
  { value: 4, type: "tone_check", label: "Tone Check", description: "drifting into cheap-shot territory" },
  { value: 5, type: "cheap_shot", label: "Cheap Shot", description: "personal or disrespectful" },
  { value: 6, type: "gongshow", label: "Gongshow", description: "spam, trolling, or noise" }
];

function getSelectedUserId() {
  return localStorage.getItem(SELECTED_USER_STORAGE_KEY) || "";
}

function setSelectedUserId(userId) {
  if (userId) {
    localStorage.setItem(SELECTED_USER_STORAGE_KEY, userId);
  } else {
    localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
  }
}

function getCurrentUsername() {
  return currentUser?.username || DEMO_USERNAME;
}

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
  const selectedUserId = getSelectedUserId();

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    ...(selectedUserId ? { "x-demo-user-id": selectedUserId } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { ok: false, message: await response.text() };

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Request failed: ${url}`);
  }

  return data;
}

async function loadHomepage() {
  try {
    await loadIdentity();

    const username = getCurrentUsername();

    const [profileData, postsData, karmaData, reviewsData, vibeData] = await Promise.all([
      fetchJson(`/api/profile/${encodeURIComponent(username)}`),
      fetchJson("/api/posts"),
      fetchJson(`/api/profile/${encodeURIComponent(username)}/karma`),
      fetchJson("/api/reviews"),
      fetchJson(`/api/profile/${encodeURIComponent(username)}/community-vibe`)
    ]);

    renderUserControls();
    renderProfile(profileData);
    renderKarma(karmaData);
    renderLeadership(karmaData);
    renderProfileChirpTone(karmaData);
    wireChirpProfileToggles();
    renderCommunityVibe(vibeData);
    renderPosts(postsData.posts || []);
    renderSituationRoom(reviewsData.reviews || []);
    renderEventsPlaceholder();
    wireUserControls();
    wireForms();
  } catch (error) {
    renderError(error);
  }
}

async function loadIdentity() {
  try {
    const meData = await fetchJson("/api/me");
    currentUser = meData.user || null;

    if (currentUser?.user_id) {
      setSelectedUserId(currentUser.user_id);
    }
  } catch (error) {
    setSelectedUserId("");

    const fallbackMeData = await fetchJson("/api/me");
    currentUser = fallbackMeData.user || null;

    if (currentUser?.user_id) {
      setSelectedUserId(currentUser.user_id);
    }
  }

  const usersData = await fetchJson("/api/users");
  knownUsers = usersData.users || [];
}

function renderUserControls() {
  const name = $("#current-user-name");
  const meta = $("#current-user-meta");
  const select = $("#current-user-select");
  const apiReviewsLink = $("#api-reviews-link");

  if (apiReviewsLink) {
    apiReviewsLink.hidden = !currentUserCanReviewContent();
  }

  if (!currentUser) return;

  if (name) {
    name.textContent = currentUser.display_name || currentUser.username || "Unknown User";
  }

  if (meta) {
    const leadershipAccess = getCurrentLeadershipAccess();
    
    const parts = [
      currentUser.username ? `@${currentUser.username}` : "",
      currentUser.position || "",
      currentUser.jersey_number ? `#${currentUser.jersey_number}` : "",
      leadershipAccess.label ? `Access: ${leadershipAccess.label}` : "",
      currentUser.team_name || "",
      currentUser.skill_level || ""
    ].filter(Boolean);

    meta.textContent = parts.join(" • ");
  }

  if (select) {
    select.innerHTML = knownUsers
      .map((user) => {
        const labelParts = [
          user.display_name || user.username || user.user_id,
          user.username ? `@${user.username}` : "",
          user.position || "",
          user.jersey_number ? `#${user.jersey_number}` : ""
        ].filter(Boolean);

        return `
          <option value="${escapeHtml(user.user_id)}">
            ${escapeHtml(labelParts.join(" • "))}
          </option>
        `;
      })
      .join("");

    select.value = currentUser.user_id;
  }
}

function wireUserControls() {
  const select = $("#current-user-select");
  const form = $("#user-create-form");

  if (select && !select.dataset.wired) {
    select.dataset.wired = "true";

    select.addEventListener("change", async () => {
      const userId = select.value;

      setSelectedUserId(userId);

      try {
        await loadHomepage();
      } catch (error) {
        alert(`Could not switch user: ${error.message}`);
      }
    });
  }

  if (form && !form.dataset.wired) {
    form.dataset.wired = "true";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const button = form.querySelector("button[type='submit']");
      const data = new FormData(form);

      const displayName = String(data.get("display_name") || "").trim();
      const username = String(data.get("username") || "").trim();
      const position = String(data.get("position") || "Right Wing").trim();
      const jerseyNumber = String(data.get("jersey_number") || "").trim();
      const leadershipRole = String(data.get("leadership_role") || "none").trim();
      const teamName = String(data.get("team_name") || "MyHockeyBlog Test Team").trim();

      if (!displayName) {
        alert("Display name is required.");
        return;
      }

      try {
        if (button) {
          button.disabled = true;
          button.textContent = "Creating...";
        }

        const result = await fetchJson("/api/users", {
          method: "POST",
          body: JSON.stringify({
            display_name: displayName,
            username,
            position,
            jersey_number: jerseyNumber,
            leadership_role: leadershipRole,
            team_name: teamName,
            skill_level: "Demo user"
          })
        });

        if (result.user?.user_id) {
          setSelectedUserId(result.user.user_id);
        }

        form.reset();
        await loadHomepage();
      } catch (error) {
        alert(`Could not create user: ${error.message}`);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "Create and switch";
        }
      }
    });
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

function renderKarma(data) {
  const karma = data.karma || {};

  setText("#metric-karma", karma.locker_room_karma ?? 0);
  setText(
    "#karma-label",
    `Locker Room Karma: ${karma.karma_label || "Rookie"}`
  );
}

function getCurrentLeadershipAccess() {
  return currentUser?.leadership_access || {
    tier: "member",
    label: "Member",
    letter: null,
    can_review_content: false,
    can_review_accounts: false
  };
}

function renderCommunityVibe(data) {
  const container = $("#community-vibe");
  if (!container) return;

  const vibe = data?.community_vibe || {};
  const issued = vibe.issued || {};
  const issuedVotes = issued.votes || {};
  const issuedChirps = issued.chirps || {};

  const label = vibe.label || "Still Warming Up";
  const rawClassName = vibe.class_name || "vibe-warming-up";
  const className = String(rawClassName).replace(/[^a-z0-9_-]/gi, "");
  const summary = vibe.summary || "Not enough voting or chirping history yet.";

  const totalActions = Number(issued.total_actions || 0);

  const upvotes = Number(issuedVotes.upvotes || 0);
  const downvotes = Number(issuedVotes.downvotes || 0);
  const upvoteRate = Number(issuedVotes.upvote_rate || 0);
  const downvoteRate = Number(issuedVotes.downvote_rate || 0);

  const chirpsTotal = Number(issuedChirps.total || 0);
  const positiveRate = Number(issuedChirps.positive_rate || 0);
  const negativeRate = Number(issuedChirps.negative_rate || 0);
  const spicyScore = Number(issuedChirps.spicy_score || 0);

  container.className = `community-vibe ${className}`;

  container.innerHTML = `
    <div class="community-vibe-header">
      <span class="badge vibe-badge">Community Vibe</span>
      <strong>${escapeHtml(label)}</strong>
    </div>

    <p class="muted small">${escapeHtml(summary)}</p>

    <div class="community-vibe-stats">
      <div>
        <strong>${totalActions}</strong>
        <span>actions issued</span>
      </div>

      <div>
        <strong>${upvotes}</strong>
        <span>upvotes</span>
      </div>

      <div>
        <strong>${downvotes}</strong>
        <span>downvotes</span>
      </div>

      <div>
        <strong>${chirpsTotal}</strong>
        <span>chirps</span>
      </div>
    </div>

    <div class="community-vibe-meter">
      <div class="community-vibe-meter-row">
        <span>Upvote rate</span>
        <strong>${upvoteRate}%</strong>
      </div>

      <div class="community-vibe-meter-row">
        <span>Downvote rate</span>
        <strong>${downvoteRate}%</strong>
      </div>

      <div class="community-vibe-meter-row">
        <span>Positive chirp rate</span>
        <strong>${positiveRate}%</strong>
      </div>

      <div class="community-vibe-meter-row">
        <span>Negative chirp rate</span>
        <strong>${negativeRate}%</strong>
      </div>

      <div class="community-vibe-meter-row">
        <span>Spicy heat score</span>
        <strong>${spicyScore}</strong>
      </div>
    </div>
  `;
}

function currentUserCanReviewContent() {
  return Boolean(getCurrentLeadershipAccess().can_review_content);
}

function renderLeadership(data) {
  const leadership = data.karma?.leadership || {};
  const profileName = $("#profile-name");
  const letter = $("#leadership-letter");
  const note = $("#leadership-note");

  if (profileName) {
    profileName.classList.remove(
      "name-good-teammate",
      "name-glue-guy",
      "name-alternate-captain",
      "name-captain"
    );

    if (leadership.name_class) {
      profileName.classList.add(leadership.name_class);
    }
  }

  if (letter) {
    if (leadership.letter) {
      letter.textContent = leadership.letter;
      letter.hidden = false;
      letter.className = `leadership-letter leadership-${leadership.tier}`;
    } else {
      letter.textContent = "";
      letter.hidden = true;
      letter.className = "leadership-letter";
    }
  }

  if (note) {
    if (leadership.tier && leadership.tier !== "rookie") {
      note.textContent = leadership.letter
        ? `${leadership.label} · Leadership Group`
        : leadership.label;
      note.hidden = false;
    } else {
      note.textContent = "";
      note.hidden = true;
    }
  }
}

function buildProfileChirpProfileFromKarma(data) {
  const karma = data.karma || {};
  const totals = karma.chirp_profile_totals || {};
  const chirpCount = Number(karma.chirps_received || 0);

  const averageScore = (value) => {
    if (!chirpCount) return 0;

    return Math.round((Number(value || 0) / chirpCount) * 10) / 10;
  };

  return {
    chirp_count: chirpCount,
    helpful_score: averageScore(totals.tape_to_tape),
    funny_score: averageScore(totals.laughs),
    heat_score: averageScore(totals.heat),
    rude_score: averageScore(totals.cheap_shot),
    targeted_score: averageScore(totals.head_hunting),
    spam_score: averageScore(totals.gongshow)
  };
}

function renderProfileChirpTone(data) {
  const container = $("#profile-chirp-profile");
  if (!container) return;

  const profile = buildProfileChirpProfileFromKarma(data);
  const chirpCount = Number(profile.chirp_count || 0);

  if (!chirpCount) {
    container.innerHTML = `
      <div class="profile-tone-empty">
        No Locker Room Tone yet. Chirps on posts and comments will shape this profile.
      </div>
    `;
    return;
  }

  const label = getChirpProfileLabel(profile) || "Locker Room Tone";

  container.innerHTML = `
    <div class="profile-tone-header">
      <span class="badge chirp-badge">${escapeHtml(label)}</span>
    </div>

    ${renderCollapsibleChirpProfile(profile, "Locker Room Tone")}
  `;
}

function hasCurrentUserChirpedContent(content) {
  return (
    Number(content.user_chirped || 0) === 1 ||
    Boolean(content.user_chirp_type)
  );
}

function isRentARefReadyForCurrentUser(content) {
  if (!hasCurrentUserChirpedContent(content)) return false;

  const userRentARefCalledAt = content.user_rent_a_ref_called_at || "";

  return !userRentARefCalledAt;
}

function isRentARefReadyForComment(comment) {
  if (isRentARefComment(comment)) return false;

  return isRentARefReadyForCurrentUser(comment);
}

function isRentARefReady(post) {
  return isRentARefReadyForCurrentUser(post);
}

function getRentARefTitle(content) {
  if (!hasCurrentUserChirpedContent(content)) {
    return "Chirp this first, then Rent-a-Ref can make a call.";
  }

  if (!isRentARefReadyForCurrentUser(content)) {
    return "You already called Rent-a-Ref on this one.";
  }

  return "Rent-a-Ref can make a call.";
}

function pickRandomLine(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    return "";
  }

  return lines[Math.floor(Math.random() * lines.length)];
}

function getModerationMessage(contentType, status, reason) {
  const label = contentType === "comment" ? "comment" : "post";

  if (status === "under_review") {
    return {
      title: pickRandomLine([
        "🚨 Sent Upstairs for Review",
        "🚨 Sent to the Situation Room",
        "🚨 Under Review on the Play",
        "🚨 The Play is Under Review",
        "🚨 Sent to Toronto",
        "🚨 Situation Room Review",
        "🚨 Review on the Play",
        "🚨 Sent Upstairs: Review on the Play"
      ]),
      body: pickRandomLine([
        `This ${label} contains a link or media and was flagged by Rent-a-Ref for review on the play.`,
        `This ${label} has link/media risk and is waiting for a closer look.`,
        `Rent-a-Ref saw a link or media on the play and kicked this one upstairs.`,
        `This ${label} was flagged for review because links or media need human eyes.`
      ])
    };
  }

  if (reason === "cheap_shot_head_hunting") {
    return {
      title: "🚨 Sent to the Box",
      body: `This ${label} was flagged for Cheap Shot / Head-Hunting energy.`
    };
  }

  if (reason === "cheap_shot") {
    return {
      title: "🚨 Sent to the Box",
      body: `This ${label} was flagged for Cheap Shot energy.`
    };
  }

  if (reason === "gongshow") {
    return {
      title: "🚨 Sent to the Box",
      body: `This ${label} was flagged for Gongshow energy.`
    };
  }

  return {
    title: "🚨 Sent to the Box",
    body: `This ${label} was flagged by Rent-a-Ref.`
  };
}

function renderModerationBanner(content, contentType = "post") {
  const status = String(content.moderation_status || "visible");
  const reason = String(content.moderation_reason || "");

  if (status === "visible" && reason === "review_unbenched") {
    return `
      <div class="box-banner review-cleared">
        <div>
          <strong>✅ Review Complete: Waved Off</strong>
          <p>The Situation Room reviewed this ${contentType} and returned it to the feed.</p>
        </div>
      </div>
    `;
  }

  if (status === "visible") return "";

  const targetId = `${contentType}-boxed-${content.id}`;
  const message = getModerationMessage(contentType, status, reason);

  const locked =
    status === "under_review" ||
    reason === "review_keep_benched" ||
    reason === "review_escalated_user";

  return `
    <div class="box-banner ${status === "under_review" ? "under-review" : "benched"}">
      <div>
        <strong>${escapeHtml(message.title)}</strong>
        <p>${escapeHtml(message.body)}</p>
      </div>

      ${
        locked
          ? `<span class="badge">Locked pending review</span>`
          : `<button
              class="inline-button show-boxed-content"
              type="button"
              data-target-id="${escapeHtml(targetId)}"
            >
              Show anyway
            </button>`
      }
    </div>
  `;
}

function wireModerationControls() {
  document.querySelectorAll(".show-boxed-content").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", () => {
      const targetId = button.dataset.targetId;
      if (!targetId) return;

      const target = document.querySelector(`#${CSS.escape(targetId)}`);
      if (!target) return;

      const shouldShow = target.hidden;

      target.hidden = !shouldShow;
      button.textContent = shouldShow ? "Hide again" : "Show anyway";
    });
  });
}

function formatReviewReason(reason = "") {
  const labels = {
    cheap_shot_with_link_or_media: "Cheap Shot + Link/Media",
    cheap_shot_head_hunting_with_link_or_media: "Cheap Shot / Head-Hunting + Link/Media",
    gongshow_with_link_or_media: "Gongshow + Link/Media",
    review_keep_benched: "Kept Benched",
    review_unbenched: "Waved Off",
    review_warn_user: "Warning",
    review_escalated_user: "Escalated User"
  };

  return labels[reason] || String(reason || "Review").replaceAll("_", " ");
}

function getReviewTitle(review) {
  if (review.content_type === "post") {
    return review.post_title || "Untitled post";
  }

  return "Comment under review";
}

function getReviewBody(review) {
  if (review.content_type === "post") {
    return review.post_body || "";
  }

  return review.comment_body || "";
}

function getReviewTypeLabel(review) {
  return review.content_type === "comment" ? "Comment" : "Post";
}

function renderSituationRoom(reviews) {
  const container = $("#review-list");
  if (!container) return;

  if (!currentUserCanReviewContent()) {
    container.innerHTML = `
      <div class="empty-state leadership-required">
        <strong>Leadership review access required.</strong><br />
        Only Captains and Alternate Captains can review Situation Room cases.
      </div>
    `;
    return;
  }
  
  if (!reviews.length) {
    container.innerHTML = `
      <div class="empty-state">
        No reviews on the board. Situation Room is clear.
      </div>
    `;
    return;
  }

  container.innerHTML = reviews
    .map((review) => {
      const title = getReviewTitle(review);
      const body = getReviewBody(review);
      const typeLabel = getReviewTypeLabel(review);
      const reasonLabel = formatReviewReason(review.opened_reason);
      const completed = Number(review.reviews_completed || 0);
      const needed = Number(review.reviews_needed || 3);
      const available = Number(review.tokens_available || 0);

      return `
        <article class="review-card" data-review-id="${escapeHtml(review.id)}">
          <div class="review-card-header">
            <div>
              <div class="post-meta">
                <span class="badge review-badge">Under Review</span>
                <span class="badge">${escapeHtml(typeLabel)}</span>
                <span class="badge">${escapeHtml(reasonLabel)}</span>
                <span class="badge">${formatDate(review.opened_at)}</span>
              </div>

              <h3>${escapeHtml(title)}</h3>
            </div>

            <div class="review-scoreboard" aria-label="Neutral review progress">
              <span>Reviews: ${completed}/${needed}</span>
              <span>Open slots: ${available}</span>
              <span>Status: pending</span>
            </div>
          </div>

          <div class="review-preview">
            <p>${escapeHtml(body || "No preview available.")}</p>
          </div>

          <div class="review-actions">
            <button
              class="button secondary review-checkout-button"
              type="button"
              data-review-id="${escapeHtml(review.id)}"
            >
              Review the play
            </button>
          </div>

          <div class="review-decision-panel" hidden>
            <p class="muted small">
              You have checked out this review. Cast your anonymous decision.
            </p>

            <div class="review-actions">
              <button
                class="button secondary review-vote-button"
                type="button"
                data-review-id="${escapeHtml(review.id)}"
                data-vote="unbench"
              >
                Wave it off
              </button>

              <button
                class="button ghost review-vote-button"
                type="button"
                data-review-id="${escapeHtml(review.id)}"
                data-vote="keep_benched"
              >
                Keep benched
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  wireReviewControls();
}

async function refreshSituationRoom() {
  const reviewsData = await fetchJson("/api/reviews");
  renderSituationRoom(reviewsData.reviews || []);
}

async function refreshPostsAndSituationRoom() {
  const [postsData, reviewsData] = await Promise.all([
    fetchJson("/api/posts"),
    fetchJson("/api/reviews")
  ]);

  renderPosts(postsData.posts || []);
  renderSituationRoom(reviewsData.reviews || []);
}

function wireReviewControls() {
  document.querySelectorAll(".review-checkout-button").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const reviewId = button.dataset.reviewId;
      const reviewCard = button.closest(".review-card");

      if (!reviewId || !reviewCard) return;

      try {
        button.disabled = true;
        button.textContent = "Checking out...";

        const checkout = await fetchJson(`/api/reviews/${encodeURIComponent(reviewId)}/checkout`, {
          method: "POST",
          body: JSON.stringify({})
        });

        const panel = reviewCard.querySelector(".review-decision-panel");
        const voteButtons = reviewCard.querySelectorAll(".review-vote-button");

        voteButtons.forEach((voteButton) => {
          voteButton.dataset.tokenId = checkout.token_id;
        });

        if (panel) {
          panel.hidden = false;
        }

        button.textContent = "Checked out";
      } catch (error) {
        alert(`Could not check out review: ${error.message}`);
        console.error(error);

        button.disabled = false;
        button.textContent = "Review the play";
      }
    });
  });

  document.querySelectorAll(".review-vote-button").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const reviewId = button.dataset.reviewId;
      const tokenId = button.dataset.tokenId;
      const vote = button.dataset.vote;
      const reviewCard = button.closest(".review-card");

      if (!reviewId || !tokenId || !vote) {
        alert("Review token missing. Check out the review again.");
        return;
      }

      try {
        reviewCard?.querySelectorAll("button").forEach((reviewButton) => {
          reviewButton.disabled = true;
        });

        button.textContent = "Submitting...";

        const result = await fetchJson(`/api/reviews/${encodeURIComponent(reviewId)}/vote`, {
          method: "POST",
          body: JSON.stringify({
            token_id: tokenId,
            vote
          })
        });

        if (result.resolved) {
          console.log("Situation Room decision:", result.decision);
        }

        await refreshPostsAndSituationRoom();
      } catch (error) {
        alert(`Could not cast review vote: ${error.message}`);
        console.error(error);

        reviewCard?.querySelectorAll("button").forEach((reviewButton) => {
          reviewButton.disabled = false;
        });
      }
    });
  });
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

    const commentsStatus = Number(post.comments_enabled) === 1 ? "on" : "off";
    const author = post.author_display_name || post.author_username || "Unknown skater";
    const tagList = String(post.tags || "")
      .split(/[,\s]+/)
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean);

    const tagsHtml = tagList.length
      ? `<div class="post-meta tags">${tagList
          .map((tag) => `<span class="badge">#${escapeHtml(tag)}</span>`)
          .join(" ")}</div>`
      : "";

    const chirpCount = Number(post.chirp_count || 0);
    const userChirped = Number(post.user_chirped || 0) === 1;
    const chirpProfileHtml = renderCollapsibleChirpProfile(post, "Chirp Profile");
    const moderationStatus = String(post.moderation_status || "visible");
    const postIsBoxed = moderationStatus !== "visible";
    const moderationBannerHtml = renderModerationBanner(post, "post");

    card.innerHTML = `
      <div class="post-meta">
        <span class="badge ${escapeHtml(post.visibility)}">${escapeHtml(post.visibility)}</span>
        <span class="badge">${escapeHtml(post.post_type || "post")}</span>
        <span class="badge">comments: ${commentsStatus}</span>
        <span class="badge">${formatDate(post.published_at || post.created_at)}</span>
      </div>

      <h3>${escapeHtml(post.title || "Untitled post")}</h3>
      
      ${moderationBannerHtml}
      
      <div
        id="post-boxed-${escapeHtml(post.id)}"
        class="boxed-content"
        ${postIsBoxed ? "hidden" : ""}
      >
        <p class="muted">${escapeHtml(post.body || "")}</p>
      
        ${tagsHtml}

      <div class="post-meta">
        ${renderChirpPicker({
          contentType: "post",
          contentId: post.id,
          chirpCount,
          selectedChirpType: post.user_chirp_type || ""
        })}
      </div>

      <div class="chirp-profile-wrap">
        ${chirpProfileHtml}
      </div>

      <p class="muted small">
        Posted by ${escapeHtml(author)}
        ${post.author_position ? ` • ${escapeHtml(post.author_position)}` : ""}
        ${post.author_jersey_number ? ` • #${escapeHtml(post.author_jersey_number)}` : ""}
      </p>

      <div class="comments-panel" data-comments-for="${escapeHtml(post.id)}">
        ${
          Number(post.comments_enabled) === 1
            ? `
              <button class="button ghost comment-toggle" type="button" data-post-id="${escapeHtml(post.id)}">
                Comments (${Number(post.comment_count || 0)})
              </button>
      
              <div class="comments-list" id="comments-${escapeHtml(post.id)}" hidden></div>
      
              <form class="comment-form" data-post-id="${escapeHtml(post.id)}" hidden>
                <label>
                  Add a comment
                  <input name="comment" type="text" placeholder="Write a supportive note or feedback..." required />
                </label>
                <button class="button secondary" type="submit">Post comment</button>
              </form>
            `
            : `
              <p class="muted small">
                Comments are disabled for this post. Rent-a-Ref rulings appear in the Chirp Profile above.
              </p>
            `
        }
      </div>
    </div>
    `;

    container.appendChild(card);
  }

  wireCommentControls();
  wireChirpPickerControls();
  wireChirpProfileToggles();
  wireModerationControls();
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
      const tags = String(form.get("tags") || "").trim();

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
            comments_enabled: comments === "allow",
            tags
          })
        });
        
        postForm.reset();
        
        await loadHomepage();

        if (visibility !== "public") {
          alert("Post saved to D1. Because it is private/unlisted, it will not appear in the public feed yet.");
        }

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

function wireCommentControls() {
  document.querySelectorAll(".comment-toggle").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const postId = button.dataset.postId;
      const list = document.querySelector(`#comments-${CSS.escape(postId)}`);
      const form = document.querySelector(`.comment-form[data-post-id="${CSS.escape(postId)}"]`);

      if (!list) return;

      const shouldOpen = list.hidden;

      list.hidden = !shouldOpen;

      if (form) {
        form.hidden = !shouldOpen;
      }

      if (!shouldOpen) return;

      list.innerHTML = `<div class="empty-state">Loading comments...</div>`;

      try {
        const data = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`);
        renderComments(postId, data.comments || [], data.comments_enabled);
      } catch (error) {
        list.innerHTML = `<div class="empty-state">Could not load comments: ${escapeHtml(error.message)}</div>`;
      }
    });
  });

  document.querySelectorAll(".comment-form").forEach((form) => {
    if (form.dataset.wired) return;
    form.dataset.wired = "true";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const postId = form.dataset.postId;
      const input = form.querySelector("input[name='comment']");
      const button = form.querySelector("button[type='submit']");
      const body = String(input?.value || "").trim();

      if (!body) {
        alert("Please enter a comment.");
        return;
      }

      try {
        if (button) {
          button.disabled = true;
          button.textContent = "Posting...";
        }

        await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`, {
          method: "POST",
          body: JSON.stringify({ body })
        });

        input.value = "";

        const data = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`);
        renderComments(postId, data.comments || [], data.comments_enabled);
        updateCommentToggleCount(postId, data.comments || []);
      } catch (error) {
        alert(`Could not save comment: ${error.message}`);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "Post comment";
        }
      }
    });
  });
}

function isRentARefComment(comment) {
  const moderationReason = String(comment.moderation_reason || "");

  return (
    comment.author_user_id === RENT_A_REF_USER_ID ||
    comment.author_username === RENT_A_REF_USERNAME ||
    comment.author_display_name === "Rent-a-Ref" ||
    moderationReason.startsWith("rent_a_ref_")
  );
}

function getRentARefCommentClass(comment) {
  const reason = String(comment.moderation_reason || "");

  if (reason.includes("red")) return "rent-a-ref-call-red";
  if (reason.includes("yellow")) return "rent-a-ref-call-yellow";
  if (reason.includes("green")) return "rent-a-ref-call-green";

  return "rent-a-ref-call-green";
}

function isRentARefCommentForSort(comment) {
  const authorUserId = String(comment?.author_user_id || "");
  const authorUsername = String(comment?.author_username || "").toLowerCase();

  return (
    authorUserId === RENT_A_REF_USER_ID ||
    authorUsername === RENT_A_REF_USERNAME
  );
}

function sortCommentTree(comments = []) {
  comments.sort((a, b) => {
    const aIsRef = isRentARefCommentForSort(a);
    const bIsRef = isRentARefCommentForSort(b);

    if (aIsRef && !bIsRef) return -1;
    if (!aIsRef && bIsRef) return 1;

    const scoreA = Number(a.score || 0);
    const scoreB = Number(b.score || 0);

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    const createdA = Date.parse(a.created_at || "");
    const createdB = Date.parse(b.created_at || "");

    if (Number.isFinite(createdA) && Number.isFinite(createdB)) {
      return createdA - createdB;
    }

    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });

  comments.forEach((comment) => {
    if (comment.replies?.length) {
      sortCommentTree(comment.replies);
    }
  });

  return comments;
}

function buildCommentTree(comments = []) {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    byId.set(comment.id, {
      ...comment,
      replies: []
    });
  });

  byId.forEach((comment) => {
    if (comment.parent_comment_id && byId.has(comment.parent_comment_id)) {
      byId.get(comment.parent_comment_id).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return sortCommentTree(roots);
}
function updateCommentToggleCount(postId, comments = []) {
  const toggle = document.querySelector(`.comment-toggle[data-post-id="${CSS.escape(postId)}"]`);

  if (toggle) {
    toggle.textContent = `Comments (${comments.length})`;
  }
}

function renderComments(postId, comments, commentsEnabled = true) {
  const list = document.querySelector(`#comments-${CSS.escape(postId)}`);
  if (!list) return;

  if (!comments.length) {
    list.innerHTML = `<div class="empty-state">No comments yet.</div>`;
    return;
  }

  const commentTree = buildCommentTree(comments);

  list.innerHTML = `
    <div class="comment-tree">
      ${commentTree
        .map((comment) => renderCommentNode(postId, comment, 0, commentsEnabled))
        .join("")}
    </div>
  `;

    wireCommentVoteControls();
    wireChirpPickerControls();
    wireChirpProfileToggles();
    wireReplyControls();
    wireCommentCollapseControls();
    wireCommentBodyControls();
    if (typeof wireModerationControls === "function") wireModerationControls();
}

function wireCommentVoteControls() {
  document.querySelectorAll(".comment-vote").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const commentId = button.dataset.commentId;
      const voteValue = Number(button.dataset.voteValue);

      if (!commentId || ![1, -1].includes(voteValue)) return;

      try {
        button.disabled = true;

        const result = await fetchJson(`/api/comments/${encodeURIComponent(commentId)}/vote`, {
          method: "POST",
          body: JSON.stringify({
            vote_value: voteValue
          })
        });

        const scoreEl = document.querySelector(`#comment-score-${CSS.escape(commentId)}`);
        if (scoreEl) {
          scoreEl.textContent = result.score;
        }

        const commentCard = document.querySelector(`.comment-card[data-comment-id="${CSS.escape(commentId)}"]`);
        if (commentCard) {
          commentCard.querySelectorAll(".comment-vote").forEach((voteButton) => {
            voteButton.classList.remove("active");
          });

          if (Number(result.user_vote) !== 0) {
            const activeButton = commentCard.querySelector(
              `.comment-vote[data-vote-value="${Number(result.user_vote)}"]`
            );

            if (activeButton) {
              activeButton.classList.add("active");
            }
          }
        }
      } catch (error) {
        alert(`Could not save vote: ${error.message}`);
        console.error(error);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function countCommentReplies(comment) {
  if (!comment?.replies?.length) return 0;

  return comment.replies.reduce((total, reply) => {
    return total + 1 + countCommentReplies(reply);
  }, 0);
}

function renderCommentNode(postId, comment, depth = 0, commentsEnabled = true) {
  const author = comment.author_display_name || comment.author_username || "Demo Skater";
  const userVote = Number(comment.user_vote || 0);
  const chirpCount = Number(comment.chirp_count || 0);
  const userChirped = Number(comment.user_chirped || 0) === 1;
  const chirpProfileHtml = renderCollapsibleChirpProfile(comment, "Chirp Profile");

  const rentARefComment = isRentARefComment(comment);
  const rentARefClass = rentARefComment ? getRentARefCommentClass(comment) : "";
  
  const moderationStatus = String(comment.moderation_status || "visible");
  const commentIsBoxed = !rentARefComment && moderationStatus !== "visible";
  const moderationBannerHtml = !rentARefComment
    ? renderModerationBanner(comment, "comment")
    : "";

  const depthClass = depth >= 5 ? "comment-depth-max" : `comment-depth-${depth}`;
  const replyCount = countCommentReplies(comment);
  const replyLabel = replyCount === 1 ? "1 reply" : `${replyCount} replies`;

  const commentVoteControlsHtml = rentARefComment
    ? ""
    : `
      <div class="comment-actions">
        <button
          class="button ghost comment-vote ${userVote === 1 ? "active" : ""}"
          type="button"
          data-comment-id="${escapeHtml(comment.id)}"
          data-vote-value="1"
          aria-label="Upvote comment"
        >
          ▲
        </button>

        <strong class="comment-score" id="comment-score-${escapeHtml(comment.id)}">
          ${Number(comment.score || 0)}
        </strong>

        <button
          class="button ghost comment-vote ${userVote === -1 ? "active" : ""}"
          type="button"
          data-comment-id="${escapeHtml(comment.id)}"
          data-vote-value="-1"
          aria-label="Downvote comment"
        >
          ▼
        </button>
      </div>
    `;

  const commentChirpControlsHtml = rentARefComment
    ? ""
    : `
      <div class="chirp-profile-wrap">
        ${chirpProfileHtml}
      </div>
    `;

  const replyControlsHtml = commentsEnabled && !commentIsBoxed && !rentARefComment
    ? `
      <div class="reply-controls">
        <div class="comment-bottom-actions">
          <button
            class="inline-button comment-reply-toggle comment-reply-main"
            type="button"
            data-post-id="${escapeHtml(postId)}"
            data-parent-comment-id="${escapeHtml(comment.id)}"
          >
            Reply
          </button>
        </div>
  
        <form
          class="reply-form"
          data-post-id="${escapeHtml(postId)}"
          data-parent-comment-id="${escapeHtml(comment.id)}"
          hidden
        >
          <label>
            Reply
            <input name="reply" type="text" placeholder="Reply to this comment..." required />
          </label>
          <button class="button secondary" type="submit">Post reply</button>
        </form>
      </div>
    `
    : "";

  const normalCommentHeaderHtml = `
    <div class="comment-card-header-left">
      ${
        replyCount > 0
          ? `
            <button
              class="comment-tree-toggle"
              type="button"
              data-comment-collapse
              data-comment-id="${escapeHtml(comment.id)}"
              aria-expanded="true"
              title="Hide replies"
            >
              <span class="comment-tree-toggle-icon">▼</span>
            </button>
          `
          : `<span class="comment-tree-toggle-spacer"></span>`
      }

      <div class="comment-card-header-main">
        <div class="comment-card-header-line">
          <span class="comment-card-author">${escapeHtml(author)}</span>
          <span class="comment-card-meta-sep">·</span>
          <span class="comment-card-date">${formatDate(comment.created_at)}</span>
          <span class="comment-card-meta-sep">·</span>
          <span class="comment-card-reply-count">${escapeHtml(replyLabel)}</span>
        </div>
      </div>
    </div>

    ${
      commentIsBoxed
        ? ""
        : `
          <button
            class="comment-body-toggle"
            type="button"
            data-comment-body-toggle
            data-comment-id="${escapeHtml(comment.id)}"
            aria-expanded="true"
            title="Hide comment body"
          >
            hide body
          </button>
        `
    }
  `;

  const rentARefHeaderHtml = `
    <div class="comment-card-header-left">
      ${renderRentARefAvatar(comment, "rent-a-ref-comment-avatar")}

      <div class="comment-card-header-main">
        <div class="comment-card-header-line rent-a-ref-header-line">
          <span class="comment-card-author">Rent-a-Ref</span>
          <span class="comment-card-meta-sep">·</span>
          <span class="rent-a-ref-whistle">🚨 Whistle’s up</span>
        </div>

        <div class="comment-card-subline">
          ${formatDate(comment.created_at)}
        </div>
      </div>
    </div>
  `;

  const repliesHtml = comment.replies?.length
    ? `
      <div class="comment-replies">
        ${comment.replies
          .map((reply) => renderCommentNode(postId, reply, depth + 1, commentsEnabled))
          .join("")}
      </div>
    `
    : "";

  return `
    <div
      class="comment-node ${depthClass} ${rentARefComment ? "rent-a-ref-node" : ""}"
      data-comment-node-id="${escapeHtml(comment.id)}"
    >
      <div
        class="comment-card ${rentARefComment ? `rent-a-ref-comment ${rentARefClass}` : ""}"
        data-comment-id="${escapeHtml(comment.id)}"
      >
        <div class="comment-card-header">
          ${rentARefComment ? rentARefHeaderHtml : normalCommentHeaderHtml}
        </div>

        ${moderationBannerHtml}

        <div
          id="comment-boxed-${escapeHtml(comment.id)}"
          class="boxed-content"
          data-moderation-locked="${commentIsBoxed ? "true" : "false"}"
          ${commentIsBoxed ? "hidden" : ""}
        >
          <div class="comment-body-wrap">
            <div class="comment-body-block ${rentARefComment ? "comment-body-ref" : ""}">
              <p>${escapeHtml(comment.body)}</p>
            </div>
          
            <button
              class="comment-body-placeholder"
              type="button"
              data-comment-body-placeholder
              data-comment-id="${escapeHtml(comment.id)}"
              hidden
              aria-label="Show comment body"
            >
              [...]
            </button>
          
            ${
              rentARefComment
                ? ""
                : renderChirpPicker({
                    contentType: "comment",
                    contentId: comment.id,
                    chirpCount,
                    selectedChirpType: comment.user_chirp_type || ""
                  })
                              }
          
            ${commentVoteControlsHtml}
          </div>
          
          ${commentChirpControlsHtml}
          
          ${replyControlsHtml}
        </div>
      </div>

      ${repliesHtml}
    </div>
  `;
}

function wireCommentCollapseControls() {
  document.querySelectorAll("[data-comment-collapse]").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", () => {
      const node = button.closest(".comment-node");

      if (!node) return;

      const replies = node.querySelector(":scope > .comment-replies");
      const icon = button.querySelector(".comment-tree-toggle-icon");
      const isExpanded = button.getAttribute("aria-expanded") !== "false";
      const nextExpanded = !isExpanded;

      if (replies) {
        replies.hidden = !nextExpanded;
      }

      if (icon) {
        icon.textContent = nextExpanded ? "▼" : "▶";
      }

      button.setAttribute("aria-expanded", String(nextExpanded));
      button.title = nextExpanded ? "Hide replies" : "Show replies";
      node.classList.toggle("comment-replies-collapsed", !nextExpanded);
    });
  });
}

function setCommentBodyExpanded(card, expanded) {
  if (!card) return;

  const bodyBlock = card.querySelector(":scope .comment-body-block");
  const placeholder = card.querySelector(":scope .comment-body-placeholder");
  const toggle = card.querySelector(":scope [data-comment-body-toggle]");

  if (bodyBlock) {
    bodyBlock.hidden = !expanded;
  }

  if (placeholder) {
    placeholder.hidden = expanded;
  }

  if (toggle) {
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "hide body" : "show body";
    toggle.title = expanded ? "Hide comment body" : "Show comment body";
  }

  card.classList.toggle("comment-body-hidden", !expanded);
}

function wireCommentBodyControls() {
  document.querySelectorAll("[data-comment-body-toggle]").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", () => {
      const card = button.closest(".comment-card");

      if (!card) return;

      const isExpanded = button.getAttribute("aria-expanded") !== "false";
      setCommentBodyExpanded(card, !isExpanded);
    });
  });

  document.querySelectorAll("[data-comment-body-placeholder]").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", () => {
      const card = button.closest(".comment-card");

      if (!card) return;

      setCommentBodyExpanded(card, true);
    });
  });
}

function wireReplyControls() {
  document.querySelectorAll(".comment-reply-toggle").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", () => {
      const parentCommentId = button.dataset.parentCommentId;
      const form = document.querySelector(
        `.reply-form[data-parent-comment-id="${CSS.escape(parentCommentId)}"]`
      );

      if (!form) return;

      const shouldOpen = form.hidden;
      form.hidden = !shouldOpen;
      button.textContent = shouldOpen ? "Cancel reply" : "Reply";

      if (shouldOpen) {
        form.querySelector("input[name='reply']")?.focus();
      }
    });
  });

  document.querySelectorAll(".reply-form").forEach((form) => {
    if (form.dataset.wired) return;
    form.dataset.wired = "true";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const postId = form.dataset.postId;
      const parentCommentId = form.dataset.parentCommentId;
      const input = form.querySelector("input[name='reply']");
      const button = form.querySelector("button[type='submit']");
      const body = String(input?.value || "").trim();

      if (!postId || !parentCommentId || !body) {
        alert("Please enter a reply.");
        return;
      }

      try {
        if (button) {
          button.disabled = true;
          button.textContent = "Posting...";
        }

        await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`, {
          method: "POST",
          body: JSON.stringify({
            body,
            parent_comment_id: parentCommentId
          })
        });

        input.value = "";

        const data = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`);
        renderComments(postId, data.comments || [], data.comments_enabled);
        updateCommentToggleCount(postId, data.comments || []);
      } catch (error) {
        alert(`Could not save reply: ${error.message}`);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "Post reply";
        }
      }
    });
  });
}

function getChirpProfileLabel(profile) {
  const chirpCount = Number(profile.chirp_count || 0);
  const helpful = Number(profile.helpful_score || 0);
  const funny = Number(profile.funny_score || 0);
  const heat = Number(profile.heat_score || 0);
  const rude = Number(profile.rude_score || 0);
  const targeted = Number(profile.targeted_score || 0);
  const spam = Number(profile.spam_score || 0);

  if (chirpCount === 0) return "";

  if (spam >= 4) return "🗑️ Gongshow";
  if (rude >= 4 && targeted >= 3) return "🦓 Ref Review";
  if (rude >= 4) return "🚨 Cheap Shot";
  if (rude >= 3 || targeted >= 2) return "⚠️ Tone Check";
  if (heat >= 4 && rude <= 2) return "🌶️ Spicy but Fair";
  if (helpful >= 4) return "📋 Tape-to-Tape";
  if (funny >= 4) return "🏒 Good Chirp";

  return "👀 Chirp Watch";
}

function getChirpAxisData(profile) {
  return [
    {
      key: "helpful",
      label: "Tape-to-Tape",
      value: Number(profile.helpful_score || 0),
      color: "#00C8FF"
    },
    {
      key: "funny",
      label: "Laughs",
      value: Number(profile.funny_score || 0),
      color: "#FFE600"
    },
    {
      key: "heat",
      label: "Heat",
      value: Number(profile.heat_score || 0),
      color: "#FF7A00"
    },
    {
      key: "rude",
      label: "Cheap Shot",
      value: Number(profile.rude_score || 0),
      color: "#FF2B2B"
    },
    {
      key: "targeted",
      label: "Head-Hunting",
      value: Number(profile.targeted_score || 0),
      color: "#FF007A"
    },
    {
      key: "spam",
      label: "Gongshow",
      value: Number(profile.spam_score || 0),
      color: "#7C3AED"
    }
  ];
}

function getDominantChirpAxis(axes) {
  if (!axes.length) return null;

  return axes.reduce((dominant, axis) => {
    return Number(axis.value || 0) > Number(dominant.value || 0)
      ? axis
      : dominant;
  }, axes[0]);
}

function formatChirpScore(value) {
  const score = Number(value || 0);
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function polarPoint(cx, cy, radius, angleDeg) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;

  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius
  };
}

function renderCollapsibleChirpProfile(profile, label = "Chirp Profile") {
  const chirpCount = Number(profile?.chirp_count || 0);

  if (!chirpCount) {
    return "";
  }

  return `
    <section class="chirp-profile-shell" data-chirp-profile>
      <button class="chirp-profile-toggle" type="button" aria-expanded="false">
        <span class="chirp-profile-toggle-icon">+</span>
        <span>${escapeHtml(label)}</span>
        <span class="chirp-profile-toggle-count">${chirpCount}</span>
      </button>

      <div class="chirp-profile-panel" hidden>
        ${renderChirpProfile(profile)}
      </div>
    </section>
  `;
}

function getChirpButtonImage(contentType = "", contentId = "") {
  const rightFacingImages = [
    "chirp-btn00.png",
    "chirp-btn01.png",
    "chirp-btn02.png",
    "chirp-btn03.png",
    "chirp-btn04.png",
    "chirp-btn05.png",
    "chirp-btn06.png",
    "chirp-btn07.png",
    "chirp-btn08.png",
    "chirp-btn09.png",
    "chirp-btn10.png"
  ];

  const leftFacingImages = [
    "chirp-btn11.png",
    "chirp-btn12.png",
    "chirp-btn13.png",
    "chirp-btn14.png",
    "chirp-btn15.png",
    "chirp-btn16.png",
    "chirp-btn17.png",
    "chirp-btn18.png",
    "chirp-btn19.png",
    "chirp-btn20.png"
  ];

  const seed = `${contentType}:${contentId}`;
  let hash = 0;

  for (const character of seed) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }

  const safeHash = Math.abs(hash);
  const imagePool = safeHash % 2 === 0
    ? leftFacingImages
    : rightFacingImages;

  return imagePool[safeHash % imagePool.length];
}

function renderChirpPicker({
  contentType,
  contentId,
  chirpCount = 0,
  selectedChirpType = "",
  disabled = false
}) {
  const chirpButtonImage = getChirpButtonImage(contentType, contentId);
  const optionsHtml = CHIRP_OPTIONS.map((option) => `
    <button
      type="button"
      class="chirp-option ${option.type === selectedChirpType ? "selected" : ""}"
      data-chirp-value="${option.value}"
      data-chirp-type="${escapeHtml(option.type)}"
      data-content-type="${escapeHtml(contentType)}"
      data-content-id="${escapeHtml(contentId)}"
    >
      <span class="chirp-option-number">${option.value}</span>

      <span class="chirp-option-copy">
        <span class="chirp-option-label">${escapeHtml(option.label)}</span>
        <span class="chirp-option-description">${escapeHtml(option.description)}</span>
      </span>
    </button>
  `).join("");

  return `
    <div class="chirp-picker ${disabled ? "is-disabled" : ""}">
      <button
        type="button"
        class="chirp-picker-trigger"
        data-content-type="${escapeHtml(contentType)}"
        data-content-id="${escapeHtml(contentId)}"
        aria-expanded="false"
        ${disabled ? "disabled" : ""}
        title="Open chirp menu"
      >
        <img
          class="chirp-icon-art"
          src="/${escapeHtml(chirpButtonImage)}"
          alt=""
          aria-hidden="true"
        />
      </button>

      <span class="chirp-picker-count">
        ${Number(chirpCount || 0)}
      </span>

      <div class="chirp-picker-menu" hidden>
        <div class="chirp-picker-menu-inner">
          ${optionsHtml}
        </div>
      </div>
    </div>
  `;
}

function wireChirpPickerControls() {
  document.querySelectorAll(".chirp-picker-trigger").forEach((trigger) => {
    if (trigger.dataset.wired) return;
    trigger.dataset.wired = "true";

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const picker = trigger.closest(".chirp-picker");
      if (!picker || picker.classList.contains("is-disabled")) return;

      const menu = picker.querySelector(".chirp-picker-menu");
      if (!menu) return;

      const isOpen = !menu.hasAttribute("hidden");

      document.querySelectorAll(".chirp-picker-menu").forEach((otherMenu) => {
        otherMenu.setAttribute("hidden", "");
      });
      
      document.querySelectorAll(".chirp-picker").forEach((otherPicker) => {
        otherPicker.classList.remove("is-open");
      });
      
      document.querySelectorAll(".post-card, .comment-card").forEach((card) => {
        card.classList.remove("is-chirp-menu-open");
      });
      
      document.querySelectorAll(".chirp-picker-trigger").forEach((otherTrigger) => {
        otherTrigger.setAttribute("aria-expanded", "false");
      });

      if (!isOpen) {
        menu.removeAttribute("hidden");
        picker.classList.add("is-open");
        picker.closest(".post-card, .comment-card")?.classList.add("is-chirp-menu-open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.querySelectorAll(".chirp-option").forEach((option) => {
    if (option.dataset.wired) return;
    option.dataset.wired = "true";

    option.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const chirpValue = String(option.dataset.chirpValue || "").trim();
      const contentType = option.dataset.contentType;
      const contentId = option.dataset.contentId;

      if (!chirpValue || !contentType || !contentId) return;

      const chirpTypes = {
        "1": "good_chirp",
        "2": "tape_to_tape",
        "3": "spicy_but_fair",
        "4": "tone_check",
        "5": "cheap_shot",
        "6": "gongshow"
      };

      const chirpType = chirpTypes[chirpValue] || "other";

      try {
        option.disabled = true;

        await fetchJson("/api/chirps", {
          method: "POST",
          body: JSON.stringify({
            content_type: contentType,
            content_id: contentId,
            chirp_type: chirpType
          })
        });

        await loadHomepage();
      } catch (error) {
        alert(error.message || "Could not submit chirp.");
      } finally {
        option.disabled = false;
      }
    });
  });

  if (!document.body.dataset.chirpPickerDismissWired) {
    document.body.dataset.chirpPickerDismissWired = "true";

    document.addEventListener("click", () => {
      document.querySelectorAll(".chirp-picker-menu").forEach((menu) => {
        menu.setAttribute("hidden", "");
      });
    
      document.querySelectorAll(".chirp-picker").forEach((picker) => {
        picker.classList.remove("is-open");
      });
    
      document.querySelectorAll(".post-card, .comment-card").forEach((card) => {
        card.classList.remove("is-chirp-menu-open");
      });
    
      document.querySelectorAll(".chirp-picker-trigger").forEach((trigger) => {
        trigger.setAttribute("aria-expanded", "false");
      });
    });
  }
}

function renderChirpRadar(profile) {
  const axes = getChirpAxisData(profile);
  const chirpCount = Number(profile.chirp_count || 0);
  const dominantAxis = getDominantChirpAxis(axes);

  if (chirpCount === 0) return "";

  const size = 120;
  const cx = 60;
  const cy = 60;
  const maxRadius = 42;
  const ringLevels = [1, 2, 3, 4, 5];

  const ringPolygons = ringLevels
    .map((level) => {
      const radius = (level / 5) * maxRadius;

      const points = axes
        .map((_, index) => {
          const angle = (360 / axes.length) * index;
          const point = polarPoint(cx, cy, radius, angle);
          return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        })
        .join(" ");

      return `<polygon points="${points}" class="chirp-ring" />`;
    })
    .join("");

  const axisLines = axes
    .map((_, index) => {
      const angle = (360 / axes.length) * index;
      const point = polarPoint(cx, cy, maxRadius, angle);

      return `
        <line
          x1="${cx}"
          y1="${cy}"
          x2="${point.x.toFixed(1)}"
          y2="${point.y.toFixed(1)}"
          class="chirp-axis"
        />
      `;
    })
    .join("");

  const polygonPoints = axes
    .map((axis, index) => {
      const angle = (360 / axes.length) * index;
      const clampedValue = Math.max(0, Math.min(5, Number(axis.value || 0)));
      const radius = (clampedValue / 5) * maxRadius;
      const point = polarPoint(cx, cy, radius, angle);

      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");

  const nodeCircles = axes
    .map((axis, index) => {
      const angle = (360 / axes.length) * index;
      const clampedValue = Math.max(0, Math.min(5, Number(axis.value || 0)));
      const radius = (clampedValue / 5) * maxRadius;
      const point = polarPoint(cx, cy, radius, angle);
      const isDominant = dominantAxis && axis.key === dominantAxis.key;

      if (isDominant) {
        return `
          <circle
            cx="${point.x.toFixed(1)}"
            cy="${point.y.toFixed(1)}"
            r="4"
            class="chirp-node-dominant"
            style="--node-color: ${axis.color};"
          />
        `;
      }

      return `
        <circle
          cx="${point.x.toFixed(1)}"
          cy="${point.y.toFixed(1)}"
          r="2.5"
          class="chirp-node"
        />
      `;
    })
    .join("");

  return `
    <div class="chirp-radar" aria-label="Chirp profile radar chart">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-hidden="true">
        ${ringPolygons}
        ${axisLines}
        <polygon points="${polygonPoints}" class="chirp-shape" />
        ${nodeCircles}
      </svg>
    </div>
  `;
}

function getStableRefImage(seed = "") {
  const stableRefImages = [
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

  return stableRefImages[safeHash % stableRefImages.length];
}

function getRentARefAvatarKey(content = {}) {
  const savedKey = String(content.rent_a_ref_avatar_key || "").trim();

  if (savedKey) {
    return savedKey;
  }

  const ruling = String(content.rent_a_ref_ruling || "");

  if (ruling === "under_review") return "ref-img3.png";
  if (ruling === "penalty") return "ref-img4.png";

  const reason = String(content.moderation_reason || "");

  if (reason.includes("under_review")) return "ref-img3.png";
  if (reason.includes("penalty") || reason.includes("red")) return "ref-img4.png";

  return getStableRefImage(content.id || content.content_id || "");
}

function renderRentARefAvatar(content = {}, extraClass = "") {
  const imageName = getRentARefAvatarKey(content);

  return `
    <span class="rent-a-ref-avatar ${escapeHtml(extraClass)}">
      <img
        src="/${escapeHtml(imageName)}"
        alt=""
        loading="lazy"
        onerror="this.hidden = true; this.nextElementSibling.hidden = false;"
      />
      <span class="rent-a-ref-avatar-fallback" hidden aria-hidden="true">🦓</span>
    </span>
  `;
}

function getRentARefRulingLabel(ruling = "play_on") {
  const labels = {
    play_on: "Play On",
    tone_check: "Tone Check",
    under_review: "Under Review",
    penalty: "Sent to the Box"
  };

  return labels[ruling] || "Play On";
}

function renderRentARefConsole(profile = {}) {
  if (!Object.prototype.hasOwnProperty.call(profile, "rent_a_ref_ruling")) {
    return "";
  }

  const ruling = String(profile.rent_a_ref_ruling || "play_on");
  const message = String(profile.rent_a_ref_message || "").trim() ||
    "The crew is monitoring the Chirp Profile.";

  return `
    <section class="rent-a-ref-console" data-ruling="${escapeHtml(ruling)}">
      ${renderRentARefAvatar(profile, "rent-a-ref-console-avatar")}

      <div class="rent-a-ref-console-copy">
        <p class="rent-a-ref-console-kicker">Rent-a-Ref Crew</p>
        <h4>${escapeHtml(getRentARefRulingLabel(ruling))}</h4>
        <p>${escapeHtml(message)}</p>
      </div>

      <span class="rent-a-ref-console-state">
        Auto ruling
      </span>
    </section>
  `;
}

function renderChirpProfile(profile) {
  const chirpCount = Number(profile.chirp_count || 0);

  if (chirpCount === 0) return "";

  const axes = getChirpAxisData(profile);

  const getGlow = (value) => {
    const score = Math.max(0, Math.min(5, Number(value || 0)));
    return (0.03 + (score / 5) * 0.28).toFixed(3);
  };

  const heatmapStyle = [
    `--heat-tape: ${getGlow(profile.helpful_score)}`,
    `--heat-laughs: ${getGlow(profile.funny_score)}`,
    `--heat-heat: ${getGlow(profile.heat_score)}`,
    `--heat-cheap: ${getGlow(profile.rude_score)}`,
    `--heat-head: ${getGlow(profile.targeted_score)}`,
    `--heat-gong: ${getGlow(profile.spam_score)}`
  ].join("; ");

  const hasRentARefRuling = Object.prototype.hasOwnProperty.call(
    profile,
    "rent_a_ref_ruling"
  );

  const ruling = String(profile.rent_a_ref_ruling || "play_on");
  const rulingLabel = getRentARefRulingLabel(ruling);

  const refereeHtml = hasRentARefRuling
    ? `
      <div class="chirp-ref-strip" data-ruling="${escapeHtml(ruling)}">
        ${renderRentARefAvatar(profile, "chirp-ref-avatar")}

        <div class="chirp-ref-strip-copy">
          <span>Rent-a-Ref</span>
          <strong>${escapeHtml(rulingLabel)}</strong>
        </div>
      </div>
    `
    : "";

  return `
    <div class="chirp-profile chirp-profile-heatmap" style="${heatmapStyle}">
      <p class="muted small">
        <strong>Chirp Profile</strong> · ${chirpCount} chirp${chirpCount === 1 ? "" : "s"}
      </p>

      <div class="chirp-profile-visual">
        ${renderChirpRadar(profile)}

        <div class="chirp-profile-dashboard">
          ${refereeHtml}

          <div class="chirp-profile-grid">
            ${axes
              .map((axis) => `
                <span class="chirp-score chirp-score-axis" style="--pill-color: ${axis.color};">
                  <strong>${escapeHtml(axis.label)}</strong>: ${escapeHtml(formatChirpScore(axis.value))}
                </span>
              `)
              .join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireChirpProfileToggles() {
  document.querySelectorAll(".chirp-profile-toggle").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", () => {
      const shell = button.closest("[data-chirp-profile]");
      const panel = shell?.querySelector(".chirp-profile-panel");
      const icon = button.querySelector(".chirp-profile-toggle-icon");

      if (!panel) return;

      const isOpen = !panel.hasAttribute("hidden");

      if (isOpen) {
        panel.setAttribute("hidden", "");
        button.setAttribute("aria-expanded", "false");

        if (icon) {
          icon.textContent = "+";
        }
      } else {
        panel.removeAttribute("hidden");
        button.setAttribute("aria-expanded", "true");

        if (icon) {
          icon.textContent = "−";
        }
      }
    });
  });
}

function wireRentARefCommentControls() {
  document.querySelectorAll(".rent-a-ref-button[data-comment-id]").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const commentId = button.dataset.commentId;
      const commentCard = button.closest(".comment-card");
      const commentsList = button.closest(".comments-list");
      const postId = commentsList?.id?.replace("comments-", "");

      if (!commentId || !postId || button.disabled) return;

      try {
        button.disabled = true;
        button.textContent = "Calling it...";

        const result = await fetchJson(`/api/comments/${encodeURIComponent(commentId)}/rent-a-ref`, {
          method: "POST",
          body: JSON.stringify({})
        });

        const toggle = document.querySelector(`.comment-toggle[data-post-id="${CSS.escape(postId)}"]`);

        if (toggle && result.comment_count !== undefined) {
          toggle.textContent = `Comments (${Number(result.comment_count || 0)})`;
        }

        const data = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`);
        renderComments(postId, data.comments || [], data.comments_enabled);
        
        await refreshSituationRoom();
      } catch (error) {
        alert(`Rent-a-Ref missed the call on this comment: ${error.message}`);
        console.error(error);
      } finally {
        if (!button.classList.contains("disabled")) {
          button.disabled = false;
        }

        button.textContent = "Rent-a-Ref";
      }
    });
  });
}

function wireRentARefControls() {
  document.querySelectorAll(".rent-a-ref-button[data-post-id]").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const postId = button.dataset.postId;

      if (!postId) return;

      try {
        button.disabled = true;
        button.textContent = "Calling it...";

        const result = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/rent-a-ref`, {
          method: "POST",
          body: JSON.stringify({})
        });

        const list = document.querySelector(`#comments-${CSS.escape(postId)}`);
        const form = document.querySelector(`.comment-form[data-post-id="${CSS.escape(postId)}"]`);
        const toggle = document.querySelector(`.comment-toggle[data-post-id="${CSS.escape(postId)}"]`);

        if (toggle && result.comment_count !== undefined) {
          toggle.textContent = `Comments (${Number(result.comment_count || 0)})`;
        }

        if (result.rent_a_ref_ready === false) {
          button.disabled = true;
          button.classList.add("disabled");
          button.title = "You already called Rent-a-Ref for your latest chirp.";
        }

        if (list) {
          list.hidden = false;

          if (form) {
            form.hidden = false;
          }

          const data = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`);
          renderComments(postId, data.comments || [], data.comments_enabled);
        }

        await refreshSituationRoom();
        
      } catch (error) {
        alert(`Rent-a-Ref missed the call: ${error.message}`);
        console.error(error);
      } finally {
          if (!button.classList.contains("disabled")) {
            button.disabled = false;
          }
        
          button.textContent = "Rent-a-Ref";
        }
    });
  });
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
