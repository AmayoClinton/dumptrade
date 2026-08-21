'use strict';

/**
 * activities.js — community cleanup / collection events.
 *
 *   GET  /api/activities          ?location & ?status ('all' = no filter) & ?search
 *   GET  /api/activities/:id
 *   POST /api/activities          (auth)
 *   POST /api/activities/:id/pledge (auth)          — one pledge per user
 *   POST /api/activities/:id/status (auth, owner)   { status }
 */

const express = require('express');
const { sql } = require('../db');
const { authRequired } = require('../auth');
const { ACTIVITY_SELECT, mapActivity } = require('../mappers');
const { asyncRoute, parseId, str, toInt, toBool, toISO, body, errors } = require('../http');

const router = express.Router();

const STATUSES = new Set(['upcoming', 'active', 'completed']);

async function getActivity(id) {
  const { rows } = await sql.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ? mapActivity(rows[0]) : null;
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const location = str(req.query.location);
    const statusRaw = str(req.query.status);
    const status = statusRaw === 'all' ? '' : statusRaw;
    const search = str(req.query.search);

    const { rows } = await sql.query(
      `${ACTIVITY_SELECT}
       WHERE ($1::text = '' OR COALESCE(a.location, '') ILIKE '%' || $1::text || '%')
         AND ($2::text = '' OR a.status::text = $2::text)
         AND ($3::text = '' OR a.title ILIKE '%' || $3::text || '%'
                            OR COALESCE(a.description, '') ILIKE '%' || $3::text || '%')
       ORDER BY a.created_at DESC, a.id DESC`,
      [location, status, search]
    );

    return res.json(rows.map(mapActivity));
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid activity ID');

    const activity = await getActivity(id);
    if (!activity) return errors.notFound(res, 'Activity not found');
    return res.json(activity);
  })
);

router.post(
  '/',
  authRequired,
  asyncRoute(async (req, res) => {
    const input = body(req);
    const title = str(input.title);
    const location = str(input.location);
    if (!title) return errors.badRequest(res, 'title is required');
    if (!location) return errors.badRequest(res, 'location is required');

    const status = STATUSES.has(str(input.status)) ? str(input.status) : 'upcoming';
    const eventDate = toISO(input.event_date); // null when omitted/invalid

    const { rows } = await sql`
      INSERT INTO activities
        (user_id, title, description, photo_url, location, target_volume_label,
         target_kg, event_date, volunteers_needed, volunteers_pledged, status, needs_disposer)
      VALUES
        (${req.userID}, ${title}, ${str(input.description)}, ${str(input.photo_url)}, ${location},
         ${str(input.target_volume_label)}, ${toInt(input.target_kg)}, ${eventDate},
         ${Math.max(0, toInt(input.volunteers_needed))}, 0, ${status}, ${toBool(input.needs_disposer)})
      RETURNING id`;

    return res.status(201).json(await getActivity(rows[0].id));
  })
);

/** Insert one pledge per (activity, user); bump the pledged counter in step. */
router.post(
  '/:id/pledge',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid activity ID');

    const exists = await sql`SELECT id FROM activities WHERE id = ${id}`;
    if (!exists.rows.length) return errors.notFound(res, 'Activity not found');

    const inserted = await sql`
      INSERT INTO activity_pledges (activity_id, user_id)
      VALUES (${id}, ${req.userID})
      ON CONFLICT (activity_id, user_id) DO NOTHING
      RETURNING id`;

    if (!inserted.rows.length) {
      return errors.conflict(res, 'You have already pledged for this one.');
    }

    await sql`
      UPDATE activities SET volunteers_pledged = volunteers_pledged + 1 WHERE id = ${id}`;

    return res.json({ message: 'Pledged successfully' });
  })
);

/** Owner-only status change. */
router.post(
  '/:id/status',
  authRequired,
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid activity ID');

    const status = str(body(req).status);
    if (!status) return errors.badRequest(res, 'status is required');
    if (!STATUSES.has(status)) {
      return errors.badRequest(res, "status must be one of: upcoming, active, completed");
    }

    const found = await sql`SELECT user_id FROM activities WHERE id = ${id}`;
    if (!found.rows.length) return errors.notFound(res, 'Activity not found');
    if (Number(found.rows[0].user_id) !== req.userID) {
      return errors.forbidden(res, 'Only the activity owner can change its status');
    }

    await sql`UPDATE activities SET status = ${status} WHERE id = ${id}`;
    return res.json({ message: 'Activity status updated' });
  })
);

module.exports = router;
