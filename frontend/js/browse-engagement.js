/* ============================================================
   browse-engagement.js
   Phase 3 browse panes: segmented control switching, plus
   renderers for activities, impact stories, and the catalogue.
   Reads snake_case fields from the mock api.js layer.
   ============================================================ */

/* ---------- Toggle switching ---------- */
document.getElementById("browse-toggle").addEventListener("click", e => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  const pane = btn.dataset.pane;
  document.querySelectorAll("#browse-toggle .toggle-btn").forEach(b => b.classList.toggle("toggle-active", b === btn));
  document.getElementById("pane-material").hidden = pane !== "material";
  document.getElementById("pane-activities").hidden = pane !== "activities";
  document.getElementById("pane-stories").hidden = pane !== "stories";
  document.getElementById("pane-catalogue").hidden = pane !== "catalogue";
  const disposersPane = document.getElementById("pane-disposers");
  if (disposersPane) {
    disposersPane.hidden = pane !== "disposers";
    // Rendered lazily so the directory is only fetched when asked for.
    if (pane === "disposers") renderDisposersPane();
  }
});

/* ---------- Renderers ---------- */
function activityCard(a) {
  const pct = Math.min(100, Math.round((a.volunteers_pledged / Math.max(1, a.volunteers_needed)) * 100));
  const dispoPill = a.needs_disposer ? `<span class="disposer-pill">Disposer needed</span>` : "";
  const statusBadge = `<span class="stamp-badge ${a.status === "active" ? "stamp-claimed" : a.status === "completed" ? "stamp-collected" : "stamp-available"}">${a.status}</span>`;
  const bg = a.photo_url ? `style="background-image:url('${a.photo_url}')"` : "";
  return `
    <div class="ticket-card">
      <div class="ticket-photo" ${bg}>${a.photo_url ? "" : `<span>ACT</span>`}${statusBadge}</div>
      <div class="ticket-perf"></div>
      <div class="ticket-body">
        ${dispoPill}
        <h3 class="ticket-title">${a.title}</h3>
        <div class="ticket-meta"><span class="meta-item">${ICON.pin}${a.location}</span></div>
        <p class="ticket-desc" style="font-size:.82rem;color:var(--ink-soft);margin:0;">${a.description || ""}</p>
        <div class="pledge-bar">
          <div class="pledge-track"><div class="pledge-fill" style="width:${pct}%"></div></div>
          <div class="pledge-label">${a.volunteers_pledged}/${a.volunteers_needed} volunteers pledged${a.target_volume_label ? ` &middot; ${a.target_volume_label}` : ""}</div>
        </div>
        <div class="activity-actions">
          <button class="btn btn-primary" onclick="pledgeActivity(${a.id})">Pledge to join</button>
          <button class="btn btn-outline-dark" onclick="openSupportSheet(${a.id}, this)">Donate supplies</button>
        </div>
        <div class="contact-sheet" data-support-for="${a.id}"></div>
      </div>
    </div>`;
}

function storyCard(s) {
  const before = s.before_photo_url
    ? `<div class="story-half"><img src="${s.before_photo_url}" alt="Before"><span class="story-tag">Before</span></div>`
    : `<div class="story-half">No photo<span class="story-tag">Before</span></div>`;
  const after = s.after_photo_url
    ? `<div class="story-half"><img src="${s.after_photo_url}" alt="After"><span class="story-tag">After</span></div>`
    : `<div class="story-half">No photo<span class="story-tag">After</span></div>`;
  return `
    <div class="ticket-card">
      <div class="ticket-body">
        <h3 class="ticket-title">${s.title}</h3>
        <div class="ticket-meta"><span class="meta-item">${ICON.pin}${s.location}</span></div>
        <div class="story-split">${before}${after}</div>
        <div class="pledge-label">est. ${s.kg_removed}kg removed</div>
        <p class="ticket-desc" style="font-size:.82rem;color:var(--ink-soft);margin:0;">${s.caption || ""}</p>
      </div>
    </div>`;
}

function renderActivities() {
  const el = document.getElementById("pane-activities");
  const items = apiGetActivities({});
  el.innerHTML = items.length
    ? `<div class="ticket-grid">${items.map(activityCard).join("")}</div>`
    : `<div class="empty-state">No activities posted yet.</div>`;
}

function renderStories() {
  const el = document.getElementById("pane-stories");
  const items = apiGetStories({});
  el.innerHTML = items.length
    ? `<div class="ticket-grid">${items.map(storyCard).join("")}</div>`
    : `<div class="empty-state">No impact stories yet.</div>`;
}

/* The "Become a disposer" prompt + the directory itself both come from
   disposer-directory.js. Each one owns its own innerHTML, so they get a
   wrapper each instead of sharing #pane-disposers. */
let _disposersPaneRendered = false;
function renderDisposersPane() {
  const el = document.getElementById("pane-disposers");
  if (!el || _disposersPaneRendered) return;

  el.innerHTML = `<div id="disposers-become"></div><div id="disposers-directory"></div>`;
  if (typeof renderBecomeDisposerCard === "function") {
    renderBecomeDisposerCard(document.getElementById("disposers-become"));
  }
  if (typeof renderDisposerDirectory === "function") {
    renderDisposerDirectory(document.getElementById("disposers-directory"), "kg");
  }
  _disposersPaneRendered = true;
}

/* ---------- Actions ---------- */
function pledgeActivity(id) {
  const res = apiPledgeActivity(id);
  showToast(res.message);
  if (res.ok) renderActivities();
}

function openSupportSheet(activityId, btn) {
  const sheet = document.querySelector(`.contact-sheet[data-support-for="${activityId}"]`);
  if (!sheet) return;
  if (sheet.classList.contains("open")) { sheet.classList.remove("open"); return; }

  const reqs = apiGetSupportRequests({ activity_id: activityId });
  if (reqs.length === 0) {
    sheet.innerHTML = `<div class="contact-row"><span>No supplies requested yet — bring what you can.</span></div>`;
  } else {
    sheet.innerHTML = reqs.map(r => `
      <div class="contact-row"><span>${r.item_label}</span><span class="contact-val">${r.qty_fulfilled}/${r.qty_needed}</span></div>
      <div class="contact-row"><span>Contact (${r.contact_method})</span><span class="contact-val">${r.contact_value || "drop-off"}</span></div>
    `).join("");
  }
  sheet.classList.add("open");
}

/* ---------- Init ---------- */
renderActivities();
renderStories();
renderCatalogue(document.getElementById("pane-catalogue"));
/* #pane-disposers is filled by renderDisposersPane() the first time the
   Disposers tab is opened (see the toggle handler above). */
