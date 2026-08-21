'use strict';

/**
 * db.js — the @vercel/postgres client plus a once-per-instance schema gate.
 *
 * `sql` is lazy: requiring it never opens a connection, so this module can be
 * loaded without POSTGRES_URL being set (handy for `node --check` / local
 * smoke tests). The first query is what fails, and index.js turns that into a
 * clear 503 instead of crashing the function.
 */

// Convenience: accept the older DATABASE_URL name (the Go backend used it) and
// Vercel's non-pooling variant, so a single connection string is enough.
if (!process.env.POSTGRES_URL) {
  const fallback = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (fallback) process.env.POSTGRES_URL = fallback;
}

const { sql } = require('@vercel/postgres');
const { ensureSchema } = require('./schema');

let schemaPromise = null;

/**
 * Runs ensureSchema() at most once per serverless instance. On failure the
 * cached promise is cleared so the next request can retry (e.g. after the
 * database wakes up), instead of poisoning the instance forever.
 */
function getSchemaReady() {
  if (!schemaPromise) {
    schemaPromise = ensureSchema().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

function hasDatabaseUrl() {
  return Boolean(process.env.POSTGRES_URL);
}

module.exports = { sql, getSchemaReady, hasDatabaseUrl };
