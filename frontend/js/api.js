/* ============================================================
   api.js
   REAL backend calls with a mock fallback.

   Every public api* function is async: it talks to the Dump Trade
   Express backend at /api/... and falls back to the in-memory mock
   (kept below, with _mock* names) whenever the backend is
   unreachable or errors out. The site still demos fine with the
   server switched off, and the UI never freezes while a request is
   in flight because the transport is non-blocking fetch().

   NOTE ON PERSISTENCE (mock path only): session-created changes
   (new listings, claim/collect status) are cached in sessionStorage;
   the seed arrays below always load fresh from this file.
============================================================ */

/* ============================================================
   Backend transport helpers
   ============================================================ */

/* JWT saved by auth.js on login/register. Storage access can throw
   (private mode / blocked cookies / file:// origins), so guard it. */
function apiToken() {
  try {
    return localStorage.getItem('dumptrade_token') || '';
  } catch (e) {
    return '';
  }
}

/* showToast() lives in listings.js; guard in case of load order. */
function apiToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
  else if (typeof console !== 'undefined') console.warn(msg);
}

/* Async transport. Returns a Promise of parsed JSON on 2xx, throws on
   anything else. Uses fetch with a hard timeout (AbortController) so a slow
   or unreachable backend can never freeze the page — the UI stays
   responsive and the caller falls back to the in-memory mock. */
const _REQ_TIMEOUT_MS = 8000;

async function requestXHR(method, path, body, requireAuth) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _REQ_TIMEOUT_MS);
  try {
    const headers = {};
    const hasBody = body !== null && body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (requireAuth) {
      const tok = apiToken();
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
    }
    const res = await fetch(path, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 300) {
      const text = await res.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch (e) { return null; }
    }
    const err = new Error('HTTP ' + res.status + ' ' + method + ' ' + path);
    err.status = res.status;
    try { err.body = await res.json(); } catch (e) { err.body = null; }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* Ping /api/health once per page load and cache the answer (as a Promise),
   so a dead backend costs one failed request instead of one per call. The
   health route is DB-free, so it answers fast even when the database is down. */
let _backendUpPromise = null;
async function backendUp() {
  if (!_backendUpPromise) {
    _backendUpPromise = (async () => {
      try {
        const r = await requestXHR('GET', '/api/health', null, false);
        return !!(r && r.status === 'ok');
      } catch (e) {
        return false;
      }
    })();
  }
  return _backendUpPromise;
}

/* True when we can make an authenticated call. Never throws: it
   toasts and lets the caller decide what harmless value to return. */
function apiHasAuth() {
  if (apiToken()) return true;
  apiToast('Please log in first.');
  return false;
}

function apiQuery(params) {
  const parts = [];
  Object.keys(params || {}).forEach(k => {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

/* ---------- snake_case (backend) -> camelCase (listings.js) ---------- */
function normalizeListing(b) {
  return {
    id: b.id,
    userID: b.user_id,
    title: b.title,
    category: b.category,
    description: b.description || '',
    photoUrl: b.photo_url || null,
    qtyLabel: b.qty_label,
    qtyNum: Number(b.qty_num) || 1,
    condition: b.condition || '',
    location: b.location || '',
    status: b.status,
    createdAt: b.created_at,
    /* postedAt is an alias of createdAt: ticketCard() / detailHtml()
       in listings.js render timeAgo(l.postedAt). Additive only. */
    postedAt: b.created_at,
    posterName: b.poster_name || '',
    accountType: b.account_type || '',
    /* listing.html decides whether to show the verify add-ons. */
    needs_disposer: !!b.needs_disposer,
    disposerNote: b.disposer_note || '',
  };
}

/* Activities / stories / disposers / support requests already come
   back snake_case and match the renderers — these just fill in
   defaults so nothing prints "undefined". */
function normalizeActivity(b) {
  return Object.assign({}, b, {
    description: b.description || '',
    photo_url: b.photo_url || '',
    location: b.location || '',
    target_volume_label: b.target_volume_label || '',
    target_kg: Number(b.target_kg) || 0,
    volunteers_needed: Number(b.volunteers_needed) || 0,
    volunteers_pledged: Number(b.volunteers_pledged) || 0,
    status: b.status || 'upcoming',
    needs_disposer: !!b.needs_disposer,
    poster_name: b.poster_name || '',
    account_type: b.account_type || '',
  });
}

function normalizeStory(b) {
  return Object.assign({}, b, {
    caption: b.caption || '',
    before_photo_url: b.before_photo_url || '',
    after_photo_url: b.after_photo_url || '',
    location: b.location || '',
    kg_removed: Number(b.kg_removed) || 0,
    disposer_name: b.disposer_name || '',
    poster_name: b.poster_name || '',
    account_type: b.account_type || '',
  });
}

function normalizeDisposer(b) {
  return {
    id: b.id,
    user_id: b.user_id,
    user_name: b.user_name || 'Disposer',
    service_area: b.service_area || '',
    contact_method: b.contact_method || 'call',
    contact_value: b.contact_value || '',
    bio: b.bio || '',
    available: !!b.available,
    cleanups_completed: Number(b.cleanups_completed) || 0,
    kg_diverted: Number(b.kg_diverted) || 0,
    vouch_count: Number(b.vouch_count) || 0,
    created_at: b.created_at,
  };
}

function normalizeSupportRequest(b) {
  return Object.assign({}, b, {
    activity_id: b.activity_id === undefined ? null : b.activity_id,
    disposer_id: b.disposer_id === undefined ? null : b.disposer_id,
    listing_id: b.listing_id === undefined ? null : b.listing_id,
    kind: b.kind || 'other',
    item_label: b.item_label || '',
    qty_needed: Number(b.qty_needed) || 0,
    qty_fulfilled: Number(b.qty_fulfilled) || 0,
    contact_method: b.contact_method || 'dropoff',
    contact_value: b.contact_value || '',
  });
}

/* /api/feed is already merged; this only backfills the per-kind
   fields feed.js reads so no card renders NaN / undefined. */
function normalizeFeedItem(b) {
  const it = Object.assign({}, b);
  it.kind = b.kind || 'listing';
  it.title = b.title || '';
  it.location = b.location || '';
  it.photo_url = b.photo_url || '';
  it.created_at = b.created_at || new Date().toISOString();
  it.poster_name = b.poster_name || b.poster || '';
  it.needs_disposer = !!b.needs_disposer;

  if (it.kind === 'activity') {
    it.volunteers_needed = Number(b.volunteers_needed) || 0;
    it.volunteers_pledged = Number(b.volunteers_pledged) || 0;
    it.status = b.status || 'upcoming';
  } else if (it.kind === 'story') {
    it.before_photo_url = b.before_photo_url || '';
    it.after_photo_url = b.after_photo_url || b.photo_url || '';
    it.kg_removed = Number(b.kg_removed) || 0;
  } else if (it.kind === 'support') {
    /* the merged row carries the support kind in support_kind or status */
    it.support_kind = b.support_kind || b.status || 'other';
    it.item_label = b.item_label || b.title || 'Support ask';
    it.qty_needed = Number(b.qty_needed) || 0;
    it.qty_fulfilled = Number(b.qty_fulfilled) || 0;
    it.contact_method = b.contact_method || 'dropoff';
    it.contact_value = b.contact_value || '';
    it.status = '';
  } else {
    it.status = b.status || 'available';
  }
  return it;
}

/* ---------- Photo upload (multipart, public endpoint) ----------
   Returns the hosted URL ("/assets/uploads/<file>") or null. */
async function uploadPhoto(file) {
  if (!file) return null;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const headers = {};
    const tok = apiToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const res = await fetch('/api/uploads', { method: 'POST', headers, body: fd });
    if (res.status >= 200 && res.status < 300) {
      const data = await res.json();
      return data && data.url ? data.url : null;
    }
  } catch (e) { /* offline / rejected — caller keeps its data URL */ }
  return null;
}

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

/* ============================================================
   PUBLIC API — listings
   Pattern for every function below: try the backend when it is up,
   otherwise (or on any error) use the _mock* body underneath.
   ============================================================ */

async function apiGetCities() {
  try {
    const all = await apiGetListings({ status: "all" });
    const cities = Array.from(new Set(all.map(l => cityOf(l.location || "")).filter(Boolean))).sort();
    if (cities.length) return cities;
  } catch (e) { /* fall through to mock */ }
  return _mockGetCities();
}
function _mockGetCities() {
  return Array.from(new Set(_listings.map(l => cityOf(l.location)))).sort();
}

async function apiGetListings(filters = {}) {
  if (await backendUp()) {
    try {
      const path = "/api/listings" + apiQuery({
        category: filters.category || "",
        status: (filters.status && filters.status !== "all") ? filters.status : "",
        search: filters.search || "",
      });
      const rows = await requestXHR("GET", path, null, false) || [];
      let out = rows.map(normalizeListing);
      // The backend has no city param, so proximity stays client-side.
      if (filters.city) out = out.filter(l => cityOf(l.location) === filters.city);
      return out;
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetListings(filters);
}
function _mockGetListings(filters = {}) {
  return _listings.filter(l => {
    if (filters.category && l.category !== filters.category) return false;
    if (filters.status && filters.status !== "all" && l.status !== filters.status) return false;
    if (filters.city && cityOf(l.location) !== filters.city) return false;
    if (filters.search && !l.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });
}

async function apiGetListingById(id) {
  if (await backendUp()) {
    try {
      const row = await requestXHR("GET", "/api/listings/" + encodeURIComponent(id), null, false);
      if (row && row.id) return normalizeListing(row);
    } catch (e) {
      if (e && e.status === 404) return null; // genuinely gone
      /* else fall through to mock */
    }
  }
  return _mockGetListingById(id);
}
function _mockGetListingById(id) {
  return _listings.find(l => l.id === Number(id)) || null;
}

async function apiAddListing(fields = {}) {
  if (await backendUp()) {
    if (!apiHasAuth()) return null; // caller toasts / bails out
    try {
      const body = {
        title: fields.title || "",
        category: fields.category || "other",
        description: fields.description || "",
        photo_url: fields.photoUrl || fields.photo_url || "",
        qty_label: fields.qtyLabel || fields.qty_label || "",
        qty_num: Number(fields.qtyNum || fields.qty_num) || 1,
        condition: fields.condition || "",
        location: fields.location || "",
        needs_disposer: !!fields.needs_disposer,
        disposer_note: fields.disposer_note || "",
      };
      const row = await requestXHR("POST", "/api/listings", body, true);
      if (row && row.id) return normalizeListing(row);
    } catch (e) {
      if (e && e.status === 401) { apiToast("Please log in first."); return null; }
      /* else fall through to mock */
    }
  }
  return _mockAddListing(fields);
}
function _mockAddListing(fields = {}) {
  const listing = {
    id: _nextId++,
    status: "available",
    posterName: "You",
    accountType: "individual",
    postedAt: new Date().toISOString(),
    photoUrl: null,
    needs_disposer: !!fields.needs_disposer,
    disposerNote: fields.disposer_note || "",
    ...fields,
  };
  _addedListings.unshift(listing);
  saveJSON("dumptrade_added_listings", _addedListings);
  _listings = buildListings();
  return listing;
}

async function apiClaimListing(id) {
  if (await backendUp()) {
    if (!apiToken()) return { ok: false, message: "Please log in first." };
    try {
      await requestXHR("POST", "/api/listings/" + encodeURIComponent(id) + "/claim", {}, true);
      let listing = null;
      try { listing = await apiGetListingById(id); } catch (e2) { /* cosmetic only */ }
      return { ok: true, message: "Claimed! Contact details would be shared here.", listing };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || "Sorry — this was just claimed by someone else." };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockClaimListing(id);
}
function _mockClaimListing(id) {
  const l = _mockGetListingById(id);
  if (!l) return { ok: false, message: "Listing not found." };
  if (l.status !== "available") return { ok: false, message: "Sorry — this was just claimed by someone else." };
  l.status = "claimed";
  persistChange(l);
  return { ok: true, message: "Claimed! Contact details would be shared here.", listing: l };
}

async function apiCollectListing(id) {
  if (await backendUp()) {
    if (!apiToken()) return { ok: false, message: "Please log in first." };
    try {
      await requestXHR("POST", "/api/listings/" + encodeURIComponent(id) + "/collect", {}, true);
      let listing = null;
      try { listing = await apiGetListingById(id); } catch (e2) { /* cosmetic only */ }
      let message = "Marked collected — thank you.";
      if (listing) {
        const m = catMeta(listing.category);
        message = `Marked collected — ~${m.avgKg * (Number(listing.qtyNum) || 1)}kg diverted.`;
      }
      return { ok: true, message, listing };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || "This item isn't awaiting collection." };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockCollectListing(id);
}
function _mockCollectListing(id) {
  const l = _mockGetListingById(id);
  if (!l || l.status !== "claimed") return { ok: false, message: "This item isn't awaiting collection." };
  l.status = "collected";
  persistChange(l);
  const m = catMeta(l.category);
  return { ok: true, message: `Marked collected — ~${m.avgKg * l.qtyNum}kg diverted.`, listing: l };
}

/* === Engagement mock state: disposers + support ===
   Fallback data for the disposer / support / verification endpoints.
   Only used when the backend is unreachable or errors out. */

/* --- Disposer profiles (mock seed) --- */
/* Guard with typeof so a second declaration elsewhere can't clash. */
if (typeof DISPOSERS === 'undefined') {
  var DISPOSERS = [
    { id: 1, user_id: 11, user_name: 'Otieno M.', service_area: 'Kisumu, Nyalenda', contact_method: 'whatsapp', contact_value: '254712345678', bio: 'Mkokoteni collector — daily route through Nyalenda and Kibos Road.', available: true, cleanups_completed: 14, kg_diverted: 1820, vouch_count: 6, created_at: hoursAgo(200) },
    { id: 2, user_id: 12, user_name: 'Achieng B.', service_area: 'Kisumu, CBD', contact_method: 'call', contact_value: '254798765432', bio: 'Event cleanup crews and bulk hauling.', available: true, cleanups_completed: 9, kg_diverted: 1240, vouch_count: 4, created_at: hoursAgo(120) },
  ];
}

/* Mock-only state (persisted across reload in sessionStorage). */
let _supportAdded = loadJSON('dt_support_added', []);
let _pledges = loadJSON('dt_pledges', []);
let _verifications = loadJSON('dt_verifications', []);

/* Combined support-request array (SEED_SUPPORT_REQUESTS + session
   additions) lives further down as _supportReqs; referenced lazily
   here so this block does not redeclare it. */
function _activeSupportRequests() {
  // Single source of truth is the Phase 3-5 block's _supportReqs array
  // (declared later in this file with `let`). Reference it directly.
  try { return _supportReqs || []; } catch (e) { return []; }
}
function _findRequest(id) {
  const numId = Number(id);
  let r = _supportAdded.find(x => x.id === numId);
  if (r) return { req: r, owner: 'added' };
  r = _activeSupportRequests().find(x => x.id === numId);
  if (r) return { req: r, owner: 'seed' };
  return { req: null, owner: null };
}

/* --- Disposers (backend first, mock fallback) --- */
async function apiGetDisposers(sortBy = 'kg') {
  if (await backendUp()) {
    try {
      const sort = (sortBy === 'cleanups' || sortBy === 'vouches') ? sortBy : 'kg';
      const rows = await requestXHR('GET', '/api/disposers' + apiQuery({ sort }), null, false) || [];
      if (rows.length) return rows.map(normalizeDisposer);
      return [];
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetDisposers(sortBy);
}
function _mockGetDisposers(sortBy = 'kg') {
  const arr = [...DISPOSERS];
  if (sortBy === 'cleanups') arr.sort((a, b) => b.cleanups_completed - a.cleanups_completed);
  else if (sortBy === 'vouches') arr.sort((a, b) => b.vouch_count - a.vouch_count);
  else arr.sort((a, b) => b.kg_diverted - a.kg_diverted); // 'kg' default
  return arr;
}

async function apiGetDisposerById(id) {
  if (await backendUp()) {
    try {
      const row = await requestXHR('GET', '/api/disposers/' + encodeURIComponent(id), null, false);
      if (row && row.id) return normalizeDisposer(row);
    } catch (e) {
      if (e && e.status === 404) return null;
      /* else fall through to mock */
    }
  }
  return _mockGetDisposerById(id);
}
function _mockGetDisposerById(id) {
  return DISPOSERS.find(d => d.id === Number(id)) || null;
}

async function apiCreateDisposer(fields = {}) {
  if ((await backendUp()) && apiToken()) {
    try {
      const row = await requestXHR('POST', '/api/disposers', {
        service_area: fields.service_area || '',
        contact_method: fields.contact_method || 'call',
        contact_value: fields.contact_value || '',
        bio: fields.bio || '',
        available: fields.available !== undefined ? !!fields.available : true,
      }, true);
      if (row && row.id) return normalizeDisposer(row);
    } catch (e) { /* fall through to mock */ }
  } else if (await backendUp()) {
    /* No token: prompt, then still hand back a local profile so
       become-disposer.js (which reads profile.id) cannot crash. */
    apiToast('Please log in first.');
  }
  return _mockCreateDisposer(fields);
}
function _mockCreateDisposer(fields = {}) {
  const id = DISPOSERS.reduce((m, d) => Math.max(m, d.id), 0) + 1;
  const profile = {
    id,
    user_id: 1,
    user_name: 'You',
    service_area: fields.service_area || '',
    contact_method: fields.contact_method || 'call',
    contact_value: fields.contact_value || '',
    bio: fields.bio || '',
    available: fields.available !== undefined ? fields.available : true,
    cleanups_completed: 0,
    kg_diverted: 0,
    vouch_count: 0,
    created_at: new Date().toISOString(),
  };
  DISPOSERS.push(profile);
  return profile;
}

async function apiVouchDisposer(id) {
  if (await backendUp()) {
    if (!apiToken()) return { ok: false, message: 'Please log in first.' };
    try {
      const res = await requestXHR('POST', '/api/disposers/' + encodeURIComponent(id) + '/vouch', {}, true);
      return { ok: true, vouch_count: (res && res.vouch_count !== undefined) ? res.vouch_count : undefined };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || 'Could not vouch.' };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockVouchDisposer(id);
}
function _mockVouchDisposer(id) {
  const d = _mockGetDisposerById(id);
  if (!d) return { ok: false, message: 'Disposer not found.' };
  d.vouch_count += 1;
  return { ok: true, vouch_count: d.vouch_count };
}

/* --- Support: pledge / contact / verification --- */
async function apiPledgeSupport(id, qty) {
  if (await backendUp()) {
    if (!apiToken()) return { ok: false, message: 'Please log in first.' };
    try {
      await requestXHR('POST', '/api/support-requests/' + encodeURIComponent(id) + '/pledge',
        { qty: Number(qty) || 1 }, true);
      return { ok: true, message: 'Pledge recorded.' };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || 'Could not pledge.' };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockPledgeSupport(id, qty);
}
function _mockPledgeSupport(id, qty) {
  const { req } = _findRequest(id);
  if (!req) return { ok: false, message: 'Request not found.' };
  qty = Number(qty) || 1;
  const pledge = {
    id: _pledges.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1,
    support_request_id: req.id,
    supporter_id: 1,
    qty,
    confirmed: false,
    note: '',
  };
  _pledges.push(pledge);
  saveJSON('dt_pledges', _pledges);
  req.qty_fulfilled = (Number(req.qty_fulfilled) || 0) + qty;
  if (_supportAdded.find(r => r.id === req.id)) saveJSON('dt_support_added', _supportAdded);
  return { ok: true, qty_fulfilled: req.qty_fulfilled };
}

async function apiConfirmSupportPledge(pledgeId) {
  if (await backendUp()) {
    if (!apiToken()) return { ok: false, message: 'Please log in first.' };
    try {
      await requestXHR('POST', '/api/support-pledges/' + encodeURIComponent(pledgeId) + '/confirm',
        { confirmed: true }, true);
      return { ok: true };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || 'Could not confirm.' };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockConfirmSupportPledge(pledgeId);
}
function _mockConfirmSupportPledge(pledgeId) {
  const p = _pledges.find(x => x.id === Number(pledgeId));
  if (p) { p.confirmed = true; saveJSON('dt_pledges', _pledges); return { ok: true }; }
  return { ok: false, message: 'Pledge not found.' };
}

async function apiGetSupportContact(id) {
  if (await backendUp()) {
    if (!apiHasAuth()) return null; // toasts, caller just bails out
    try {
      const res = await requestXHR('GET', '/api/support-requests/' + encodeURIComponent(id) + '/contact', null, true);
      if (res) return { contact_method: res.contact_method || 'dropoff', contact_value: res.contact_value || '' };
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetSupportContact(id);
}
function _mockGetSupportContact(id) {
  const { req } = _findRequest(id);
  if (!req) return null;
  return { contact_method: req.contact_method, contact_value: req.contact_value };
}

/* --- Verification (cleared) --- */
async function apiCreateVerification(fields = {}) {
  if (await backendUp()) {
    if (!apiHasAuth()) return null;
    try {
      const body = {
        disposer_user_id: Number(fields.disposer_user_id) || 0,
        kg_diverted: Number(fields.kg_diverted) || 0,
        note: fields.note || '',
      };
      /* backend wants exactly one parent */
      if (fields.activity_id) body.activity_id = Number(fields.activity_id);
      else if (fields.listing_id) body.listing_id = Number(fields.listing_id);
      const res = await requestXHR('POST', '/api/verifications', body, true);
      if (res) return { ok: true, verification: res };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || 'Could not record the verification.' };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockCreateVerification(fields);
}
function _mockCreateVerification(fields = {}) {
  const id = _verifications.reduce((m, v) => Math.max(m, v.id || 0), 0) + 1;
  const v = {
    id,
    disposer_user_id: fields.disposer_user_id ?? null,
    verifier_user_id: 1,
    activity_id: fields.activity_id ?? null,
    listing_id: fields.listing_id ?? null,
    kg_diverted: fields.kg_diverted || 0,
    note: fields.note || '',
    verified_at: new Date().toISOString(),
  };
  _verifications.push(v);
  saveJSON('dt_verifications', _verifications);
  if (v.disposer_user_id) {
    const d = DISPOSERS.find(x => x.user_id === Number(v.disposer_user_id) || x.id === Number(v.disposer_user_id));
    if (d) { d.cleanups_completed += 1; d.kg_diverted += Number(v.kg_diverted) || 0; }
  }
  return { ok: true, verification: v };
}

/* ============================================================
   Engagement mock seeds (activities, stories, support requests)
   Fallback data only: the api* functions above hit the backend
   first. Field names are snake_case so they match the backend
   payloads and the renderers can read either source.
   ============================================================ */

const SEED_ACTIVITIES = [
  { id: 101, title: "Nyalenda Drain Clearing", description: "Joining hands to clear the stormwater trenches before the rains.", photo_url: "", location: "Kisumu, Nyalenda", target_volume_label: "~120kg", target_kg: 120, event_date: hoursAgo(-72), volunteers_needed: 8, volunteers_pledged: 2, status: "upcoming", needs_disposer: true, created_at: hoursAgo(3), poster_name: "Amina O.", account_type: "individual" },
  { id: 102, title: "Kibos Road Cleanup", description: "Picking up roadside waste along Kibos Road with the neighbourhood.", photo_url: "", location: "Kisumu, Kibos Road", target_volume_label: "~300kg", target_kg: 300, event_date: hoursAgo(-30), volunteers_needed: 12, volunteers_pledged: 3, status: "active", needs_disposer: false, created_at: hoursAgo(10), poster_name: "Zawadi Works Ltd.", account_type: "organization" },
];

const SEED_STORIES = [
  { id: 201, title: "Before & After: Milimani alley", caption: "Cleared and composted.", before_photo_url: "", after_photo_url: "", location: "Kisumu, Milimani", kg_removed: 60, activity_id: null, disposer_user_id: null, disposer_name: "", created_at: hoursAgo(20), poster_name: "Grace W.", account_type: "individual" },
];

const SEED_SUPPORT_REQUESTS = [
  { id: 301, activity_id: 101, disposer_id: null, listing_id: null, kind: "bags", item_label: "Heavy-duty trash bags", qty_needed: 10, qty_fulfilled: 3, contact_method: "whatsapp", contact_value: "2547XXXXXXX", created_at: hoursAgo(2) },
];

let _addedActivities = loadJSON("dumptrade_added_activities", []);
let _addedStories = loadJSON("dumptrade_added_stories", []);
let _addedSupportRequests = loadJSON("dumptrade_added_support", []);

let _activities = [..._addedActivities, ...SEED_ACTIVITIES];
let _stories = [..._addedStories, ...SEED_STORIES];
let _supportReqs = [..._addedSupportRequests, ...SEED_SUPPORT_REQUESTS];

let _nextActivityId = Math.max(0, ...SEED_ACTIVITIES.map(a => a.id), ..._addedActivities.map(a => a.id)) + 1;
let _nextStoryId = Math.max(0, ...SEED_STORIES.map(s => s.id), ..._addedStories.map(s => s.id)) + 1;
let _nextSupportId = Math.max(0, ...SEED_SUPPORT_REQUESTS.map(s => s.id), ..._addedSupportRequests.map(s => s.id)) + 1;

/* ---------- Activities ---------- */
async function apiGetActivities(filters = {}) {
  if (await backendUp()) {
    try {
      const path = "/api/activities" + apiQuery({
        location: filters.location || "",
        status: (filters.status && filters.status !== "all") ? filters.status : "",
        search: filters.search || "",
      });
      const rows = await requestXHR("GET", path, null, false) || [];
      return rows.map(normalizeActivity);
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetActivities(filters);
}
function _mockGetActivities(filters = {}) {
  return _activities.filter(a => {
    if (filters.status && a.status !== filters.status) return false;
    if (filters.search && !a.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });
}

async function apiGetActivityById(id) {
  if (await backendUp()) {
    try {
      const row = await requestXHR("GET", "/api/activities/" + encodeURIComponent(id), null, false);
      if (row && row.id) return normalizeActivity(row);
    } catch (e) {
      if (e && e.status === 404) return null;
      /* else fall through to mock */
    }
  }
  return _mockGetActivityById(id);
}
function _mockGetActivityById(id) {
  return _activities.find(a => a.id === Number(id)) || null;
}

/* The date input yields "YYYY-MM-DD" but the backend binds a
   time.Time, so widen it to RFC3339 (and omit it when empty). */
function _toRFC3339(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value + "T09:00:00Z";
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function apiCreateActivity(fields = {}) {
  if (await backendUp()) {
    if (!apiHasAuth()) return null;
    try {
      const body = {
        title: fields.title || "",
        description: fields.description || "",
        photo_url: fields.photo_url || "",
        location: fields.location || "",
        target_volume_label: fields.target_volume_label || "",
        target_kg: Number(fields.target_kg) || 0,
        volunteers_needed: Number(fields.volunteers_needed) || 0,
        needs_disposer: !!fields.needs_disposer,
      };
      const when = _toRFC3339(fields.event_date);
      if (when) body.event_date = when;
      const row = await requestXHR("POST", "/api/activities", body, true);
      if (row && row.id) return normalizeActivity(row);
    } catch (e) {
      if (e && e.status === 401) { apiToast("Please log in first."); return null; }
      /* else fall through to mock */
    }
  }
  return _mockCreateActivity(fields);
}
function _mockCreateActivity(fields = {}) {
  const activity = {
    id: _nextActivityId++,
    description: "",
    photo_url: "",
    target_volume_label: "",
    target_kg: 0,
    event_date: "",
    volunteers_needed: 0,
    volunteers_pledged: 0,
    status: "upcoming",
    needs_disposer: false,
    poster_name: "You",
    account_type: "individual",
    created_at: new Date().toISOString(),
    ...fields,
  };
  _addedActivities.unshift(activity);
  saveJSON("dumptrade_added_activities", _addedActivities);
  _activities = [..._addedActivities, ...SEED_ACTIVITIES];
  return activity;
}

async function apiPledgeActivity(id) {
  if (await backendUp()) {
    if (!apiToken()) return { ok: false, message: "Please log in first." };
    try {
      await requestXHR("POST", "/api/activities/" + encodeURIComponent(id) + "/pledge", {}, true);
      return { ok: true, message: "Thanks for pledging — see you there!" };
    } catch (e) {
      if (e && e.status && e.status < 500) {
        return { ok: false, message: (e.body && e.body.error) || "You have already pledged for this one." };
      }
      /* 5xx / network — fall through to mock */
    }
  }
  return _mockPledgeActivity(id);
}
function _mockPledgeActivity(id) {
  const a = _mockGetActivityById(id);
  if (!a) return { ok: false, message: "Activity not found." };
  a.volunteers_pledged = (a.volunteers_pledged || 0) + 1;
  const idx = _addedActivities.findIndex(x => x.id === a.id);
  if (idx !== -1) { _addedActivities[idx] = a; saveJSON("dumptrade_added_activities", _addedActivities); }
  return { ok: true, message: "Thanks for pledging — see you there!" };
}

/* ---------- Impact stories ---------- */
async function apiGetStories(filters = {}) {
  if (await backendUp()) {
    try {
      const path = "/api/stories" + apiQuery({
        location: filters.location || "",
        search: filters.search || "",
      });
      const rows = await requestXHR("GET", path, null, false) || [];
      return rows.map(normalizeStory);
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetStories(filters);
}
function _mockGetStories(filters = {}) {
  return _stories.filter(s => {
    if (filters.search && !s.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });
}

async function apiGetStoryById(id) {
  if (await backendUp()) {
    try {
      const row = await requestXHR("GET", "/api/stories/" + encodeURIComponent(id), null, false);
      if (row && row.id) return normalizeStory(row);
    } catch (e) {
      if (e && e.status === 404) return null;
      /* else fall through to mock */
    }
  }
  return _mockGetStoryById(id);
}
function _mockGetStoryById(id) {
  return _stories.find(s => s.id === Number(id)) || null;
}

async function apiCreateStory(fields = {}) {
  if (await backendUp()) {
    if (!apiHasAuth()) return null;
    try {
      const body = {
        title: fields.title || "",
        caption: fields.caption || "",
        before_photo_url: fields.before_photo_url || "",
        after_photo_url: fields.after_photo_url || "",
        location: fields.location || "",
        kg_removed: Number(fields.kg_removed) || 0,
      };
      if (fields.activity_id) body.activity_id = Number(fields.activity_id);
      if (fields.disposer_user_id) body.disposer_user_id = Number(fields.disposer_user_id);
      const row = await requestXHR("POST", "/api/stories", body, true);
      if (row && row.id) return normalizeStory(row);
    } catch (e) {
      if (e && e.status === 401) { apiToast("Please log in first."); return null; }
      /* else fall through to mock */
    }
  }
  return _mockCreateStory(fields);
}
function _mockCreateStory(fields = {}) {
  const story = {
    id: _nextStoryId++,
    caption: "",
    before_photo_url: "",
    after_photo_url: "",
    location: "",
    kg_removed: 0,
    activity_id: null,
    disposer_user_id: null,
    disposer_name: "",
    poster_name: "You",
    account_type: "individual",
    created_at: new Date().toISOString(),
    ...fields,
  };
  _addedStories.unshift(story);
  saveJSON("dumptrade_added_stories", _addedStories);
  _stories = [..._addedStories, ...SEED_STORIES];
  return story;
}

/* ---------- Support requests ---------- */
async function apiGetSupportRequests(filters = {}) {
  if (await backendUp()) {
    try {
      const path = "/api/support-requests" + apiQuery({
        activity_id: filters.activity_id || "",
        disposer_id: filters.disposer_id || "",
        listing_id: filters.listing_id || "",
        kind: filters.kind || "",
      });
      const rows = await requestXHR("GET", path, null, false) || [];
      return rows.map(normalizeSupportRequest);
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetSupportRequests(filters);
}
function _mockGetSupportRequests(filters = {}) {
  return _supportReqs.filter(r => {
    if (filters.activity_id && r.activity_id !== Number(filters.activity_id)) return false;
    if (filters.listing_id && r.listing_id !== Number(filters.listing_id)) return false;
    if (filters.kind && r.kind !== filters.kind) return false;
    return true;
  });
}

async function apiCreateSupportRequest(fields = {}) {
  if (await backendUp()) {
    if (!apiHasAuth()) return null;
    try {
      const body = {
        kind: fields.kind || "other",
        item_label: fields.item_label || "",
        qty_needed: Number(fields.qty_needed) || 0,
        contact_method: fields.contact_method || "dropoff",
        contact_value: fields.contact_value || "",
      };
      /* backend expects exactly one parent */
      if (fields.activity_id) body.activity_id = Number(fields.activity_id);
      else if (fields.disposer_id) body.disposer_id = Number(fields.disposer_id);
      else if (fields.listing_id) body.listing_id = Number(fields.listing_id);
      const row = await requestXHR("POST", "/api/support-requests", body, true);
      if (row && row.id) return normalizeSupportRequest(row);
    } catch (e) {
      if (e && e.status === 401) { apiToast("Please log in first."); return null; }
      /* else fall through to mock */
    }
  }
  return _mockCreateSupportRequest(fields);
}
function _mockCreateSupportRequest(fields = {}) {
  const req = {
    id: _nextSupportId++,
    activity_id: null,
    disposer_id: null,
    listing_id: null,
    kind: "other",
    item_label: "",
    qty_needed: 0,
    qty_fulfilled: 0,
    contact_method: "dropoff",
    contact_value: "",
    created_at: new Date().toISOString(),
    ...fields,
  };
  _addedSupportRequests.unshift(req);
  saveJSON("dumptrade_added_support", _addedSupportRequests);
  _supportReqs = [..._addedSupportRequests, ...SEED_SUPPORT_REQUESTS];
  return req;
}

/* ---------- Merged feed ---------- */
async function apiGetFeed(limit = 12) {
  if (await backendUp()) {
    try {
      const rows = await requestXHR("GET", "/api/feed" + apiQuery({ limit }), null, false) || [];
      return rows.map(normalizeFeedItem);
    } catch (e) { /* fall through to mock */ }
  }
  return _mockGetFeed(limit);
}
function _mockGetFeed(limit = 12) {
  const listings = _mockGetListings({ status: "all" }).map(l => ({
    kind: "listing", id: l.id, title: l.title, location: l.location,
    photo_url: l.photoUrl, status: l.status, poster_name: l.posterName,
    needs_disposer: !!l.needs_disposer, created_at: l.postedAt,
  }));
  const activities = _activities.map(a => ({
    kind: "activity", id: a.id, title: a.title, location: a.location,
    photo_url: a.photo_url, status: a.status, needs_disposer: !!a.needs_disposer,
    volunteers_needed: a.volunteers_needed, volunteers_pledged: a.volunteers_pledged,
    created_at: a.created_at,
  }));
  const stories = _stories.map(s => ({
    kind: "story", id: s.id, title: s.title, location: s.location,
    before_photo_url: s.before_photo_url, after_photo_url: s.after_photo_url,
    kg_removed: s.kg_removed, created_at: s.created_at,
  }));
  const support = _supportReqs.map(r => {
    const parent = r.activity_id ? _mockGetActivityById(r.activity_id) : null;
    const disp = r.listing_id ? _mockGetListingById(r.listing_id) : null;
    const location = (parent && parent.location) || (disp && disp.location) || "";
    return {
      kind: "support", id: r.id, support_kind: r.kind, item_label: r.item_label,
      qty_needed: r.qty_needed, qty_fulfilled: r.qty_fulfilled, location,
      contact_method: r.contact_method, contact_value: r.contact_value,
      created_at: r.created_at,
    };
  });

  const merged = [...listings, ...activities, ...stories, ...support];
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged.slice(0, limit);
}