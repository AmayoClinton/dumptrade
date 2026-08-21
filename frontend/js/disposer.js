/* ============================================================
   disposer.js (agent B — phase 6)
   Public profile page for a single disposer.
   Renders profile + track record + action buttons.
   hireDisposer / sponsorMeal live in disposer-directory.js
   (also used by the directory), vouchDisposer is local here.
   ============================================================ */

function renderDisposerProfile(d) {
  const statusPill = d.available
    ? `<span class="pill-disposer">&#9679; Available for hire</span>`
    : `<span class="pill-disposer off">&#9711; Unavailable</span>`;
  const contactLabel = d.contact_method === 'call' ? 'Call'
    : d.contact_method === 'whatsapp' ? 'WhatsApp' : 'Drop-off pin';

  return `
    <div class="detail-card">
      <div class="detail-body">
        <div class="disposer-head">
          <h1 class="detail-title">${d.user_name}</h1>
          ${statusPill}
        </div>
        <div class="detail-facts">
          <div><span class="fact-label">Service area</span>${d.service_area}</div>
          <div><span class="fact-label">Contact</span>${contactLabel}: ${d.contact_value}</div>
        </div>
        <p class="detail-desc">${d.bio}</p>
        <div class="track-record">
          <div class="impact-card"><div class="impact-num" id="d-cleanups">${d.cleanups_completed}</div><div class="impact-label">cleanups verified</div></div>
          <div class="impact-card"><div class="impact-num" id="d-kg">~${d.kg_diverted}</div><div class="impact-label">kg diverted</div></div>
          <div class="impact-card"><div class="impact-num" id="d-vouch">${d.vouch_count}</div><div class="impact-label">community vouches</div></div>
        </div>
        <div class="disposer-actions">
          <button class="btn btn-primary" onclick="hireDisposer(${d.id})">Hire for cleanup</button>
          <button class="btn btn-outline-dark" onclick="sponsorMeal(${d.id})">Sponsor a meal</button>
          <button class="btn btn-outline-dark" onclick="vouchDisposer(${d.id})">Vouch for this disposer</button>
        </div>
      </div>
    </div>`;
}

function vouchDisposer(id) {
  const res = apiVouchDisposer(id);
  if (res.ok) {
    const el = document.getElementById('d-vouch');
    if (el) el.textContent = res.vouch_count;
    showToast('Thanks — vouch counted.');
  } else {
    showToast(res.message || 'Could not vouch.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get('id'));
  const d = apiGetDisposerById(id);
  const container = document.getElementById('disposer-detail');

  if (d) {
    container.innerHTML = renderDisposerProfile(d);
    if (typeof renderSupportForParent === 'function') {
      renderSupportForParent(document.getElementById('support-for-disposer'), 'disposer', id);
    }
  } else {
    container.innerHTML = `<div class="empty-state">Disposer not found. It may have been removed.</div>`;
  }
});
