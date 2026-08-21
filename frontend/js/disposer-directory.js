/* ============================================================
   disposer-directory.js (agent B — phase 6)
   Exposes renderers for the browse.html "Disposers" pane:
     - renderBecomeDisposerCard(container)
     - renderDisposerDirectory(container, sortBy)
   Also defines hireDisposer / sponsorMeal (used here + disposer.html).
   The browse.html owner invokes these; this file owns no HTML.
   ============================================================ */

function disposerCardHtml(d) {
  const statusPill = d.available
    ? `<span class="pill-disposer">&#9679; Available</span>`
    : `<span class="pill-disposer off">&#9711; Busy</span>`;
  return `
    <div class="disposer-card">
      <div class="disposer-head">
        <span class="disposer-name">${d.user_name}</span>
        ${statusPill}
      </div>
      <div class="disposer-area">${ICON.pin} ${d.service_area}</div>
      <div class="disposer-bio">${d.bio}</div>
      <div class="track-record">
        <div class="mini-stat"><div class="mini-num">${d.cleanups_completed}</div><div class="mini-label">cleanups</div></div>
        <div class="mini-stat"><div class="mini-num">~${d.kg_diverted}</div><div class="mini-label">kg diverted</div></div>
        <div class="mini-stat"><div class="mini-num">${d.vouch_count}</div><div class="mini-label">vouches</div></div>
      </div>
      <div class="disposer-actions">
        <a class="btn btn-outline-dark" href="disposer.html?id=${d.id}">View track record</a>
        <button class="btn btn-primary" onclick="hireDisposer(${d.id})">Hire for cleanup</button>
      </div>
    </div>`;
}

function renderBecomeDisposerCard(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="become-prompt">
      <h3>Become a disposer</h3>
      <p>Put your work on the manifest — routes, crews and cleanups.</p>
      <a class="btn btn-primary" href="become-disposer.html">Become a disposer</a>
    </div>`;
}

function renderDisposerDirectory(container, sortBy = 'kg') {
  if (!container) return;
  const disposers = apiGetDisposers(sortBy);
  if (disposers.length === 0) {
    container.innerHTML = `<div class="empty-state">No disposers on the manifest yet.</div>`;
    return;
  }
  container.innerHTML = `<div class="ticket-grid">${disposers.map(disposerCardHtml).join('')}</div>`;
}

/* Shared hire / sponsor actions (mock toasts — no backend logic). */
function hireDisposer(id) {
  const d = apiGetDisposerById(id);
  showToast(`Hire request sent to ${d ? d.user_name : 'disposer'}.`);
}
function sponsorMeal(id) {
  const d = apiGetDisposerById(id);
  showToast(`Meal sponsorship offered to ${d ? d.user_name : 'disposer'}.`);
}
