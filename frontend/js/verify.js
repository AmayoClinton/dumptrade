/* ============================================================
   verify.js
   Exposes renderDetailAddons(container, item) which listing.html /
   activity.html append into their #detail-addons, plus
   markVerifiedCleared() behind the "Mark verified cleared" button.

   markVerifiedCleared() posts a real verification through
   apiCreateVerification() (POST /api/verifications), attributing it
   to the listing/activity currently on screen. renderDetailAddons()
   stashes that item on window._currentDetailItem so the click
   handler knows what it is verifying; if the backend is unreachable
   api.js falls back to its mock and we just toast.
   ============================================================ */

function renderDetailAddons(container, item) {
  if (!container) return;
  window._currentDetailItem = item || null;
  container.innerHTML = `
    <div class="verify-actions">
      <button class="btn btn-outline-dark" onclick="markVerifiedCleared()">Mark verified cleared</button>
    </div>`;
}

/* Is the item on screen an activity or a listing? Activities carry
   volunteer/target fields; listings carry a category + qty. */
function _detailItemKind(item) {
  if (!item) return null;
  if (item.volunteers_needed !== undefined || item.target_kg !== undefined || item.event_date !== undefined) return "activity";
  if (item.category !== undefined || item.qtyLabel !== undefined) return "listing";
  return null;
}

async function markVerifiedCleared() {
  const item = window._currentDetailItem || null;

  const kgRaw = window.prompt("Kg diverted for this clearance?", "50");
  if (kgRaw === null) return; // cancelled
  const kg = Number(kgRaw) || 0;

  const disposerRaw = window.prompt("Disposer user id to credit:", "");
  if (disposerRaw === null) return; // cancelled

  const fields = { kg_diverted: kg, note: "" };
  if (disposerRaw && disposerRaw.trim()) fields.disposer_user_id = Number(disposerRaw.trim());

  // The backend wants exactly one parent (activity_id OR listing_id).
  const kind = _detailItemKind(item);
  if (item && item.id) {
    if (kind === "activity") fields.activity_id = item.id;
    else if (kind === "listing") fields.listing_id = item.id;
  }

  if (!fields.disposer_user_id) {
    showToast("A disposer user id is needed to credit the clearance.");
    return;
  }

  const res = await apiCreateVerification(fields);
  if (!res) return; // api.js already toasted (e.g. "Please log in first.")
  if (res.ok === false) {
    showToast(res.message || "Could not record the verification.");
    return;
  }
  showToast("Verified — disposer track record updated.");
}
