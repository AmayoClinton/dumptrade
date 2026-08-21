'use strict';

/**
 * support.js — the contact-based support / donation engine (no payments).
 * Mounted at /api so it can own both URL families.
 *
 *   GET  /api/support-requests               ?activity_id & ?disposer_id & ?listing_id & ?kind
 *   POST /api/support-requests               (auth) — exactly one parent id
 *   GET  /api/support-requests/:id/contact   (auth) — unlocks the contact details
 *   POST /api/support-requests/:id/pledge    (auth) — "I'll bring this"
 *   POST /api/support-pledges/:id/confirm    (auth, recipient) — confirms receipt
 */

const express = require('express');
const { sql } = require('../db');
const { authRequired } = require('../auth');
const { SUPPORT_SELECT, mapSupportRequest } = require('../mappers');
const { asyncRoute, parseId, optionalId, str, toInt, body, errors } = require('../http');

const router = express.Router();

const KINDS = new Set([
  'bins', 'bags', 'gloves', 'tools', 'meal', 'transport', 'labour', 'other',
]);
const CONTACT_METHODS = new Set(['call', 'whatsapp', 'dropoff']);

async function getRequest(id) {
  const { rows } = await sql.query(`${SUPPORT_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] ? mapSupportRequest(rows[0]) : null;
}

router.get(
  '/support-requests',
  asyncRoute(async (req, res) => {
    const activityID = optionalId(req.query.activity_id);
    const disposerID = optionalId(req.query.disposer_id);
    const listingID = optionalId(req.query.listing_id);
    const kind = str(req.query.kind);

    const { rows } = await sql.query(
      `${SUPPORT_SELECT}
       WHERE ($1::int IS NULL OR r.activity_id = $1::int)
         AND ($2::int IS NULL OR r.disposer_id = $2::int)
         AND ($3::int IS NULL OR r.listing_id = $3::int)
         AND ($4::text = '' OR r.kind::text = $4::text)
       ORDER BY r.created_at DESC, r.id DESC`,
      [activityID, disposerID, listingID, kind]
    );

    return res.json(rows.map(mapSupportRequest));
  })
);

router.post(
  '/support-requests',
  authRequired,
  asyncRoute(async (req, res) => {
    const input = body(req);
    const activityID = optionalId(input.activity_id);
    const disposerID = optionalId(input.disposer_id);
    const listingID = optionalId(input.listing_id);

    const parents = [activityID, disposerID, listingID].filter((v) => v !== null);
    if (parents.length !== 1) {
      return errors.badRequest(
        res,
        'exactly one of activity_id, disposer_id, listing_id must be set'
      );
    }

    const kind = str(input.kind) || 'other';
    if (!KINDS.has(kind)) {
      return errors.badRequest(
        res,
        'Invalid kind. Must be one of: bins, bags, gloves, tools, meal, transport, labour, other'
      );
    }

    const contactMethod = CONTACT_METHODS.has(str(input.contact_method))
      ? str(input.contact_method)
      : 'dropoff';
    const qtyNeeded = Math.max(1, toInt(input.qty_needed, 1));

    // Confirm the parent exists so a bad id is a 404 rather than an FK 500.
    const parentExists = activityID
      ? await sql`SELECT id FROM activities WHERE id = ${activityID}`
      : disposerID
        ? await sql`SELECT id FROM disposer_profiles WHERE id = ${disposerID}`
        : await sql`SELECT id FROM listings WHERE id = ${listingID}`;
    if (!parentExists.rows.length) {
      return errors.notFound(res, 'The activity, disposer or listing was not found');
    }

    const { rows } = await sql`
      INSERT INTO support_requests
        (activity_id, disposer_id, listing_id, kind, item_label, qty_needed,
         qty_fulfilled, contact_method, contact_value)
      VALUES
        (${activityID}, ${disposerID}, ${listingID}, ${kind}, ${str(input.item_label)},
         ${qtyNeeded}, 0, ${contactMethod}, ${str(input.contact_value)})
      RETURNING id`;

    return res.status(201).json(await getRequest(rows[0].id));
  })
);

/** The "Show contact" unlock: authenticated users only. */
router.get(
  '/support-requests/:id/contact',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid support request ID');

    const request = await getRequest(id);
    if (!request) return errors.notFound(res, 'Support request not found');

    return res.json({
      id: request.id,
      contact_method: request.contact_method,
      contact_value: request.contact_value,
    });
  })
);

/** "I'll bring this" — records the pledge; qty_fulfilled moves on confirm. */
router.post(
  '/support-requests/:id/pledge',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid support request ID');

    const exists = await sql`SELECT id FROM support_requests WHERE id = ${id}`;
    if (!exists.rows.length) return errors.notFound(res, 'Support request not found');

    const qty = Math.max(1, toInt(body(req).qty, 1));

    const { rows } = await sql`
      INSERT INTO support_pledges (support_request_id, supporter_id, qty, note, confirmed)
      VALUES (${id}, ${req.userID}, ${qty}, ${str(body(req).note)}, false)
      RETURNING id, support_request_id, supporter_id, qty, confirmed, pledged_at`;

    const pledge = rows[0];
    return res.status(201).json({
      message: 'Pledge recorded',
      id: Number(pledge.id),
      support_request_id: Number(pledge.support_request_id),
      supporter_id: Number(pledge.supporter_id),
      qty: Number(pledge.qty),
      confirmed: Boolean(pledge.confirmed),
      pledged_at: pledge.pledged_at,
    });
  })
);

/**
 * The recipient (owner of the parent activity / disposer profile / listing)
 * confirms receipt: the pledge is marked confirmed and the parent request's
 * qty_fulfilled goes up by the pledged quantity.
 */
router.post(
  '/support-pledges/:id/confirm',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid pledge ID');

    const found = await sql`
      SELECT p.id, p.support_request_id, p.qty, COALESCE(p.confirmed, false) AS confirmed,
             COALESCE(a.user_id, d.user_id, l.user_id) AS owner_id
      FROM support_pledges p
      JOIN support_requests r ON r.id = p.support_request_id
      LEFT JOIN activities a ON a.id = r.activity_id
      LEFT JOIN disposer_profiles d ON d.id = r.disposer_id
      LEFT JOIN listings l ON l.id = r.listing_id
      WHERE p.id = ${id}`;

    if (!found.rows.length) return errors.notFound(res, 'Pledge not found');

    const pledge = found.rows[0];
    if (pledge.confirmed) return errors.conflict(res, 'This pledge is already confirmed.');

    const ownerID = pledge.owner_id === null ? null : Number(pledge.owner_id);
    if (ownerID === null) {
      return errors.badRequest(res, 'This support request has no parent to confirm against');
    }
    if (ownerID !== req.userID) {
      return errors.forbidden(res, 'Only the recipient can confirm this pledge');
    }

    // confirmed = false in the WHERE clause keeps a double-click idempotent.
    const confirmed = await sql`
      UPDATE support_pledges SET confirmed = true, confirmed_at = now()
      WHERE id = ${id} AND COALESCE(confirmed, false) = false
      RETURNING qty`;

    if (!confirmed.rows.length) {
      return errors.conflict(res, 'This pledge is already confirmed.');
    }

    const qty = Math.max(1, Number(confirmed.rows[0].qty) || 1);
    const updated = await sql`
      UPDATE support_requests SET qty_fulfilled = COALESCE(qty_fulfilled, 0) + ${qty}
      WHERE id = ${pledge.support_request_id}
      RETURNING qty_fulfilled`;

    return res.json({
      message: 'Pledge confirmed',
      qty_fulfilled: updated.rows.length ? Number(updated.rows[0].qty_fulfilled) : null,
    });
  })
);

module.exports = router;
