'use strict';

/** http.js — small request/response helpers shared by every route module. */

/** Wraps an async handler so rejections reach the Express error handler. */
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Positive integer route/query param, or null when unusable. */
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Trimmed string, '' for anything missing. */
function str(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = str(value).toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

/** Nullable positive int (for optional parent ids in request bodies). */
function optionalId(value) {
  if (value === undefined || value === null || value === '') return null;
  return parseId(value);
}

/** ISO-8601 string, or null when the value is missing/unparseable. */
function toISO(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

const errors = {
  badRequest: (res, error) => res.status(400).json({ error }),
  unauthorized: (res, error = 'Authentication required') => res.status(401).json({ error }),
  forbidden: (res, error) => res.status(403).json({ error }),
  notFound: (res, error) => res.status(404).json({ error }),
  conflict: (res, error) => res.status(409).json({ error }),
};

module.exports = {
  asyncRoute,
  parseId,
  optionalId,
  str,
  toInt,
  toBool,
  toISO,
  body,
  errors,
};
