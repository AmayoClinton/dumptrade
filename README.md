# DumpTrade

Give what you don't need. Take what you do. DumpTrade connects households,
workshops and industries so unwanted material finds its next use instead of a
dumpsite or a fire — and it gives the people who clear waste a public,
verifiable track record.

This repo is a Go (Gin) + Postgres backend with a no-build vanilla
HTML/CSS/JS frontend. The frontend talks to the backend over `fetch`-style
calls in `frontend/js/api.js`; when the backend is unreachable it falls back
to an in-browser mock so the site still demos offline.

## Project layout

```
backend/
  main.go                 # router, static files, route wiring
  models/                 # User, Listing, Claim, + engagement types
  handlers/               # auth, listings, activities, stories, disposers,
                           #   support, verify, uploads + postgres stores
  db/                     # connection pool, idempotent migrations, seeding
  middleware/             # JWT auth
frontend/
  index.html  browse.html  post.html  listing.html
  login.html  register.html
  become-disposer.html  disposer.html  activity.html  story.html
  css/styles.css          # existing design system (do not edit)
  css/engagement.css      # additive styles for new features
  js/api.js               # backend-or-mock data layer
  js/listings.js          # card/detail renderers (shared)
  js/browse-engagement.js js/post-types.js js/feed.js
  js/disposer-directory.js js/disposer.js js/become-disposer.js
  js/support.js js/verify.js js/catalogue.js js/claim.js js/post.js js/auth.js
  assets/uploads/         # user-uploaded images (gitignored)
Project.Rmd              # original project overview / hackathon plan
```

## Run it

### Backend
1. Set `DATABASE_URL` (a Postgres/Neon connection string) in `backend/.env`.
2. From `backend/`: `go run .` (or `go build ./...`). Migrations and seed
   data are applied automatically on startup. Serves on `:8080` (override with
   `PORT`).
3. The API is mounted under `/api`. Frontend static files are served from the
   backend root (e.g. `/browse.html`), so you can open the app directly at
   `http://localhost:8080/`.

### Frontend only (no DB)
Open any `frontend/*.html` via a static server (e.g. `python3 -m http.server`
from `frontend/`). With no backend reachable, `api.js` serves seed data from
memory so every screen still renders.

### Auth
Register/login through the UI. The JWT is stored in `localStorage` and sent as
`Authorization: Bearer <token>`. Posting, claiming, pledging, creating
activities/stories/disposers/support, and verifying all require a logged-in
user; anonymous actions show a "Please log in first." prompt.

## Features

- **Post an item / Dump material** — photo, title, category, quantity,
  condition, location. Now also a "Needs a disposer" toggle + note, so a
  listing can ask for someone to haul it, not just claim it.
- **Browse** — a segmented control switches between:
  - *Dump material* (existing search/filter/chip grid, unchanged)
  - *Activities* (cleanup campaigns with a pledge progress bar + "Donate
    supplies" contact sheet)
  - *Impact stories* (before/after photo cards with estimated kg removed)
  - *Waste catalogue* (static, reference-only: biodegradable vs
    non-biodegradable, upcycling alternatives, hazard routing)
  - *Disposers* (directory of worker profiles + a "Become a disposer" card)
- **Community feed** — folded into the Home page (`index.html`) as a new
  `04 — THE FEED` section. Mixed, capped stream of claims, cleanups, impact
  stories and support asks. This is NOT a new navbar tab; the navbar (Home /
  Browse / Post an item) is unchanged.
- **Disposer engine** — any user can "Become a disposer" (its own page, not in
  the navbar). A disposer gets a public profile with a verified track record
  (cleanups verified, kg diverted, community vouches). "Mark verified cleared"
  (poster-only) credits a disposer and increments their counters.
- **Support / donation engine** — contact-based only, no payments. An activity
  or disposer can post a support ask (bins, bags, gloves, tools, meal,
  transport, labour). "Show contact" unlocks the organizer's contact method;
  "I'll bring this" pledges; the recipient confirms receipt and the progress
  bar updates.
- **Image uploads** — `POST /api/uploads` stores to `frontend/assets/uploads/`
  and returns a path used for activity/story/before-after photos.

## API

All JSON. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | – | liveness |
| POST | `/api/register` | – | `{name, email, password, account_type}` |
| POST | `/api/login` | – | returns `{token, user}` |
| GET | `/api/listings` | – | `?category&status&search` |
| GET | `/api/listings/:id` | – | |
| POST | `/api/listings` | ✓ | includes `needs_disposer`, `disposer_note` |
| POST | `/api/listings/:id/claim` | ✓ | |
| POST | `/api/listings/:id/collect` | ✓ | |
| GET | `/api/activities` | – | `?location&status&search` |
| GET | `/api/activities/:id` | – | |
| POST | `/api/activities` | ✓ | |
| POST | `/api/activities/:id/pledge` | ✓ | |
| POST | `/api/activities/:id/status` | ✓ (owner) | |
| GET | `/api/stories` | – | `?location&search` |
| GET | `/api/stories/:id` | – | |
| POST | `/api/stories` | ✓ | |
| GET | `/api/disposers` | – | `?sort=kg\|cleanups\|vouches` |
| GET | `/api/disposers/:id` | – | |
| POST | `/api/disposers` | ✓ | upsert on `user_id` |
| POST | `/api/disposers/:id/vouch` | ✓ | |
| GET | `/api/support-requests` | – | |
| POST | `/api/support-requests` | ✓ | one parent: `activity_id`/`disposer_id`/`listing_id` |
| GET | `/api/support-requests/:id/contact` | ✓ | unlocks contact |
| POST | `/api/support-requests/:id/pledge` | ✓ | |
| POST | `/api/support-pledges/:id/confirm` | ✓ (recipient) | |
| POST | `/api/verifications` | ✓ | credits a disposer |
| GET | `/api/feed` | – | `?limit=` merged feed |
| POST | `/api/uploads` | – | multipart `file` → `/assets/uploads/...` |

## Data model (additive)

Existing `users`, `listings`, `claims` are unchanged in shape. New tables:
`disposer_profiles`, `activities`, `activity_pledges`, `stories`,
`support_requests`, `support_pledges`, `verifications`, `vouches`. The
`listings` table gained two nullable columns: `needs_disposer` (bool) and
`disposer_note` (text). All migrations are idempotent (`CREATE ... IF NOT
EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) and run from
`db.Migrate()` + `db.MigrateEngagement()` on startup.

## Notes for contributors

- `frontend/css/styles.css` is the shared design system — add new styles to
  `frontend/css/engagement.css`, never edit `styles.css`.
- The navbar, the `index.html` hero (including its image), and existing section
  copy are intentionally frozen. New features extend, they do not reimagine.
- `frontend/js/api.js` is the single data boundary. Keep function names stable;
  pages depend on them being synchronous.
