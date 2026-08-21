'use strict';

/**
 * uploads.js — POST /api/uploads (multipart, form field "file").
 *
 * Returns { url } and nothing else is required: frontend/js/api.js
 * uploadPhoto() reads `res.url` and stores it as photo_url /
 * before_photo_url / after_photo_url.
 *
 * The file goes to Vercel Blob (public access), which needs the
 * BLOB_READ_WRITE_TOKEN environment variable. Vercel injects it automatically
 * once a Blob store is connected to the project; locally, `vercel env pull`
 * puts it in .env.local.
 *
 * Kept public, matching the previous backend's contract (photos are uploaded
 * before the auth-gated create call). Swap `optionalAuth` for `authRequired`
 * below if you would rather only signed-in users can write to the blob store.
 */

const express = require('express');
const busboy = require('busboy');
const { optionalAuth } = require('../auth');
const { asyncRoute, errors } = require('../http');

const router = express.Router();

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const FIELD_NAME = 'file';

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

/** Filesystem/URL-safe name, always with an extension. */
function safeName(filename, mimeType) {
  const base = String(filename || '')
    .split(/[\\/]/)
    .pop()
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);

  let name = base && base !== '.' && base !== '..' ? base : 'upload';
  if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) {
    name += EXTENSION_BY_MIME[String(mimeType).toLowerCase()] || '.bin';
  }
  return name;
}

/**
 * Reads the single uploaded file into memory.
 *
 * On Vercel the request body may already have been buffered onto req.body
 * before Express sees it, so busboy is fed the buffer when there is one and
 * the raw stream otherwise.
 */
function readUpload(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
    } catch (err) {
      reject(err);
      return;
    }

    let file = null;
    let tooLarge = false;

    bb.on('file', (fieldName, stream, info) => {
      if (file) {
        stream.resume(); // only the first file is used
        return;
      }
      const chunks = [];
      stream.on('limit', () => {
        tooLarge = true;
      });
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => {
        file = {
          fieldName,
          filename: info && info.filename,
          mimeType: (info && info.mimeType) || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on('error', reject);
    bb.on('close', () => resolve({ file, tooLarge }));

    const raw = req.body;
    if (Buffer.isBuffer(raw)) bb.end(raw);
    else if (typeof raw === 'string') bb.end(Buffer.from(raw));
    else req.pipe(bb);
  });
}

router.post(
  '/',
  optionalAuth,
  asyncRoute(async (req, res) => {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('multipart/')) {
      return errors.badRequest(
        res,
        `Expected a multipart/form-data upload with a "${FIELD_NAME}" field`
      );
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return res.status(500).json({
        error:
          'Uploads are not configured. Set BLOB_READ_WRITE_TOKEN (create a Vercel Blob store, then `vercel env pull .env.local` for local dev).',
      });
    }

    let parsed;
    try {
      parsed = await readUpload(req);
    } catch (err) {
      return errors.badRequest(res, `Could not read the upload: ${err.message}`);
    }

    if (parsed.tooLarge) {
      return res.status(413).json({ error: 'That file is too large (8MB maximum).' });
    }
    if (!parsed.file || !parsed.file.buffer.length) {
      return errors.badRequest(res, `No file uploaded (expected the "${FIELD_NAME}" field)`);
    }

    let put;
    try {
      ({ put } = require('@vercel/blob'));
    } catch (err) {
      return res.status(500).json({
        error: 'Upload support is unavailable: the @vercel/blob dependency is not installed.',
      });
    }

    const blob = await put(
      `uploads/${safeName(parsed.file.filename, parsed.file.mimeType)}`,
      parsed.file.buffer,
      {
        access: 'public',
        token,
        contentType: parsed.file.mimeType,
        addRandomSuffix: true,
      }
    );

    return res.status(201).json({
      url: blob.url,
      pathname: blob.pathname,
      content_type: parsed.file.mimeType,
    });
  })
);

module.exports = router;
