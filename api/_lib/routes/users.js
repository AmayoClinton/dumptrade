'use strict';

/**
 * users.js — POST /api/register, POST /api/login.
 *
 * Both return { token, user }: frontend/js/auth.js stores the token in
 * localStorage under `dumptrade_token` and the user under `dumptrade_user`.
 */

const express = require('express');
const { sql } = require('../db');
const { signToken, hashPassword, verifyPassword } = require('../auth');
const { USER_SELECT, mapUser } = require('../mappers');
const { asyncRoute, str, body, errors } = require('../http');

const router = express.Router();

const ACCOUNT_TYPES = new Set(['individual', 'organization']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findByEmail(email) {
  const { rows } = await sql.query(`${USER_SELECT} WHERE lower(u.email) = lower($1)`, [email]);
  return rows[0] || null;
}

router.post(
  '/register',
  asyncRoute(async (req, res) => {
    const input = body(req);
    const name = str(input.name);
    const email = str(input.email).toLowerCase();
    const password = String(input.password || '');
    const accountType = str(input.account_type) || 'individual';
    const location = str(input.location);

    if (!name) return errors.badRequest(res, 'name is required');
    if (!EMAIL_RE.test(email)) return errors.badRequest(res, 'a valid email is required');
    if (password.length < 6) return errors.badRequest(res, 'password must be at least 6 characters');
    if (!ACCOUNT_TYPES.has(accountType)) {
      return errors.badRequest(res, "account_type must be 'individual' or 'organization'");
    }

    if (await findByEmail(email)) {
      return errors.conflict(res, 'Email already registered');
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await sql`
      INSERT INTO users (name, email, password_hash, account_type, location)
      VALUES (${name}, ${email}, ${passwordHash}, ${accountType}, ${location})
      ON CONFLICT (email) DO NOTHING
      RETURNING id, name, email, account_type, location, created_at`;

    if (!rows.length) return errors.conflict(res, 'Email already registered');

    const user = mapUser(rows[0]);
    return res.status(201).json({
      message: 'User registered successfully',
      token: signToken(user),
      user,
    });
  })
);

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const input = body(req);
    const email = str(input.email).toLowerCase();
    const password = String(input.password || '');

    if (!email || !password) {
      return errors.badRequest(res, 'email and password are required');
    }

    const row = await findByEmail(email);
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return errors.unauthorized(res, 'Invalid email or password');
    }

    const user = mapUser(row);
    return res.json({ token: signToken(user), user });
  })
);

module.exports = router;
