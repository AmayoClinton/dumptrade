/* ============================================================
   claim.js
   Wires up the Claim / Mark as collected buttons on listing.html.
   Calls the mock api.js functions, shows a toast, then re-renders
   the detail card in place so the status updates immediately.
============================================================ */

async function handleClaim(id) {
  const result = await apiClaimListing(id);
  showToast(result.message);
  if (result.ok) rerenderDetail(id);
}

async function handleCollect(id) {
  const result = await apiCollectListing(id);
  showToast(result.message);
  if (result.ok) rerenderDetail(id);
}

async function rerenderDetail(id) {
  const container = document.getElementById("detail-container");
  const listing = await apiGetListingById(id);
  if (container && listing) container.innerHTML = detailHtml(listing);
}
