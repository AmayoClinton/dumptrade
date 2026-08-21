'use strict';

/**
 * feed.js — GET /api/feed?limit=12
 *
 * One merged, newest-first stream of listings, activities, stories and support
 * asks. frontend/js/feed.js switches on `kind` and reads a different field set
 * per kind (see normalizeFeedItem in frontend/js/api.js), so each branch below
 * emits exactly the keys that kind's card needs.
 *
 * A failing sub-query degrades to an empty slice instead of a 500: the home
 * page feed is a widget, not the point of the page.
 */

const express = require('express');
const { sql } = require('../db');
const { asyncRoute, toInt, toISO } = require('../http');

const router = express.Router();

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

async function safeRows(label, text, values) {
  try {
    const { rows } = await sql.query(text, values);
    return rows;
  } catch (err) {
    console.warn(`[dumptrade] feed: skipping ${label}: ${err.message}`);
    return [];
  }
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const requested = toInt(req.query.limit, DEFAULT_LIMIT);
    const limit = Math.min(MAX_LIMIT, requested > 0 ? requested : DEFAULT_LIMIT);

    const [listings, activities, stories, support] = await Promise.all([
      safeRows(
        'listings',
        `SELECT l.id, l.title, COALESCE(l.location, '') AS location,
                COALESCE(l.photo_url, '') AS photo_url,
                COALESCE(l.status::text, 'available') AS status,
                COALESCE(u.name, '') AS poster_name,
                COALESCE(l.needs_disposer, false) AS needs_disposer,
                l.created_at
         FROM listings l
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT $1`,
        [limit]
      ),
      safeRows(
        'activities',
        `SELECT a.id, a.title, COALESCE(a.location, '') AS location,
                COALESCE(a.photo_url, '') AS photo_url,
                COALESCE(a.status::text, 'upcoming') AS status,
                COALESCE(a.needs_disposer, false) AS needs_disposer,
                COALESCE(a.volunteers_needed, 0) AS volunteers_needed,
                COALESCE(a.volunteers_pledged, 0) AS volunteers_pledged,
                a.created_at
         FROM activities a
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT $1`,
        [limit]
      ),
      safeRows(
        'stories',
        `SELECT s.id, s.title, COALESCE(s.location, '') AS location,
                COALESCE(s.before_photo_url, '') AS before_photo_url,
                COALESCE(s.after_photo_url, '') AS after_photo_url,
                COALESCE(s.kg_removed, 0) AS kg_removed,
                s.created_at
         FROM stories s
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT $1`,
        [limit]
      ),
      safeRows(
        'support requests',
        `SELECT r.id, COALESCE(r.kind::text, 'other') AS kind,
                COALESCE(r.item_label, '') AS item_label,
                COALESCE(r.qty_needed, 1) AS qty_needed,
                COALESCE(r.qty_fulfilled, 0) AS qty_fulfilled,
                COALESCE(a.location, l.location, p.service_area, '') AS location,
                COALESCE(r.contact_method, 'dropoff') AS contact_method,
                COALESCE(r.contact_value, '') AS contact_value,
                r.created_at
         FROM support_requests r
         LEFT JOIN activities a ON a.id = r.activity_id
         LEFT JOIN listings l ON l.id = r.listing_id
         LEFT JOIN disposer_profiles p ON p.id = r.disposer_id
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $1`,
        [limit]
      ),
    ]);

    const items = [
      ...listings.map((r) => ({
        kind: 'listing',
        id: Number(r.id),
        title: r.title || '',
        location: r.location || '',
        photo_url: r.photo_url || '',
        status: r.status || 'available',
        poster_name: r.poster_name || '',
        needs_disposer: Boolean(r.needs_disposer),
        created_at: toISO(r.created_at),
      })),
      ...activities.map((r) => ({
        kind: 'activity',
        id: Number(r.id),
        title: r.title || '',
        location: r.location || '',
        photo_url: r.photo_url || '',
        status: r.status || 'upcoming',
        needs_disposer: Boolean(r.needs_disposer),
        volunteers_needed: Number(r.volunteers_needed) || 0,
        volunteers_pledged: Number(r.volunteers_pledged) || 0,
        created_at: toISO(r.created_at),
      })),
      ...stories.map((r) => ({
        kind: 'story',
        id: Number(r.id),
        title: r.title || '',
        location: r.location || '',
        before_photo_url: r.before_photo_url || '',
        after_photo_url: r.after_photo_url || '',
        kg_removed: Number(r.kg_removed) || 0,
        created_at: toISO(r.created_at),
      })),
      ...support.map((r) => ({
        kind: 'support',
        id: Number(r.id),
        support_kind: r.kind || 'other',
        item_label: r.item_label || '',
        qty_needed: Number(r.qty_needed) || 0,
        qty_fulfilled: Number(r.qty_fulfilled) || 0,
        location: r.location || '',
        contact_method: r.contact_method || 'dropoff',
        contact_value: r.contact_value || '',
        created_at: toISO(r.created_at),
      })),
    ];

    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json(items.slice(0, limit));
  })
);

module.exports = router;
