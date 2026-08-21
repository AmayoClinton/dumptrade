'use strict';

/**
 * mappers.js — the wire contract, in one place.
 *
 * frontend/js/api.js (normalizeListing / normalizeActivity / normalizeStory /
 * normalizeDisposer / normalizeSupportRequest) reads these exact snake_case
 * keys, so every route returns JSON through the mappers below. The paired
 * SELECT fragments keep the SQL aliases and the JSON keys in sync.
 *
 * `::text` casts on enum-like columns mean these queries also work against a
 * database created by the older Go backend, which used native ENUM types.
 */

const { toISO } = require('./http');

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.password_hash,
         COALESCE(u.account_type::text, 'individual') AS account_type,
         COALESCE(u.location, '') AS location,
         u.created_at
  FROM users u`;

const LISTING_SELECT = `
  SELECT l.id, l.user_id, l.title,
         COALESCE(l.category::text, 'other') AS category,
         COALESCE(l.description, '') AS description,
         COALESCE(l.photo_url, '') AS photo_url,
         COALESCE(l.qty_label, '') AS qty_label,
         COALESCE(l.qty_num, 1) AS qty_num,
         COALESCE(l.condition, '') AS "condition",
         COALESCE(l.location, '') AS location,
         COALESCE(l.status::text, 'available') AS status,
         COALESCE(l.needs_disposer, false) AS needs_disposer,
         COALESCE(l.disposer_note, '') AS disposer_note,
         l.created_at,
         COALESCE(u.name, '') AS poster_name,
         COALESCE(u.account_type::text, '') AS account_type
  FROM listings l
  LEFT JOIN users u ON u.id = l.user_id`;

const ACTIVITY_SELECT = `
  SELECT a.id, a.user_id, a.title,
         COALESCE(a.description, '') AS description,
         COALESCE(a.photo_url, '') AS photo_url,
         COALESCE(a.location, '') AS location,
         COALESCE(a.target_volume_label, '') AS target_volume_label,
         COALESCE(a.target_kg, 0) AS target_kg,
         a.event_date,
         COALESCE(a.volunteers_needed, 0) AS volunteers_needed,
         COALESCE(a.volunteers_pledged, 0) AS volunteers_pledged,
         COALESCE(a.status::text, 'upcoming') AS status,
         COALESCE(a.needs_disposer, false) AS needs_disposer,
         a.created_at,
         COALESCE(u.name, '') AS poster_name,
         COALESCE(u.account_type::text, '') AS account_type
  FROM activities a
  LEFT JOIN users u ON u.id = a.user_id`;

const STORY_SELECT = `
  SELECT s.id, s.user_id, s.title,
         COALESCE(s.caption, '') AS caption,
         COALESCE(s.before_photo_url, '') AS before_photo_url,
         COALESCE(s.after_photo_url, '') AS after_photo_url,
         COALESCE(s.location, '') AS location,
         COALESCE(s.kg_removed, 0) AS kg_removed,
         s.activity_id, s.disposer_user_id,
         COALESCE(d.name, '') AS disposer_name,
         s.created_at,
         COALESCE(u.name, '') AS poster_name,
         COALESCE(u.account_type::text, '') AS account_type
  FROM stories s
  LEFT JOIN users u ON u.id = s.user_id
  LEFT JOIN users d ON d.id = s.disposer_user_id`;

const DISPOSER_SELECT = `
  SELECT p.id, p.user_id,
         COALESCE(u.name, 'Disposer') AS user_name,
         COALESCE(p.service_area, '') AS service_area,
         COALESCE(p.contact_method, 'call') AS contact_method,
         COALESCE(p.contact_value, '') AS contact_value,
         COALESCE(p.bio, '') AS bio,
         COALESCE(p.available, true) AS available,
         COALESCE(p.cleanups_completed, 0) AS cleanups_completed,
         COALESCE(p.kg_diverted, 0) AS kg_diverted,
         COALESCE(p.vouch_count, 0) AS vouch_count,
         p.created_at
  FROM disposer_profiles p
  LEFT JOIN users u ON u.id = p.user_id`;

const SUPPORT_SELECT = `
  SELECT r.id, r.activity_id, r.disposer_id, r.listing_id,
         COALESCE(r.kind::text, 'other') AS kind,
         COALESCE(r.item_label, '') AS item_label,
         COALESCE(r.qty_needed, 1) AS qty_needed,
         COALESCE(r.qty_fulfilled, 0) AS qty_fulfilled,
         COALESCE(r.contact_method, 'dropoff') AS contact_method,
         COALESCE(r.contact_value, '') AS contact_value,
         r.created_at
  FROM support_requests r`;

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const text = (value) => (value === null || value === undefined ? '' : String(value));
const id = (value) => (value === null || value === undefined ? null : Number(value));

/** Public user shape — never includes password_hash. */
function mapUser(row) {
  return {
    id: Number(row.id),
    name: text(row.name),
    email: text(row.email),
    account_type: text(row.account_type) || 'individual',
    location: text(row.location),
    created_at: toISO(row.created_at),
  };
}

function mapListing(row) {
  return {
    id: Number(row.id),
    user_id: id(row.user_id),
    title: text(row.title),
    category: text(row.category),
    description: text(row.description),
    photo_url: text(row.photo_url),
    qty_label: text(row.qty_label),
    qty_num: num(row.qty_num, 1) || 1,
    condition: text(row.condition),
    location: text(row.location),
    status: text(row.status) || 'available',
    created_at: toISO(row.created_at),
    poster_name: text(row.poster_name),
    account_type: text(row.account_type),
    needs_disposer: Boolean(row.needs_disposer),
    disposer_note: text(row.disposer_note),
  };
}

function mapActivity(row) {
  return {
    id: Number(row.id),
    user_id: id(row.user_id),
    title: text(row.title),
    description: text(row.description),
    photo_url: text(row.photo_url),
    location: text(row.location),
    target_volume_label: text(row.target_volume_label),
    target_kg: num(row.target_kg),
    event_date: toISO(row.event_date),
    volunteers_needed: num(row.volunteers_needed),
    volunteers_pledged: num(row.volunteers_pledged),
    status: text(row.status) || 'upcoming',
    needs_disposer: Boolean(row.needs_disposer),
    created_at: toISO(row.created_at),
    poster_name: text(row.poster_name),
    account_type: text(row.account_type),
  };
}

function mapStory(row) {
  return {
    id: Number(row.id),
    user_id: id(row.user_id),
    title: text(row.title),
    caption: text(row.caption),
    before_photo_url: text(row.before_photo_url),
    after_photo_url: text(row.after_photo_url),
    location: text(row.location),
    kg_removed: num(row.kg_removed),
    activity_id: id(row.activity_id),
    disposer_user_id: id(row.disposer_user_id),
    disposer_name: text(row.disposer_name),
    created_at: toISO(row.created_at),
    poster_name: text(row.poster_name),
    account_type: text(row.account_type),
  };
}

function mapDisposer(row) {
  return {
    id: Number(row.id),
    user_id: id(row.user_id),
    user_name: text(row.user_name) || 'Disposer',
    service_area: text(row.service_area),
    contact_method: text(row.contact_method) || 'call',
    contact_value: text(row.contact_value),
    bio: text(row.bio),
    available: Boolean(row.available),
    cleanups_completed: num(row.cleanups_completed),
    kg_diverted: num(row.kg_diverted),
    vouch_count: num(row.vouch_count),
    created_at: toISO(row.created_at),
  };
}

function mapSupportRequest(row) {
  return {
    id: Number(row.id),
    activity_id: id(row.activity_id),
    disposer_id: id(row.disposer_id),
    listing_id: id(row.listing_id),
    kind: text(row.kind) || 'other',
    item_label: text(row.item_label),
    qty_needed: num(row.qty_needed, 1),
    qty_fulfilled: num(row.qty_fulfilled),
    contact_method: text(row.contact_method) || 'dropoff',
    contact_value: text(row.contact_value),
    created_at: toISO(row.created_at),
  };
}

function mapVerification(row) {
  return {
    id: Number(row.id),
    disposer_user_id: id(row.disposer_user_id),
    verifier_user_id: id(row.verifier_user_id),
    activity_id: id(row.activity_id),
    listing_id: id(row.listing_id),
    kg_diverted: num(row.kg_diverted),
    note: text(row.note),
    verified_at: toISO(row.verified_at),
  };
}

module.exports = {
  USER_SELECT,
  LISTING_SELECT,
  ACTIVITY_SELECT,
  STORY_SELECT,
  DISPOSER_SELECT,
  SUPPORT_SELECT,
  mapUser,
  mapListing,
  mapActivity,
  mapStory,
  mapDisposer,
  mapSupportRequest,
  mapVerification,
};
