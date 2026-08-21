'use strict';

/**
 * stories.js — before/after impact stories.
 *
 *   GET  /api/stories       ?location & ?search
 *   GET  /api/stories/:id
 *   POST /api/stories       (auth)
 */

const express = require('express');
const { sql } = require('../db');
const { authRequired } = require('../auth');
const { STORY_SELECT, mapStory } = require('../mappers');
const { asyncRoute, parseId, optionalId, str, toInt, body, errors } = require('../http');

const router = express.Router();

async function getStory(id) {
  const { rows } = await sql.query(`${STORY_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ? mapStory(rows[0]) : null;
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const location = str(req.query.location);
    const search = str(req.query.search);

    const { rows } = await sql.query(
      `${STORY_SELECT}
       WHERE ($1::text = '' OR COALESCE(s.location, '') ILIKE '%' || $1::text || '%')
         AND ($2::text = '' OR s.title ILIKE '%' || $2::text || '%'
                            OR COALESCE(s.caption, '') ILIKE '%' || $2::text || '%')
       ORDER BY s.created_at DESC, s.id DESC`,
      [location, search]
    );

    return res.json(rows.map(mapStory));
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return errors.badRequest(res, 'Invalid story ID');

    const story = await getStory(id);
    if (!story) return errors.notFound(res, 'Story not found');
    return res.json(story);
  })
);

router.post(
  '/',
  authRequired,
  asyncRoute(async (req, res) => {
    const input = body(req);
    const title = str(input.title);
    if (!title) return errors.badRequest(res, 'title is required');

    const activityID = optionalId(input.activity_id);
    const disposerUserID = optionalId(input.disposer_user_id);

    if (activityID) {
      const found = await sql`SELECT id FROM activities WHERE id = ${activityID}`;
      if (!found.rows.length) return errors.badRequest(res, 'activity_id does not exist');
    }
    if (disposerUserID) {
      const found = await sql`SELECT id FROM users WHERE id = ${disposerUserID}`;
      if (!found.rows.length) return errors.badRequest(res, 'disposer_user_id does not exist');
    }

    const { rows } = await sql`
      INSERT INTO stories
        (user_id, title, caption, before_photo_url, after_photo_url, location,
         kg_removed, activity_id, disposer_user_id)
      VALUES
        (${req.userID}, ${title}, ${str(input.caption)}, ${str(input.before_photo_url)},
         ${str(input.after_photo_url)}, ${str(input.location)}, ${Math.max(0, toInt(input.kg_removed))},
         ${activityID}, ${disposerUserID})
      RETURNING id`;

    return res.status(201).json(await getStory(rows[0].id));
  })
);

module.exports = router;
