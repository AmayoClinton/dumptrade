/* ============================================================
   support.js (agent B — phase 7)
   Contact-based support / donation engine (no payments).
   Exposes:
     - renderSupportCard(container, req)
     - renderSupportForParent(container, parentType, parentId)
   browse.html / disposer.html / activity.html owners invoke these.
   ============================================================ */

const SUPPORT_KIND_LABEL = {
  bins: 'Bins', bags: 'Bags', gloves: 'Gloves', tools: 'Tools',
  meal: 'Meal', transport: 'Transport', labour: 'Labour', other: 'Other',
};

function supportProgressBar(req) {
  const pct = Math.min(100, Math.round((Number(req.qty_fulfilled) || 0) / (Number(req.qty_needed) || 1) * 100));
  return `
    <div class="support-progress"><span style="width:${pct}%"></span></div>
    <div class="support-meta">${req.qty_fulfilled || 0} / ${req.qty_needed} fulfilled${req.item_label ? ' &mdash; ' + req.item_label : ''}</div>`;
}

function supportCardInner(req) {
  const label = SUPPORT_KIND_LABEL[req.kind] || 'Other';
  return `
    <div class="support-head">
      <span class="chip"><span class="chip-swatch">${req.kind.slice(0, 2).toUpperCase()}</span>${label}</span>
      <span class="support-item-label">${req.item_label || ''}</span>
    </div>
    ${supportProgressBar(req)}
    <div class="support-actions">
      <button class="btn btn-outline-dark" onclick="showSupportContact(${req.id}, this)">Show contact</button>
      <button class="btn btn-primary" onclick="pledgeSupport(${req.id})">I'll bring this</button>
      <button class="btn btn-outline-dark" onclick="confirmSupport(${req.id})">Confirm support received</button>
    </div>`;
}

function renderSupportCard(container, req) {
  if (!container) return;
  const wrap = document.createElement('div');
  wrap.className = 'support-card';
  wrap.id = `support-${req.id}`;
  wrap.innerHTML = supportCardInner(req);
  container.appendChild(wrap);
}

function refreshSupportCard(req) {
  const wrap = document.getElementById(`support-${req.id}`);
  if (wrap) wrap.innerHTML = supportCardInner(req);
}

async function showSupportContact(id, btn) {
  const c = await apiGetSupportContact(id);
  if (!c) return;
  const label = c.contact_method === 'call' ? 'Call'
    : c.contact_method === 'whatsapp' ? 'WhatsApp' : 'Drop-off pin';
  const cardEl = btn.closest('.support-card');
  if (!cardEl) return;
  let sheet = cardEl.querySelector('.contact-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.className = 'contact-sheet';
    cardEl.appendChild(sheet);
  }
  sheet.innerHTML = `<strong>${label}</strong><span>${c.contact_value}</span>`;
}

async function pledgeSupport(id) {
  const req = (await apiGetSupportRequests()).find(r => r.id === Number(id));
  if (!req) return;
  const res = await apiPledgeSupport(id, req.qty_needed);
  if (res.ok) {
    refreshSupportCard(req);
    showToast('Thanks — you are bringing this.');
  } else {
    showToast(res.message || 'Could not pledge.');
  }
}

async function confirmSupport(id) {
  const pledges = (typeof _pledges !== 'undefined' ? _pledges : [])
    .filter(p => p.support_request_id === Number(id));
  if (pledges.length) await apiConfirmSupportPledge(pledges[pledges.length - 1].id);
  showToast('Support confirmed — thank you.');
}

async function renderSupportForParent(container, parentType, parentId) {
  if (!container) return;
  const numId = Number(parentId);
  let reqs;
  if (parentType === 'disposer') {
    /* The shared apiGetSupportRequests (parallel agent) has no disposer_id
       filter, so we post-filter here. */
    reqs = (await apiGetSupportRequests()).filter(r => r.disposer_id === numId);
  } else if (parentType === 'activity') {
    reqs = await apiGetSupportRequests({ activity_id: numId });
  } else {
    reqs = await apiGetSupportRequests({ listing_id: numId });
  }
  if (reqs.length === 0) {
    container.innerHTML += `<div class="empty-state">No support requests for this ${parentType} yet.</div>`;
    return;
  }
  reqs.forEach(r => renderSupportCard(container, r));
}
