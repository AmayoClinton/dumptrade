'use strict';

/**
 * verify.js — POST /api/verifications.
 *
 * A poster credits a disposer for a cleared listing or activity. The
 * verification row is the audit trail; the disposer's public counters
 * (cleanups_completed, kg_diverted) are incremented in the same request.
 */

const express = require('express');
const { sql } = require('../db');
const { authRequired } = require('../auth');
const { mapVerification } = require('../mappers');
const { asyncRoute, optionalId, str, toInt, body, errors } = require('../http');

const router = express.Router();

router.post(
  '/',
  authRequired,
  asyncRoute(async (req, res) => {
    const input = body(req);
    const disposerUserID = optionalId(input.disposer_user_id);
    const activityID = optionalId(input.activity_id);
    const listingID = optionalId(input.listing_id);

    if (!disposerUserID) return errors.badRequest(res, 'disposer_user_id is required');

    const parents = [activityID, listingID].filter((v) => v !== null);
    if (parents.length !== 1) {
      return errors.badRequest(res, 'exactly one of activity_id or listing_id must be set');
    }

    const disposerUser = await sql`SELECT id FROM users WHERE id = ${disposerUserID}`;
    if (!disposerUser.rows.length) return errors.notFound(res, 'Disposer user not found');

    const parentExists = activityID
      ? await sql`SELECT id FROM activities WHERE id = ${activityID}`
      : await sql`SELECT id FROM listings WHERE id = ${listingID}`;
    if (!parentExists.rows.length) {
      return errors.notFound(res, activityID ? 'Activity not found' : 'Listing not found');
    }

    const kg = Math.max(0, toInt(input.kg_diverted));

    const { rows } = await sql`
      INSERT INTO verifications
        (disposer_user_id, verifier_user_id, activity_id, listing_id, kg_diverted, note)
      VALUES
        (${disposerUserID}, ${req.userID}, ${activityID}, ${listingID}, ${kg}, ${str(input.note)})
      RETURNING id, disposer_user_id, verifier_user_id, activity_id, listing_id,
                kg_diverted, note, verified_at`;

    // Credit the disposer's track record (no-op when they have no profile yet).
    const counters = await sql`
      UPDATE disposer_profiles
      SET cleanups_completed = COALESCE(cleanups_completed, 0) + 1,
          kg_diverted        = COALESCE(kg_diverted, 0) + ${kg}
      WHERE user_id = ${disposerUserID}
      RETURNING cleanups_completed, kg_diverted`;

    const payload = mapVerification(rows[0]);
    if (counters.rows.length) {
      payload.disposer_cleanups_completed = Number(counters.rows[0].cleanups_completed);
      payload.disposer_kg_diverted = Number(counters.rows[0].kg_diverted);
    }

    return res.status(201).json(payload);
  })
);

module.exports = router;
