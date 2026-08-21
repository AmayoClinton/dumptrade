'use strict';

/**
 * auth.js — HS256 JWTs (same claim shape as the previous Go backend, so old
 * tokens in localStorage keep working when JWT_SECRET is unchanged) plus
 * bcryptjs password hashing (pure JS: no native build step on Vercel).
 *
 * Claims: { sub: <user id>, email, account_type, iat, exp }
 * Header the frontend sends: `Authorization: Bearer <token>`
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const TOKEN_TTL = '7d';
const BCRYPT_ROUNDS = 10;

function secret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, account_type: user.account_type },
    secret(),
    { algorithm: 'HS256', expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, secret(), { algorithms: ['HS256'] });
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), String(hash));
}

/** Pulls the bearer token out of the Authorization header. */
function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header) return { error: 'Authorization header is required' };

  const parts = String(header).split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return { error: 'Authorization header format must be Bearer {token}' };
  }
  return { token: parts[1] };
}

function applyClaims(req, claims) {
  const userID = Number(claims.sub);
  if (!Number.isInteger(userID) || userID <= 0) return false;

  req.userID = userID;
  req.email = typeof claims.email === 'string' ? claims.email : '';
  req.accountType = typeof claims.account_type === 'string' ? claims.account_type : '';
  return true;
}

/** 401s unless a valid token is present; sets req.userID/email/accountType. */
function authRequired(req, res, next) {
  const { token, error } = bearerToken(req);
  if (error) return res.status(401).json({ error });

  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!applyClaims(req, claims)) {
    return res.status(401).json({ error: 'Invalid user ID in token' });
  }
  return next();
}

/** Never fails: fills req.userID when a valid token happens to be present. */
function optionalAuth(req, res, next) {
  const { token } = bearerToken(req);
  if (token) {
    try {
      applyClaims(req, verifyToken(token));
    } catch (err) {
      /* anonymous request — ignore */
    }
  }
  return next();
}

module.exports = {
  authRequired,
  optionalAuth,
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  TOKEN_TTL,
};
