/* ============================================================
   api.js
   Stands in for real backend calls. Every function here mimics
   what a fetch() to the backend will eventually do — same shapes,
   same names minus the "api" prefix once wired to a real server.
   Swap the bodies of these functions for fetch() calls when the
   backend (see project Rmd) is ready; callers won't need to change.

   NOTE ON PERSISTENCE: only session-created changes (new listings,
   claim/collect status) are cached in sessionStorage — the seed
   listings below always load fresh from this file. That means
   editing anything here (like a photoUrl) shows up immediately on
   reload instead of being masked by a stale cached copy. Remove
   this whole persistence layer once the real backend + database
   are wired up.
============================================================ */

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
function hoursAgo(h) { return new Date(Date.now() - h * 3600 * 1000).toISOString(); }
function timeAgo(iso) {
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (hrs < 1) return "just now";
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
// Locations are stored as "City, Area" — cityOf() pulls out the city
// for the location filter (proximity by city, not real geolocation yet).
function cityOf(location) { return location.split(",")[0].trim(); }

// Edit photos, text, etc. here freely — this array always loads fresh,
// it is never itself cached. Point photoUrl at a real hosted image or
// a local file under assets/ (e.g. "assets/listings/chairs.jpg").
const SEED_LISTINGS = [
  { id: 1, title: "3 office chairs, minor wear", category: "furniture", qtyLabel: "3 units", qtyNum: 3, condition: "Used - good", location: "Kisumu, Milimani", status: "available", posterName: "Amina O.", accountType: "individual", postedAt: hoursAgo(2), description: "Swivel chairs from a closed workspace. Two need a screw tightened, otherwise solid.", photoUrl: "https://thumbs.dreamstime.com/b/lots-broken-office-chairs-going-repairs-landfill-269309706.jpg" },
  { id: 2, title: "Offcut timber, mixed sizes", category: "construction", qtyLabel: "~40kg", qtyNum: 4, condition: "New offcuts", location: "Nairobi, Industrial Area", status: "available", posterName: "Zawadi Works Ltd.", accountType: "organization", postedAt: hoursAgo(5), description: "Leftover from cabinet production. Good for small joinery or a firewood alternative.", photoUrl: "https://www.lbmachinery.com/wp-content/uploads/2026/08/ScreenShot_2026-08-06_114610_954.png" },
  { id: 3, title: "Broken laptops (for parts)", category: "ewaste", qtyLabel: "6 units", qtyNum: 6, condition: "Non-functional", location: "Kisumu, CBD", status: "claimed", posterName: "Brian K.", accountType: "individual", postedAt: hoursAgo(30), description: "Screens cracked, boards may still work. Good for a repair shop or e-waste recycler.", photoUrl: null },
  { id: 4, title: "Fabric offcuts, assorted colors", category: "textiles", qtyLabel: "5 bags", qtyNum: 5, condition: "New offcuts", location: "Nairobi, Gikomba", status: "available", posterName: "Cheza Tailors", accountType: "organization", postedAt: hoursAgo(8), description: "Cotton and ankara offcuts from tailoring. Great for patchwork or stuffing.", photoUrl: "https://www.intellecap.com/wp-content/uploads/2024/05/new_case_study02.jpg" },
  { id: 5, title: "Spent coffee grounds, daily", category: "organic", qtyLabel: "10kg / day", qtyNum: 5, condition: "Fresh daily", location: "Kisumu, Milimani", status: "available", posterName: "Java Corner Cafe", accountType: "organization", postedAt: hoursAgo(1), description: "Recurring listing — great for composting or mushroom substrate. Collect daily after 6pm.", photoUrl: null },
  { id: 6, title: "Dining table, one leg wobbly", category: "furniture", qtyLabel: "1 unit", qtyNum: 1, condition: "Used - fair", location: "Kisumu, Nyalenda", status: "collected", posterName: "Grace W.", accountType: "individual", postedAt: hoursAgo(60), description: "Solid wood, just needs a leg brace.", photoUrl: null },
  { id: 7, title: "PET bottle bales", category: "plastic", qtyLabel: "200kg", qtyNum: 20, condition: "Sorted, clean", location: "Nairobi, Industrial Area", status: "available", posterName: "Pack Right Ltd.", accountType: "organization", postedAt: hoursAgo(12), description: "Baled PET from packaging line. Ready for a recycler with pickup capacity.", photoUrl: null },
  { id: 8, title: "Metal shavings from lathe work", category: "industrial", qtyLabel: "80kg", qtyNum: 5, condition: "Mixed alloy", location: "Kisumu, Kibos Road", status: "available", posterName: "Otieno Metal Works", accountType: "organization", postedAt: hoursAgo(20), description: "Steel and aluminum shavings, unsorted. Good for scrap buyers.", photoUrl: null },
  { id: 9, title: "Kids clothes, outgrown", category: "textiles", qtyLabel: "2 bags", qtyNum: 2, condition: "Used - good", location: "Nairobi, Kasarani", status: "collected", posterName: "Faith M.", accountType: "individual", postedAt: hoursAgo(90), description: "Ages 2-6, mixed. Clean and folded.", photoUrl: null },
  { id: 10, title: "Old car batteries", category: "ewaste", qtyLabel: "4 units", qtyNum: 4, condition: "Dead", location: "Kisumu, Mamboleo", status: "available", posterName: "Peter N.", accountType: "individual", postedAt: hoursAgo(3), description: "For a licensed e-waste or battery recycler only, please.", photoUrl: null },
];

// --- Session-only persistence for CHANGES only, not the seed data ---
function loadJSON(key, fallback) {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

let _statusOverrides = loadJSON("dumptrade_status_overrides", {}); // { [seedId]: newStatus }
let _addedListings = loadJSON("dumptrade_added_listings", []);     // listings created via Post

function buildListings() {
  const seeded = SEED_LISTINGS.map(l =>
    _statusOverrides[l.id] ? { ...l, status: _statusOverrides[l.id] } : l
  );
  return [..._addedListings, ...seeded];
}

let _listings = buildListings();
let _nextId = Math.max(0, ...SEED_LISTINGS.map(l => l.id), ..._addedListings.map(l => l.id)) + 1;

function persistChange(listing) {
  const isSeed = SEED_LISTINGS.some(s => s.id === listing.id);
  if (isSeed) {
    _statusOverrides[listing.id] = listing.status;
    saveJSON("dumptrade_status_overrides", _statusOverrides);
  } else {
    const idx = _addedListings.findIndex(a => a.id === listing.id);
    if (idx !== -1) { _addedListings[idx] = listing; saveJSON("dumptrade_added_listings", _addedListings); }
  }
}

function apiGetCities() {
  return Array.from(new Set(_listings.map(l => cityOf(l.location)))).sort();
}

function apiGetListings(filters = {}) {
  return _listings.filter(l => {
    if (filters.category && l.category !== filters.category) return false;
    if (filters.status && filters.status !== "all" && l.status !== filters.status) return false;
    if (filters.city && cityOf(l.location) !== filters.city) return false;
    if (filters.search && !l.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });
}

function apiGetListingById(id) {
  return _listings.find(l => l.id === Number(id)) || null;
}

function apiAddListing(fields) {
  const listing = {
    id: _nextId++,
    status: "available",
    posterName: "You",
    accountType: "individual",
    postedAt: new Date().toISOString(),
    photoUrl: null,
    ...fields,
  };
  _addedListings.unshift(listing);
  saveJSON("dumptrade_added_listings", _addedListings);
  _listings = buildListings();
  return listing;
}

function apiClaimListing(id) {
  const l = apiGetListingById(id);
  if (!l) return { ok: false, message: "Listing not found." };
  if (l.status !== "available") return { ok: false, message: "Sorry — this was just claimed by someone else." };
  l.status = "claimed";
  persistChange(l);
  return { ok: true, message: "Claimed! Contact details would be shared here.", listing: l };
}

function apiCollectListing(id) {
  const l = apiGetListingById(id);
  if (!l || l.status !== "claimed") return { ok: false, message: "This item isn't awaiting collection." };
  l.status = "collected";
  persistChange(l);
  const m = catMeta(l.category);
  return { ok: true, message: `Marked collected — ~${m.avgKg * l.qtyNum}kg diverted.`, listing: l };
}