const DEMO_USERNAME = "demo-skater";
const RENT_A_REF_USER_ID = "user_rent_a_ref_001";
const RENT_A_REF_USERNAME = "rent-a-ref";

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
    const [profileData, postsData, karmaData, reviewsData] = await Promise.all([
      fetchJson(`/api/profile/${encodeURIComponent(DEMO_USERNAME)}`),
      fetchJson("/api/posts"),
      fetchJson(`/api/profile/${encodeURIComponent(DEMO_USERNAME)}/karma`),
      fetchJson("/api/reviews")
    ]);

    renderProfile(profileData);
    renderKarma(karmaData);
    renderLeadership(karmaData);
    renderProfileChirpTone(karmaData);
    renderPosts(postsData.posts || []);
    renderSituationRoom(reviewsData.reviews || []);
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

function renderKarma(data) {
  const karma = data.karma || {};

  setText("#metric-karma", karma.locker_room_karma ?? 0);
  setText(
    "#karma-label",
    `Locker Room Karma: ${karma.karma_label || "Rookie"}`
  );
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

    ${renderChirpProfile(profile)}
  `;
}

function isRentARefReadyForComment(comment) {
  if (isRentARefComment(comment)) return false;

  const lastRentARefAt = comment.last_rent_a_ref_at || "";
  const lastCommentChirpAt = comment.last_comment_chirp_at || "";

  if (!lastRentARefAt) return true;

  if (!lastCommentChirpAt) return false;

  return new Date(lastCommentChirpAt).getTime() >
    new Date(lastRentARefAt).getTime();
}

function isRentARefReady(post) {
  if (Number(post.comments_enabled) !== 1) return false;

  const lastRentARefAt = post.last_rent_a_ref_at || "";
  const lastNonRefCommentAt = post.last_non_ref_comment_at || "";

  if (!lastRentARefAt) return true;

  if (!lastNonRefCommentAt) return false;

  return new Date(lastNonRefCommentAt).getTime() >
    new Date(lastRentARefAt).getTime();
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

  if (status === "visible") return "";

  const targetId = `${contentType}-boxed-${content.id}`;
  const message = getModerationMessage(contentType, status, reason);

  return `
    <div class="box-banner ${status === "under_review" ? "under-review" : "benched"}">
      <div>
        <strong>${escapeHtml(message.title)}</strong>
        <p>${escapeHtml(message.body)}</p>
      </div>

      <button
        class="inline-button show-boxed-content"
        type="button"
        data-target-id="${escapeHtml(targetId)}"
      >
        Show anyway
      </button>
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

            <div class="review-scoreboard" aria-label="Review vote totals">
              <span>Votes: ${Number(review.vote_count || 0)}</span>
              <span>Wave off: ${Number(review.unbench_votes || 0)}</span>
              <span>Keep: ${Number(review.keep_benched_votes || 0)}</span>
            </div>
          </div>

          <div class="review-preview">
            <p>${escapeHtml(body || "No preview available.")}</p>
          </div>

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

            <button
              class="button ghost review-vote-button"
              type="button"
              data-review-id="${escapeHtml(review.id)}"
              data-vote="warn_user"
            >
              Warn user
            </button>

            <button
              class="button ghost review-vote-button danger"
              type="button"
              data-review-id="${escapeHtml(review.id)}"
              data-vote="escalate_user"
            >
              Escalate user
            </button>
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
  document.querySelectorAll(".review-vote-button").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const reviewId = button.dataset.reviewId;
      const vote = button.dataset.vote;
      const reviewCard = button.closest(".review-card");

      if (!reviewId || !vote) return;

      try {
        reviewCard?.querySelectorAll(".review-vote-button").forEach((reviewButton) => {
          reviewButton.disabled = true;
        });

        button.textContent = "Reviewing...";

        const result = await fetchJson(`/api/reviews/${encodeURIComponent(reviewId)}/vote`, {
          method: "POST",
          body: JSON.stringify({
            vote,
            vote_reason: `Demo Situation Room vote: ${vote}`
          })
        });

        await refreshPostsAndSituationRoom();

        if (result.resolved) {
          console.log("Situation Room decision:", result.decision);
        }
      } catch (error) {
        alert(`Could not cast review vote: ${error.message}`);
        console.error(error);

        reviewCard?.querySelectorAll(".review-vote-button").forEach((reviewButton) => {
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
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const tagsHtml = tagList.length
      ? `<div class="post-meta tags">${tagList
          .map((tag) => `<span class="badge">#${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";

    const chirpCount = Number(post.chirp_count || 0);
    const userChirped = Number(post.user_chirped || 0) === 1;
    const chirpLabel = getChirpProfileLabel(post);
    const chirpProfileHtml = renderChirpProfile(post);
    const rentARefReady = isRentARefReady(post);
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
        <button
          class="button ghost chirp-button ${userChirped ? "active" : ""}"
          type="button"
          data-content-type="post"
          data-content-id="${escapeHtml(post.id)}"
        >
          ${userChirped ? `Chirped (${chirpCount})` : `Chirp this (${chirpCount})`}
        </button>

        <span class="badge chirp-badge" ${chirpLabel ? "" : "hidden"}>
          ${escapeHtml(chirpLabel)}
        </span>
        ${
          Number(post.comments_enabled) === 1
            ? `<button
                class="button ghost rent-a-ref-button ${rentARefReady ? "" : "disabled"}"
                type="button"
                data-post-id="${escapeHtml(post.id)}"
                ${rentARefReady ? "" : "disabled"}
                title="${rentARefReady ? "Rent-a-Ref can make a call." : "Rent-a-Ref already made the latest call. New comment needed."}"
              >
                Rent-a-Ref
              </button>`
            : ""
        }
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
        <button class="button ghost comment-toggle" type="button" data-post-id="${escapeHtml(post.id)}">
          Comments (${Number(post.comment_count || 0)})
        </button>

        <div class="comments-list" id="comments-${escapeHtml(post.id)}" hidden></div>

        ${
          Number(post.comments_enabled) === 1
            ? `<form class="comment-form" data-post-id="${escapeHtml(post.id)}" hidden>
                <label>
                  Add a comment
                  <input name="comment" type="text" placeholder="Write a supportive note or feedback..." required />
                </label>
                <button class="button secondary" type="submit">Post comment</button>
              </form>`
            : `<p class="muted small">Comments are disabled for this post.</p>`
        }
      </div>
    </div>
    `;

    container.appendChild(card);
  }

  wireCommentControls();
  wireChirpControls();
  wireRentARefControls();
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

        const postsData = await fetchJson("/api/posts");
        renderPosts(postsData.posts || []);

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
        renderComments(postId, data.comments || []);
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
        renderComments(postId, data.comments || []);

        const postsData = await fetchJson("/api/posts");
        renderPosts(postsData.posts || []);
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
  return (
    comment.author_user_id === RENT_A_REF_USER_ID ||
    comment.author_username === RENT_A_REF_USERNAME ||
    comment.author_display_name === "Rent-a-Ref"
  );
}

function getRentARefCommentClass(comment) {
  const reason = String(comment.moderation_reason || "");

  if (reason.includes("red")) return "rent-a-ref-call-red";
  if (reason.includes("yellow")) return "rent-a-ref-call-yellow";
  if (reason.includes("green")) return "rent-a-ref-call-green";

  return "rent-a-ref-call-green";
}

function renderComments(postId, comments) {
  const list = document.querySelector(`#comments-${CSS.escape(postId)}`);
  if (!list) return;

  if (!comments.length) {
    list.innerHTML = `<div class="empty-state">No comments yet.</div>`;
    return;
  }

  list.innerHTML = comments
    .map((comment) => {
      const author = comment.author_display_name || comment.author_username || "Demo Skater";
      const userVote = Number(comment.user_vote || 0);
      const chirpCount = Number(comment.chirp_count || 0);
      const userChirped = Number(comment.user_chirped || 0) === 1;
      const chirpLabel = getChirpProfileLabel(comment);
      const chirpProfileHtml = renderChirpProfile(comment);

      const rentARefComment = isRentARefComment(comment);
      const rentARefClass = rentARefComment ? getRentARefCommentClass(comment) : "";
      const rentARefReadyForComment = isRentARefReadyForComment(comment);

      const moderationStatus = String(comment.moderation_status || "visible");
      const commentIsBoxed = !rentARefComment && moderationStatus !== "visible";
      const moderationBannerHtml = !rentARefComment
        ? renderModerationBanner(comment, "comment")
        : "";

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
          <div class="post-meta">
            <button
              class="button ghost chirp-button ${userChirped ? "active" : ""}"
              type="button"
              data-content-type="comment"
              data-content-id="${escapeHtml(comment.id)}"
            >
              ${userChirped ? `Chirped (${chirpCount})` : `Chirp this (${chirpCount})`}
            </button>

            <span class="badge chirp-badge" ${chirpLabel ? "" : "hidden"}>
              ${escapeHtml(chirpLabel)}
            </span>

            <button
              class="button ghost rent-a-ref-button ${rentARefReadyForComment ? "" : "disabled"}"
              type="button"
              data-comment-id="${escapeHtml(comment.id)}"
              ${rentARefReadyForComment ? "" : "disabled"}
              title="${rentARefReadyForComment ? "Rent-a-Ref can make a call on this comment." : "Rent-a-Ref already made the latest call. New chirp needed."}"
            >
              Rent-a-Ref
            </button>
          </div>

          <div class="chirp-profile-wrap">
            ${chirpProfileHtml}
          </div>
        `;

      return `
        <div
          class="comment-card ${rentARefComment ? `rent-a-ref-comment ${rentARefClass}` : ""}"
          data-comment-id="${escapeHtml(comment.id)}"
        >
          ${moderationBannerHtml}

          <div
            id="comment-boxed-${escapeHtml(comment.id)}"
            class="boxed-content"
            ${commentIsBoxed ? "hidden" : ""}
          >
            <p>${escapeHtml(comment.body)}</p>

            ${commentVoteControlsHtml}

            ${commentChirpControlsHtml}

            <p class="muted small">
              ${escapeHtml(author)} • ${formatDate(comment.created_at)}
            </p>
          </div>
        </div>
      `;
    })
    .join("");

  wireCommentVoteControls();
  wireChirpControls();
  wireRentARefCommentControls();

  if (typeof wireModerationControls === "function") {
    wireModerationControls();
  }
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

function renderChirpProfile(profile) {
  const chirpCount = Number(profile.chirp_count || 0);

  if (chirpCount === 0) return "";

  const axes = getChirpAxisData(profile);

  return `
    <div class="chirp-profile">
      <p class="muted small">
        <strong>Chirp Profile</strong> · ${chirpCount} chirp${chirpCount === 1 ? "" : "s"}
      </p>

      <div class="chirp-profile-visual">
        ${renderChirpRadar(profile)}

        <div class="chirp-profile-grid">
          ${axes
            .map((axis) => {
              return `
                <span class="chirp-score chirp-score-axis" style="--pill-color: ${axis.color};">
                  <strong>${escapeHtml(axis.label)}</strong>: ${escapeHtml(formatChirpScore(axis.value))}
                </span>
              `;
            })
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function getChirpType() {
  const choice = window.prompt(
    [
      "What kind of chirp is this?",
      "",
      "1 = Good Chirp — funny hockey banter",
      "2 = Tape-to-Tape — useful feedback that lands clean",
      "3 = Spicy but Fair — hot, but still in bounds",
      "4 = Tone Check — drifting into cheap-shot territory",
      "5 = Cheap Shot — personal or disrespectful",
      "6 = Gongshow — spam, trolling, or noise",
      "",
      "Enter 1-6:"
    ].join("\n"),
    "1"
  );

  if (choice === null) return null;

  const types = {
    "1": "good_chirp",
    "2": "tape_to_tape",
    "3": "spicy_but_fair",
    "4": "tone_check",
    "5": "cheap_shot",
    "6": "gongshow"
  };

  return types[String(choice).trim()] || "other";
}

async function chirpContent(contentType, contentId) {
  const chirpType = getChirpType();

  if (!chirpType) return null;

  return fetchJson("/api/chirps", {
    method: "POST",
    body: JSON.stringify({
      content_type: contentType,
      content_id: contentId,
      chirp_type: chirpType
    })
  });
}

function updateChirpButton(button, result) {
  if (!button || !result) return;

  const count = Number(result.chirp_count || 0);
  const userChirped = Boolean(result.user_chirped);
  const label = getChirpProfileLabel(result);

  button.classList.toggle("active", userChirped);
  button.textContent = userChirped ? `Chirped (${count})` : `Chirp this (${count})`;

  const card = button.closest(".post-card, .comment-card");
  const badgeTarget = card?.querySelector(".chirp-badge");
  const profileTarget = card?.querySelector(".chirp-profile-wrap");

  if (badgeTarget) {
    badgeTarget.textContent = label;
    badgeTarget.hidden = !label;
  }

  if (profileTarget) {
    profileTarget.innerHTML = renderChirpProfile(result);
  }
}

function wireChirpControls() {
  document.querySelectorAll(".chirp-button").forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = "true";

    button.addEventListener("click", async () => {
      const contentType = button.dataset.contentType;
      const contentId = button.dataset.contentId;

      if (!contentType || !contentId) return;

      try {
        button.disabled = true;

        const result = await chirpContent(contentType, contentId);

        if (result) {
          updateChirpButton(button, result);
        }
      } catch (error) {
        alert(`Could not chirp this: ${error.message}`);
        console.error(error);
      } finally {
        button.disabled = false;
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
        renderComments(postId, data.comments || []);
        
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
          button.title = "Rent-a-Ref already made the latest call. New comment needed.";
        }

        if (list) {
          list.hidden = false;

          if (form) {
            form.hidden = false;
          }

          const data = await fetchJson(`/api/posts/${encodeURIComponent(postId)}/comments`);
          renderComments(postId, data.comments || []);
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
