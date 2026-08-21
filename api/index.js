'use strict';

/**
 * Dump Trade API — Express on Vercel.
 *
 * This is the only file under api/ that Vercel turns into a Function: every
 * request matching /api/* is rewritten here by vercel.json, and Express routes
 * it from there. The shared code lives in api/_lib/**, and Vercel skips
 * underscore-prefixed paths when detecting Functions, so the whole API ships as
 * one bundled Function instead of one Function per file.
 *
 * Local dev: `npm start` also serves ../frontend statically on :8080, so the
 * app behaves exactly like the deployment (same-origin /api/*).
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

// .env / .env.local for local runs; on Vercel the env vars are already present.
try {
  const dotenv = require('dotenv');
  for (const file of ['.env.local', '.env']) {
    const full = path.join(__dirname, '..', file);
    if (fs.existsSync(full)) dotenv.config({ path: full });
  }
} catch (err) {
  /* dotenv is optional at runtime */
}

const { getSchemaReady, hasDatabaseUrl } = require('./_lib/db');

const usersRoutes = require('./_lib/routes/users');
const listingsRoutes = require('./_lib/routes/listings');
const activitiesRoutes = require('./_lib/routes/activities');
const storiesRoutes = require('./_lib/routes/stories');
const disposersRoutes = require('./_lib/routes/disposers');
const supportRoutes = require('./_lib/routes/support');
const verifyRoutes = require('./_lib/routes/verify');
const feedRoutes = require('./_lib/routes/feed');
const uploadsRoutes = require('./_lib/routes/uploads');

const app = express();
app.disable('x-powered-by');
app.set('etag', false);

/* ---------------------------------------------------------------- CORS ----
   Same-origin on Vercel (the frontend is served from the same domain), so this
   is only really needed when the frontend runs on another port locally. */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

/* ------------------------------------------------------- Body handling ----
   Vercel may hand Express a body it already buffered (Buffer) or parsed
   (object). express.json() would then read an empty, already-consumed stream,
   so those two cases are handled before falling back to the normal parser.
   Multipart is left untouched for busboy in routes/uploads.js. */
const jsonParser = express.json({ limit: '2mb' });

app.use((req, res, next) => {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.startsWith('multipart/')) return next();

  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8').trim();
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    req._body = true;
    return next();
  }

  if (req.body && typeof req.body === 'object') {
    req._body = true;
    return next();
  }

  return jsonParser(req, res, next);
});

/* --------------------------------------------------------------- Health ----
   Deliberately before the schema gate and free of database access:
   frontend/js/api.js pings this once per page load to decide whether to use
   the backend or its offline mock. */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'dumptrade-api' });
});

// Uploads talk to Vercel Blob only — no schema needed.
app.use('/api/uploads', uploadsRoutes);

/* ---------------------------------------------------------- Schema gate ----
   Lazily runs the idempotent DDL + seed once per serverless instance (the
   promise is cached in _lib/db.js), before any query-backed route. */
app.use('/api', (req, res, next) => {
  getSchemaReady().then(
    () => next(),
    (err) => {
      console.error('[dumptrade] database unavailable:', err.message);
      res.status(503).json({
        error: hasDatabaseUrl()
          ? 'The database is unavailable right now. Please try again shortly.'
          : 'The database is not configured. Set POSTGRES_URL (link a Vercel Postgres store, then `vercel env pull .env.local` for local dev).',
      });
    }
  );
});

/* --------------------------------------------------------------- Routes ---- */
app.use('/api', usersRoutes); // /api/register, /api/login
app.use('/api/listings', listingsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/disposers', disposersRoutes);
app.use('/api', supportRoutes); // /api/support-requests*, /api/support-pledges/:id/confirm
app.use('/api/verifications', verifyRoutes);
app.use('/api/feed', feedRoutes);

// Unknown API paths must answer JSON, never the static site's HTML.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

/* ------------------------------------------- Static frontend (local dev) ---
   On Vercel these paths never reach the Function (vercel.json rewrites them to
   /frontend/*); this block just makes `npm start` a complete local server. */
const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir, { extensions: ['html'] }));
}

/* -------------------------------------------------------- Error handling ---
   Always JSON: the frontend reads data.error || data.message. */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  console.error('[dumptrade] unhandled error:', err && (err.stack || err.message || err));
  return res.status(500).json({
    error: (err && err.message) || 'Internal server error',
  });
});

/* Run directly (`npm start` / `npm run dev`); Vercel imports the app instead. */
if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  app.listen(port, () => {
    console.log(`[dumptrade] api listening on http://localhost:${port}`);
    if (!hasDatabaseUrl()) {
      console.warn(
        '[dumptrade] POSTGRES_URL is not set — database routes will answer 503 until it is.'
      );
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.warn(
        '[dumptrade] BLOB_READ_WRITE_TOKEN is not set — POST /api/uploads will answer 500 until it is.'
      );
    }
  });
}

module.exports = app;
module.exports.default = app;
