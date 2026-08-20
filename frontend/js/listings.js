/* ============================================================
   listings.js
   Shared rendering helpers (listing cards, detail view, badges)
   plus small UI utilities (toast) reused across every page.
============================================================ */

const ICON = {
  pin: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  upload: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`,
  back: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  close: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
};

/* ---------- Toast ---------- */
let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.innerHTML = msg;
  el.style.display = "flex";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = "none"; }, 3000);
}

/* ---------- Card / badge renderers ---------- */
function stampBadge(status) {
  const label = status === "available" ? "Available" : status === "claimed" ? "Claimed" : "Collected";
  const cls = status === "available" ? "stamp-available" : status === "claimed" ? "stamp-claimed" : "stamp-collected";
  return `<span class="stamp-badge ${cls}">${label}</span>`;
}
function catTag(catKey) {
  const m = catMeta(catKey);
  return `<span class="cat-tag"><span class="cat-tag-swatch">${m.tag}</span>${m.label}</span>`;
}
function ticketCard(l) {
  const m = catMeta(l.category);
  const bg = l.photoUrl ? `style="background-image:url('${l.photoUrl}')"` : "";
  return `
    <a class="ticket-card" href="listing.html?id=${l.id}">
      <div class="ticket-photo" ${bg}>
        ${l.photoUrl ? "" : `<span>${m.tag}</span>`}
        ${stampBadge(l.status)}
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-body">
        ${catTag(l.category)}
        <h3 class="ticket-title">${l.title}</h3>
        <div class="ticket-meta">
          <span class="meta-item">${ICON.pin}${l.location}</span>
          <span class="meta-item">${ICON.clock}${timeAgo(l.postedAt)}</span>
        </div>
        <div class="ticket-qty">${l.qtyLabel} &mdash; est. ${m.avgKg * l.qtyNum}kg</div>
      </div>
    </a>`;
}
function ticketGridHtml(listingsArr) {
  if (listingsArr.length === 0) return `<div class="empty-state">Nothing matches yet. Try clearing a filter.</div>`;
  return `<div class="ticket-grid">${listingsArr.map(ticketCard).join("")}</div>`;
}

/* ---------- Detail view ---------- */
function detailHtml(l) {
  const m = catMeta(l.category);
  const estKg = m.avgKg * l.qtyNum;
  const bg = l.photoUrl ? `style="background-image:url('${l.photoUrl}')"` : "";

  let actions = "";
  if (l.status === "available") actions = `<button class="btn btn-primary" onclick="handleClaim(${l.id})">Claim this</button>`;
  else if (l.status === "claimed") actions = `<button class="btn btn-outline-dark" onclick="handleCollect(${l.id})">Mark as collected</button>`;
  else actions = `<div class="collected-note">${ICON.check} This item was collected &mdash; est. ${estKg}kg diverted.</div>`;

  return `
    <div class="detail-card">
      <div class="detail-photo" ${bg}>${l.photoUrl ? "" : `<span>${m.tag}</span>`}${stampBadge(l.status)}</div>
      <div class="detail-body">
        ${catTag(l.category)}
        <h1 class="detail-title">${l.title}</h1>
        <p class="detail-desc">${l.description}</p>
        <div class="detail-facts">
          <div><span class="fact-label">Quantity</span>${l.qtyLabel}</div>
          <div><span class="fact-label">Condition</span>${l.condition}</div>
          <div><span class="fact-label">Location</span>${l.location}</div>
          <div><span class="fact-label">Posted</span>${timeAgo(l.postedAt)}</div>
          <div><span class="fact-label">Est. weight</span>${estKg}kg</div>
          <div><span class="fact-label">Posted by</span>${l.posterName} ${l.accountType === "organization" ? "(org)" : ""}</div>
        </div>
        <div class="detail-actions">${actions}</div>
      </div>
    </div>`;
}
