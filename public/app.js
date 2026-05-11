const STORAGE_KEY = "my_hockey_blog_demo_v1";

const seedState = {
  profile: {
    name: "New Hockey Player",
    bio: "Wing • Adult league • Building speed, hands, and hockey IQ."
  },
  posts: [
    {
      id: crypto.randomUUID(),
      title: "First public progress update",
      body: "This is the free infrastructure MVP. Next up: connect the database, add auth, and turn posts/comments into real records.",
      visibility: "public",
      comments: "allow",
      video: "Demo clip placeholder",
      views: 3,
      score: 2,
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: "Private notes example",
      body: "Private posts should show to the owner only once auth exists. For now this is just a UI flag.",
      visibility: "private",
      comments: "disallow",
      video: "",
      views: 0,
      score: 0,
      createdAt: new Date().toISOString()
    }
  ],
  events: [
    {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      type: "Ice session",
      notes: "Edge work and skating form",
      goals: 0,
      assists: 0,
      blocks: 0
    }
  ]
};

const $ = (selector) => document.querySelector(selector);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(seedState);

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(seedState);
  }
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

let state = loadState();

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function updateMetrics() {
  const publicPosts = state.posts.filter((post) => post.visibility === "public").length;
  const views = state.posts.reduce((sum, post) => sum + Number(post.views || 0), 0);
  const goals = state.events.reduce((sum, event) => sum + Number(event.goals || 0), 0);
  const assists = state.events.reduce((sum, event) => sum + Number(event.assists || 0), 0);
  const blocks = state.events.reduce((sum, event) => sum + Number(event.blocks || 0), 0);

  $("#profile-name").textContent = state.profile.name;
  $("#profile-bio").textContent = state.profile.bio;
  $("#metric-posts").textContent = publicPosts;
  $("#metric-views").textContent = views;
  $("#metric-events").textContent = state.events.length;
  $("#stat-goals").textContent = goals;
  $("#stat-assists").textContent = assists;
  $("#stat-blocks").textContent = blocks;
  $("#stat-sessions").textContent = state.events.length;
}

function renderPosts() {
  const container = $("#post-list");
  container.innerHTML = "";

  if (state.posts.length === 0) {
    container.innerHTML = `<div class="empty-state">No posts yet. Create your first hockey update above.</div>`;
    return;
  }

  for (const post of state.posts) {
    const card = document.createElement("article");
    card.className = "post-card";
    card.innerHTML = `
      <div class="post-meta">
        <span class="badge ${post.visibility}">${post.visibility}</span>
        <span class="badge">comments: ${post.comments === "allow" ? "on" : "off"}</span>
        <span class="badge">views: ${Number(post.views || 0)}</span>
        <span class="badge">score: ${Number(post.score || 0)}</span>
      </div>
      <h3>${escapeHtml(post.title)}</h3>
      <p class="muted">${escapeHtml(post.body)}</p>
      ${post.video ? `<p><strong>Video:</strong> <span class="muted">${escapeHtml(post.video)}</span></p>` : ""}
      <div class="post-actions">
        <button class="inline-button" data-action="view" data-id="${post.id}">+ video view</button>
        <button class="inline-button" data-action="upvote" data-id="${post.id}">▲ upvote</button>
        <button class="inline-button" data-action="downvote" data-id="${post.id}">▼ downvote</button>
      </div>
    `;
    container.appendChild(card);
  }
}

function renderEvents() {
  const container = $("#event-list");
  container.innerHTML = "";

  if (state.events.length === 0) {
    container.innerHTML = `<div class="empty-state">No hockey activity logged yet.</div>`;
    return;
  }

  const sortedEvents = [...state.events].sort((a, b) => a.date.localeCompare(b.date));

  for (const event of sortedEvents) {
    const row = document.createElement("div");
    row.className = "event-item";
    row.innerHTML = `
      <div class="event-main">
        <strong>${formatDate(event.date)} • ${escapeHtml(event.type)}</strong>
        <span>${event.notes ? escapeHtml(event.notes) : "No notes yet"}</span>
      </div>
      <span class="badge">G ${Number(event.goals || 0)} / A ${Number(event.assists || 0)} / BS ${Number(event.blocks || 0)}</span>
    `;
    container.appendChild(row);
  }
}

function renderAll() {
  updateMetrics();
  renderPosts();
  renderEvents();
  saveState(state);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("#post-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  state.posts.unshift({
    id: crypto.randomUUID(),
    title: form.get("title"),
    body: form.get("body"),
    visibility: form.get("visibility"),
    comments: form.get("comments"),
    video: form.get("video"),
    views: 0,
    score: 0,
    createdAt: new Date().toISOString()
  });

  event.currentTarget.reset();
  renderAll();
  document.querySelector("#posts").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#event-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  state.events.push({
    id: crypto.randomUUID(),
    date: form.get("date"),
    type: form.get("type"),
    notes: form.get("notes"),
    goals: Number(form.get("goals") || 0),
    assists: Number(form.get("assists") || 0),
    blocks: Number(form.get("blocks") || 0)
  });

  event.currentTarget.reset();
  renderAll();
});

$("#post-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const post = state.posts.find((item) => item.id === button.dataset.id);
  if (!post) return;

  if (button.dataset.action === "view") post.views = Number(post.views || 0) + 1;
  if (button.dataset.action === "upvote") post.score = Number(post.score || 0) + 1;
  if (button.dataset.action === "downvote") post.score = Number(post.score || 0) - 1;

  renderAll();
});

$("#reset-demo").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(seedState);
  renderAll();
});

renderAll();
