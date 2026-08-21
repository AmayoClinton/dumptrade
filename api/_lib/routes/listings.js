'use strict';

/**
 * listings.js — "dump material" listings.
 *
 *   GET    /api/listings            ?category & ?status ('all' = no filter) & ?search
 *   GET    /api/listings/:id
 *   POST   /api/listings            (auth)
 *   POST   /api/listings/:id/claim  (auth)  available -> claimed
 *   POST   /api/listings/:id/collect(auth)  claimed   -> collected
 */

const express = require('express');
const { sql } = require('../db');
const { authRequired } = require('../auth');
const { LISTING_SELECT, mapListing } = require('../mappers');
const { asyncRoute, parseId, str, toInt, toBool, body, errors } = require('../http');

const router = express.Router();

const CATEGORIES = new Set([
  'furniture', 'ewaste', 'textiles', 'construction',
  'organic', 'plastic', 'industrial', 'other',
]);

async function getListing(id) {
  const { rows } = await sql.query(`${LISTING_SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ? mapListing(rows[0]) : null;
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const category = str(req.query.category);
    const statusRaw = str(req.query.status);
    const status = statusRaw === 'all' ? '' : statusRaw;
    const search = str(req.query.search);

    // sql.query() parameterises exactly like the sql`` tag; it is used here
    // because the filters are optional. The ::text casts let Postgres infer the
    // parameter types in the `$n = ''` comparisons.
    const { rows } = await sql.query(
      `${LISTING_SELECT}
       WHERE ($1::text = '' OR l.category::text = $1::text)
         AND ($2::text = '' OR l.status::text = $2::text)
         AND ($3::text = '' OR l.title ILIKE '%' || $3::text || '%'
                            OR COALESCE(l.description, '') ILIKE '%' || $3::text || '%'
                            OR COALESCE(l.location, '') ILIKE '%' || $3::text || '%')
       ORDER BY l.created_at DESC, l.id DESC`,
      [category, status, search]
    );

    return res.json(rows.map(mapListing));
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid listing ID');

    const listing = await getListing(id);
    if (!listing) return errors.notFound(res, 'Listing not found');
    return res.json(listing);
  })
);

router.post(
  '/',
  authRequired,
  asyncRoute(async (req, res) => {
    const input = body(req);
    const title = str(input.title);
    const category = str(input.category) || 'other';
    const qtyLabel = str(input.qty_label);
    const location = str(input.location);

    if (!title) return errors.badRequest(res, 'title is required');
    if (!CATEGORIES.has(category)) {
      return errors.badRequest(
        res,
        'Invalid category. Must be one of: furniture, ewaste, textiles, construction, organic, plastic, industrial, other'
      );
    }
    if (!qtyLabel) return errors.badRequest(res, 'qty_label is required');
    if (!location) return errors.badRequest(res, 'location is required');

    const qtyNum = Math.max(1, toInt(input.qty_num, 1));

    const { rows } = await sql`
      INSERT INTO listings
        (user_id, title, category, description, photo_url, qty_label, qty_num,
         condition, location, status, needs_disposer, disposer_note)
      VALUES
        (${req.userID}, ${title}, ${category}, ${str(input.description)}, ${str(input.photo_url)},
         ${qtyLabel}, ${qtyNum}, ${str(input.condition)}, ${location}, 'available',
         ${toBool(input.needs_disposer)}, ${str(input.disposer_note)})
      RETURNING id`;

    const listing = await getListing(rows[0].id);
    return res.status(201).json(listing);
  })
);

/** available -> claimed. The conditional UPDATE makes the race atomic. */
router.post(
  '/:id/claim',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid listing ID');

    const { rows } = await sql`
      UPDATE listings SET status = 'claimed'
      WHERE id = ${id} AND status::text = 'available'
      RETURNING id`;

    if (!rows.length) {
      const current = await sql`SELECT status::text AS status FROM listings WHERE id = ${id}`;
      if (!current.rows.length) return errors.notFound(res, 'Listing not found');
      return errors.conflict(res, `Sorry — this listing is already ${current.rows[0].status}.`);
    }

    await sql`INSERT INTO claims (listing_id, claimant_id) VALUES (${id}, ${req.userID})`;

    return res.json({
      message: 'Listing claimed successfully',
      listing: await getListing(id),
    });
  })
);

/** claimed -> collected. */
router.post(
  '/:id/collect',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid listing ID');

    const { rows } = await sql`
      UPDATE listings SET status = 'collected'
      WHERE id = ${id} AND status::text = 'claimed'
      RETURNING id`;

    if (!rows.length) {
      const current = await sql`SELECT id FROM listings WHERE id = ${id}`;
      if (!current.rows.length) return errors.notFound(res, 'Listing not found');
      return errors.conflict(res, "This item isn't awaiting collection.");
    }

    await sql`
      UPDATE claims SET collected_at = now()
      WHERE listing_id = ${id} AND collected_at IS NULL`;

    return res.json({
      message: 'Listing marked as collected successfully',
      listing: await getListing(id),
    });
  })
);

module.exports = router;
