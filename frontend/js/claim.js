/* ============================================================
   claim.js
   Wires up the Claim / Mark as collected buttons on listing.html.
   Calls the mock api.js functions, shows a toast, then re-renders
   the detail card in place so the status updates immediately.
============================================================ */

function handleClaim(id) {
  const result = apiClaimListing(id);
  showToast(result.message);
  if (result.ok) rerenderDetail(id);
}

function handleCollect(id) {
  const result = apiCollectListing(id);
  showToast(result.message);
  if (result.ok) rerenderDetail(id);
}

function rerenderDetail(id) {
  const container = document.getElementById("detail-container");
  const listing = apiGetListingById(id);
  if (container && listing) container.innerHTML = detailHtml(listing);
}
