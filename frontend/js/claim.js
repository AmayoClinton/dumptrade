/* Wires claim and collection actions to the authenticated API. */

async function handleClaim(id) {
  try {
    const result = await apiClaimListing(id);
    showToast(result.message || "Listing claimed successfully.");
    await rerenderDetail(id);
  } catch (error) {
    showToast(error.message);
  }
}

async function handleCollect(id) {
  try {
    const result = await apiCollectListing(id);
    showToast(result.message || "Listing marked as collected.");
    await rerenderDetail(id);
  } catch (error) {
    showToast(error.message);
  }
}

async function rerenderDetail(id) {
  const container = document.getElementById("detail-container");
  try {
    const listing = await apiGetListingById(id);
    if (container && listing) container.innerHTML = detailHtml(listing);
  } catch (error) {
    showToast(error.message);
  }
}