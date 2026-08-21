'use strict';

/**
 * disposers.js — public disposer profiles and their track record.
 *
 *   GET  /api/disposers            ?sort=kg|cleanups|vouches
 *   GET  /api/disposers/:id
 *   POST /api/disposers            (auth) — upsert on user_id
 *   POST /api/disposers/:id/vouch  (auth) — one vouch per user
 */

const express = require('express');
const { sql } = require('../db');
const { authRequired } = require('../auth');
const { DISPOSER_SELECT, mapDisposer } = require('../mappers');
const { asyncRoute, parseId, str, toBool, body, errors } = require('../http');

const router = express.Router();

// Whitelisted so the sort key can never be interpolated user input.
const SORTS = {
  kg: 'p.kg_diverted DESC',
  cleanups: 'p.cleanups_completed DESC',
  vouches: 'p.vouch_count DESC',
  created: 'p.created_at DESC',
};

const CONTACT_METHODS = new Set(['call', 'whatsapp', 'dropoff']);

async function getDisposer(id) {
  const { rows } = await sql.query(`${DISPOSER_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ? mapDisposer(rows[0]) : null;
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const orderBy = SORTS[str(req.query.sort)] || SORTS.created;
    const { rows } = await sql.query(`${DISPOSER_SELECT} ORDER BY ${orderBy}, p.id DESC`);
    return res.json(rows.map(mapDisposer));
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid disposer ID');

    const disposer = await getDisposer(id);
    if (!disposer) return errors.notFound(res, 'Disposer not found');
    return res.json(disposer);
  })
);

/** One profile per user: re-posting updates the existing profile. */
router.post(
  '/',
  authRequired,
  asyncRoute(async (req, res) => {
    const input = body(req);
    const serviceArea = str(input.service_area);
    const contactValue = str(input.contact_value);
    const contactMethod = CONTACT_METHODS.has(str(input.contact_method))
      ? str(input.contact_method)
      : 'call';
    const available = input.available === undefined ? true : toBool(input.available);

    if (!serviceArea) return errors.badRequest(res, 'service_area is required');
    if (!contactValue) return errors.badRequest(res, 'contact_value is required');

    const { rows } = await sql`
      INSERT INTO disposer_profiles
        (user_id, service_area, contact_method, contact_value, bio, available)
      VALUES
        (${req.userID}, ${serviceArea}, ${contactMethod}, ${contactValue}, ${str(input.bio)}, ${available})
      ON CONFLICT (user_id) DO UPDATE SET
        service_area   = EXCLUDED.service_area,
        contact_method = EXCLUDED.contact_method,
        contact_value  = EXCLUDED.contact_value,
        bio            = EXCLUDED.bio,
        available      = EXCLUDED.available
      RETURNING id`;

    return res.status(201).json(await getDisposer(rows[0].id));
  })
);

/** Community vouch — one per (disposer, voucher). */
router.post(
  '/:id/vouch',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid disposer ID');

    const found = await sql`
      SELECT user_id, COALESCE(vouch_count, 0) AS vouch_count
      FROM disposer_profiles WHERE id = ${id}`;
    if (!found.rows.length) return errors.notFound(res, 'Disposer not found');

    const disposerUserID = Number(found.rows[0].user_id);

    const inserted = await sql`
      INSERT INTO vouches (disposer_user_id, voucher_user_id)
      VALUES (${disposerUserID}, ${req.userID})
      ON CONFLICT (disposer_user_id, voucher_user_id) DO NOTHING
      RETURNING id`;

    if (!inserted.rows.length) {
      return res.status(409).json({
        error: 'You have already vouched for this disposer.',
        vouch_count: Number(found.rows[0].vouch_count),
      });
    }

    const updated = await sql`
      UPDATE disposer_profiles SET vouch_count = COALESCE(vouch_count, 0) + 1
      WHERE user_id = ${disposerUserID}
      RETURNING vouch_count`;

    return res.json({
      message: 'Vouch recorded',
      vouch_count: updated.rows.length
        ? Number(updated.rows[0].vouch_count)
        : Number(found.rows[0].vouch_count) + 1,
    });
  })
);

module.exports = router;
