/* Shared listing API client and display helpers. */

const LISTINGS_API_BASE = "/api";

const CATEGORIES = [
  { key: "furniture", label: "Furniture", avgKg: 15, tag: "FN" },
  { key: "ewaste", label: "E-Waste", avgKg: 4, tag: "EW" },
  { key: "textiles", label: "Textiles", avgKg: 3, tag: "TX" },
  { key: "construction", label: "Construction", avgKg: 10, tag: "CN" },
  { key: "organic", label: "Organic", avgKg: 2, tag: "OR" },
  { key: "plastic", label: "Plastic / Packaging", avgKg: 1, tag: "PL" },
  { key: "industrial", label: "Industrial Byproduct", avgKg: 18, tag: "IN" },
  { key: "other", label: "Other", avgKg: 3, tag: "OT" },
];

function catMeta(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function timeAgo(iso) {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "recently";
  const hrs = Math.round((Date.now() - timestamp) / 3600000);
  if (hrs < 1) return "just now";
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function cityOf(location) {
  return (location || "").split(",")[0].trim();
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem("dumptrade_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(`${LISTINGS_API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error("Could not reach the server. Please try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

function listingFromApi(listing) {
  return {
    id: listing.id,
    userId: listing.user_id,
    title: listing.title,
    category: listing.category,
    description: listing.description || "No extra details given.",
    photoUrl: listing.photo_url || null,
    qtyLabel: listing.qty_label,
    qtyNum: listing.qty_num,
    condition: listing.condition || "Not specified",
    location: listing.location,
    status: listing.status,
    postedAt: listing.created_at,
    posterName: listing.poster_name || "DumpTrade member",
    accountType: listing.account_type || "individual",
  };
}

function listingQuery(filters = {}) {
  const params = new URLSearchParams();
  ["category", "status", "search", "city", "limit", "offset"].forEach(key => {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== "") params.set(key, filters[key]);
  });
  const query = params.toString();
  return query ? `/listings?${query}` : "/listings";
}

async function apiGetListings(filters = {}) {
  const listings = await apiRequest(listingQuery(filters));
  return listings.map(listingFromApi);
}

async function apiGetCities() {
  const listings = await apiGetListings({ status: "all", limit: 100 });
  return Array.from(new Set(listings.map(listing => cityOf(listing.location)).filter(Boolean))).sort();
}

async function apiGetListingById(id) {
  try {
    return listingFromApi(await apiRequest(`/listings/${Number(id)}`));
  } catch (error) {
    if (error.message === "Listing not found") return null;
    throw error;
  }
}

async function apiUploadPhoto(file) {
  if (!file) return "";
  const form = new FormData();
  form.append("photo", file);
  const result = await apiRequest("/uploads", { method: "POST", body: form });
  return result.photo_url;
}

async function apiCreateListing(fields) {
  const listing = await apiRequest("/listings", {
    method: "POST",
    body: JSON.stringify({
      title: fields.title,
      category: fields.category,
      description: fields.description,
      photo_url: fields.photoUrl,
      qty_label: fields.qtyLabel,
      qty_num: fields.qtyNum,
      condition: fields.condition,
      location: fields.location,
    }),
  });
  return listingFromApi(listing);
}

async function apiClaimListing(id) {
  return apiRequest(`/listings/${id}/claim`, { method: "POST" });
}

async function apiCollectListing(id) {
  return apiRequest(`/listings/${id}/collect`, { method: "POST" });
}