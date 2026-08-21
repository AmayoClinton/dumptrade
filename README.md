# DumpTrade

DumpTrade is a peer-to-peer waste redistribution platform. People and organizations can post reusable materials, browse available listings, claim items, and mark completed collections. The goal is to keep usable waste out of dumpsites and burn sites.

## Features

- Email/password registration and JWT login
- Public listing browse, search, category, city, and status filters
- Authenticated listing creation
- Image upload for PNG, JPG, GIF, and WebP files up to 5 MB
- Listing lifecycle: `available -> claimed -> collected`
- Authorization rules: only signed-in users can post or claim; only a listing's poster or claimant can mark it collected
- PostgreSQL-backed listings with pagination limits and indexes

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Go, Gin
- Database: PostgreSQL / Neon-compatible Postgres
- Authentication: JWT
- Images: local static storage in `frontend/uploads/`

## Run Locally

1. Create `backend/.env` from `backend/.env.example`.
2. Set a valid PostgreSQL `DATABASE_URL` and a strong `JWT_SECRET`.
3. Start the backend from the `backend` directory:

```powershell
go run .
```

Open http://127.0.0.1:8080 in your browser.

For an already initialized production database, set these variables to avoid startup migration and demo-data work:

```env
RUN_MIGRATIONS=false
SEED_DEMO_DATA=false
```

## Main API Endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Public | Create an account |
| `POST` | `/api/login` | Public | Sign in and receive a JWT |
| `GET` | `/api/listings` | Public | Browse listings |
| `GET` | `/api/listings/:id` | Public | View one listing |
| `POST` | `/api/uploads` | Signed in | Upload a listing image |
| `POST` | `/api/listings` | Signed in | Create a listing |
| `POST` | `/api/listings/:id/claim` | Signed in | Claim a listing |
| `POST` | `/api/listings/:id/collect` | Signed in | Mark a claimed listing collected |

Protected endpoints require:

```http
Authorization: Bearer <token>
```

The listing endpoint accepts `category`, `status`, `search`, `city`, `limit`, and `offset` query parameters. `limit` defaults to 24 and is capped at 100.

## Tests

Run the backend test suite from `backend/`:

```powershell
go test ./...
go vet ./...
```

## Image Storage Note

Images are saved locally to `frontend/uploads/` so the app works immediately in local development. For a multi-instance or persistent production deployment, replace this with object storage such as Cloudinary, S3, or another managed file store.
