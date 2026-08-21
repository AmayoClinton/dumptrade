/* ============================================================
   feed.js
   Phase 5: renders the merged community feed on index.html.
   Switches on item.kind and reuses the .ticket-card primitives.
   ============================================================ */

function feedListingCard(item) {
  const dispoPill = item.needs_disposer ? `<span class="disposer-pill">Disposer needed</span>` : "";
  return `
    <div class="ticket-card">
      <div class="ticket-photo" ${item.photo_url ? `style="background-image:url('${item.photo_url}')"` : ""}>
        ${item.photo_url ? "" : `<span>DT</span>`}${stampBadge(item.status)}
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-body">
        ${dispoPill}
        <h3 class="ticket-title">${item.title}</h3>
        <div class="ticket-meta"><span class="meta-item">${ICON.pin}${item.location}</span></div>
        <div class="activity-actions">
          <button class="btn btn-primary" onclick="showToast('Claim flow opens in listing')">Claim this</button>
        </div>
      </div>
    </div>`;
}

function feedActivityCard(item) {
  const pct = Math.min(100, Math.round((item.volunteers_pledged / Math.max(1, item.volunteers_needed)) * 100));
  const dispoPill = item.needs_disposer ? `<span class="disposer-pill">Disposer needed</span>` : "";
  return `
    <div class="ticket-card">
      <div class="ticket-photo" ${item.photo_url ? `style="background-image:url('${item.photo_url}')"` : ""}>
        ${item.photo_url ? "" : `<span>ACT</span>`}
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-body">
        ${dispoPill}
        <h3 class="ticket-title">${item.title}</h3>
        <div class="ticket-meta"><span class="meta-item">${ICON.pin}${item.location}</span></div>
        <div class="pledge-bar">
          <div class="pledge-track"><div class="pledge-fill" style="width:${pct}%"></div></div>
          <div class="pledge-label">${item.volunteers_pledged}/${item.volunteers_needed} volunteers pledged</div>
        </div>
        <div class="activity-actions">
          <button class="btn btn-primary" onclick="showToast('Pledge flow opens in Browse')">Pledge to join</button>
          <button class="btn btn-outline-dark" onclick="showToast('Donate flow opens in Browse')">Donate supplies</button>
        </div>
      </div>
    </div>`;
}

function feedStoryCard(item) {
  const before = item.before_photo_url
    ? `<div class="story-half"><img src="${item.before_photo_url}" alt="Before"><span class="story-tag">Before</span></div>`
    : `<div class="story-half">No photo<span class="story-tag">Before</span></div>`;
  const after = item.after_photo_url
    ? `<div class="story-half"><img src="${item.after_photo_url}" alt="After"><span class="story-tag">After</span></div>`
    : `<div class="story-half">No photo<span class="story-tag">After</span></div>`;
  return `
    <div class="ticket-card">
      <div class="ticket-body">
        <h3 class="ticket-title">${item.title}</h3>
        <div class="ticket-meta"><span class="meta-item">${ICON.pin}${item.location}</span></div>
        <div class="story-split">${before}${after}</div>
        <div class="pledge-label">est. ${item.kg_removed}kg removed</div>
      </div>
    </div>`;
}

function feedSupportCard(item) {
  const pct = Math.min(100, Math.round((item.qty_fulfilled / Math.max(1, item.qty_needed)) * 100));
  return `
    <div class="ticket-card">
      <div class="ticket-body">
        <span class="disposer-pill">Support ask</span>
        <h3 class="ticket-title">${item.item_label}</h3>
        <div class="ticket-meta"><span class="meta-item">${ICON.pin}${item.location || "—"}</span></div>
        <div class="support-progress">
          <div class="pledge-track"><div class="pledge-fill" style="width:${pct}%"></div></div>
          <div class="support-qty">${item.qty_fulfilled}/${item.qty_needed} ${item.support_kind} provided</div>
        </div>
        <div class="contact-sheet" style="display:none" id="support-contact-${item.id}">
          <div class="contact-row"><span>Contact (${item.contact_method})</span><span class="contact-val">${item.contact_value || "drop-off"}</span></div>
        </div>
        <div class="activity-actions">
          <button class="btn btn-outline-dark" onclick="(function(){var s=document.getElementById('support-contact-${item.id}');s.style.display=s.style.display==='none'?'block':'none';})()">Show contact</button>
        </div>
      </div>
    </div>`;
}

function feedCard(item) {
  switch (item.kind) {
    case "listing": return feedListingCard(item);
    case "activity": return feedActivityCard(item);
    case "story": return feedStoryCard(item);
    case "support": return feedSupportCard(item);
    default: return "";
  }
}

async function renderFeed(filter = "all") {
  const stream = document.getElementById("feed-stream");
  const all = await apiGetFeed(9);
  const items = filter === "all" ? all : all.filter(i => i.kind === filter);

  let html = items.length
    ? `<div class="ticket-grid">${items.map(feedCard).join("")}</div>`
    : `<div class="empty-state">Nothing here yet.</div>`;

  if (all.length > 9) {
    html += `<a class="feed-link" href="browse.html">See everything in Browse &rarr;</a>`;
  }
  stream.innerHTML = html;
}

document.getElementById("feed-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  document.querySelectorAll("#feed-tabs .toggle-btn").forEach(b => b.classList.toggle("toggle-active", b === btn));
  renderFeed(btn.dataset.feed).catch(err => console.error("[feed] render failed:", err));
});

renderFeed("all").catch(err => console.error("[feed] render failed:", err));
