'use strict';

/**
 * schema.js — the whole database contract in one place.
 *
 * ensureSchema() is idempotent: every statement is CREATE ... IF NOT EXISTS or
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS, and the seed is guarded by row
 * counts. It is safe to run on every cold start (db.js caches the promise so it
 * runs at most once per serverless instance).
 *
 * Notes
 * - Enum-like columns are plain TEXT so the DDL stays idempotent and portable.
 * - The ALTER statements exist so a database created by the older Go backend
 *   (which used native Postgres ENUM types) keeps working: reads always cast
 *   with `::text`, and the extra columns are added if they are missing.
 * - @vercel/postgres talks to Postgres over HTTP, which allows a single
 *   statement per round trip — hence one `sql.query()` call per statement.
 */

const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     account_type TEXT DEFAULT 'individual',
     location TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS listings (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     category TEXT,
     description TEXT,
     photo_url TEXT,
     qty_label TEXT,
     qty_num INTEGER DEFAULT 1,
     condition TEXT,
     location TEXT,
     status TEXT DEFAULT 'available',
     needs_disposer BOOLEAN DEFAULT false,
     disposer_note TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,

  // Kept from the original schema so a claim records *who* claimed it.
  `CREATE TABLE IF NOT EXISTS claims (
     id SERIAL PRIMARY KEY,
     listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
     claimant_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     claimed_at TIMESTAMPTZ DEFAULT now(),
     collected_at TIMESTAMPTZ
   )`,

  `CREATE TABLE IF NOT EXISTS disposer_profiles (
     id SERIAL PRIMARY KEY,
     user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     service_area TEXT,
     contact_method TEXT,
     contact_value TEXT,
     bio TEXT,
     available BOOLEAN DEFAULT true,
     cleanups_completed INTEGER DEFAULT 0,
     kg_diverted INTEGER DEFAULT 0,
     vouch_count INTEGER DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS activities (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     description TEXT,
     photo_url TEXT,
     location TEXT,
     target_volume_label TEXT,
     target_kg INTEGER DEFAULT 0,
     event_date TIMESTAMPTZ,
     volunteers_needed INTEGER DEFAULT 0,
     volunteers_pledged INTEGER DEFAULT 0,
     status TEXT DEFAULT 'upcoming',
     needs_disposer BOOLEAN DEFAULT false,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS activity_pledges (
     id SERIAL PRIMARY KEY,
     activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     pledged_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE (activity_id, user_id)
   )`,

  `CREATE TABLE IF NOT EXISTS stories (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     caption TEXT,
     before_photo_url TEXT,
     after_photo_url TEXT,
     location TEXT,
     kg_removed INTEGER DEFAULT 0,
     activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
     disposer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS support_requests (
     id SERIAL PRIMARY KEY,
     activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
     disposer_id INTEGER REFERENCES disposer_profiles(id) ON DELETE CASCADE,
     listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
     kind TEXT,
     item_label TEXT,
     qty_needed INTEGER DEFAULT 1,
     qty_fulfilled INTEGER DEFAULT 0,
     contact_method TEXT,
     contact_value TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS support_pledges (
     id SERIAL PRIMARY KEY,
     support_request_id INTEGER REFERENCES support_requests(id) ON DELETE CASCADE,
     supporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     qty INTEGER DEFAULT 1,
     note TEXT,
     confirmed BOOLEAN DEFAULT false,
     pledged_at TIMESTAMPTZ DEFAULT now(),
     confirmed_at TIMESTAMPTZ
   )`,

  `CREATE TABLE IF NOT EXISTS verifications (
     id SERIAL PRIMARY KEY,
     disposer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     verifier_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
     listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
     kg_diverted INTEGER DEFAULT 0,
     note TEXT,
     verified_at TIMESTAMPTZ DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS vouches (
     id SERIAL PRIMARY KEY,
     disposer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     voucher_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     note TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE (disposer_user_id, voucher_user_id)
   )`,
];

// Additive columns: harmless on a fresh database, required when the database
// was first created by the older Go backend.
const COLUMNS = [
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS needs_disposer BOOLEAN DEFAULT false`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS disposer_note TEXT`,
  `ALTER TABLE activities ADD COLUMN IF NOT EXISTS needs_disposer BOOLEAN DEFAULT false`,
  `ALTER TABLE activities ADD COLUMN IF NOT EXISTS target_volume_label TEXT`,
  `ALTER TABLE stories ADD COLUMN IF NOT EXISTS activity_id INTEGER`,
  `ALTER TABLE stories ADD COLUMN IF NOT EXISTS disposer_user_id INTEGER`,
  `ALTER TABLE support_pledges ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_listing_id ON claims(listing_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_requests_activity ON support_requests(activity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_support_requests_disposer ON support_requests(disposer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_support_requests_listing ON support_requests(listing_id)`,
  `CREATE INDEX IF NOT EXISTS idx_support_pledges_request ON support_pledges(support_request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_verifications_disposer ON verifications(disposer_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vouches_disposer ON vouches(disposer_user_id)`,
  // Safety nets for the ON CONFLICT targets used by the routes, in case the
  // tables were created elsewhere without the inline UNIQUE constraints.
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_disposer_profiles_user_id ON disposer_profiles(user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_activity_pledges_activity_user ON activity_pledges(activity_id, user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_vouches_disposer_voucher ON vouches(disposer_user_id, voucher_user_id)`,
];

const DEMO_PASSWORD = 'password123';

async function run(statements) {
  for (const statement of statements) {
    await sql.query(statement);
  }
}

async function count(table) {
  const { rows } = await sql.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0] ? Number(rows[0].n) : 0;
}

/** Two demo accounts the seed data hangs off; falls back to the oldest users. */
async function demoUsers() {
  const byEmail = await sql`
    SELECT id, email FROM users
    WHERE email IN ('amina@example.com', 'zawadi@example.com')`;

  let amina = byEmail.rows.find((r) => r.email === 'amina@example.com');
  let zawadi = byEmail.rows.find((r) => r.email === 'zawadi@example.com');

  if (!amina || !zawadi) {
    const oldest = await sql`SELECT id FROM users ORDER BY id ASC LIMIT 2`;
    if (!oldest.rows.length) return null;
    amina = amina || oldest.rows[0];
    zawadi = zawadi || oldest.rows[1] || oldest.rows[0];
  }
  return { aminaID: amina.id, zawadiID: zawadi.id };
}

async function seedUsers() {
  if ((await count('users')) > 0) return;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await sql`
    INSERT INTO users (name, email, password_hash, account_type, location)
    VALUES ('Amina O.', 'amina@example.com', ${hash}, 'individual', 'Kisumu, Milimani')
    ON CONFLICT (email) DO NOTHING`;
  await sql`
    INSERT INTO users (name, email, password_hash, account_type, location)
    VALUES ('Zawadi Works Ltd.', 'zawadi@example.com', ${hash}, 'organization', 'Nairobi, Industrial Area')
    ON CONFLICT (email) DO NOTHING`;
}

async function seedListings(users) {
  if ((await count('listings')) > 0) return;

  const demo = [
    [users.aminaID, '3 office chairs, minor wear', 'furniture', 'Swivel chairs from a closed workspace. Two need a screw tightened, otherwise solid.', '3 units', 3, 'Used - good', 'Kisumu, Milimani', 'available', false],
    [users.zawadiID, 'Offcut timber, mixed sizes', 'construction', 'Leftover from cabinet production. Good for small joinery or a firewood alternative.', '~40kg', 4, 'New offcuts', 'Nairobi, Industrial Area', 'available', false],
    [users.aminaID, 'Broken laptops (for parts)', 'ewaste', 'Screens cracked, boards may still work. Good for a repair shop or e-waste recycler.', '6 units', 6, 'Non-functional', 'Kisumu, CBD', 'claimed', false],
    [users.zawadiID, 'Fabric offcuts, assorted colors', 'textiles', 'Cotton and ankara offcuts from tailoring. Great for patchwork or stuffing.', '5 bags', 5, 'New offcuts', 'Nairobi, Gikomba', 'available', false],
    [users.zawadiID, 'Spent coffee grounds, daily', 'organic', 'Recurring listing — great for composting or mushroom substrate. Collect daily after 6pm.', '10kg / day', 5, 'Fresh daily', 'Kisumu, Milimani', 'available', false],
    [users.aminaID, 'Dining table, one leg wobbly', 'furniture', 'Solid wood, just needs a leg brace.', '1 unit', 1, 'Used - fair', 'Kisumu, Nyalenda', 'collected', false],
    [users.zawadiID, 'PET bottle bales', 'plastic', 'Baled PET from packaging line. Ready for a recycler with pickup capacity.', '200kg', 20, 'Sorted, clean', 'Nairobi, Industrial Area', 'available', true],
    [users.zawadiID, 'Metal shavings from lathe work', 'industrial', 'Steel and aluminum shavings, unsorted. Good for scrap buyers.', '80kg', 5, 'Mixed alloy', 'Kisumu, Kibos Road', 'available', false],
  ];

  for (const row of demo) {
    await sql.query(
      `INSERT INTO listings
         (user_id, title, category, description, photo_url, qty_label, qty_num, condition, location, status, needs_disposer, disposer_note)
       VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8, $9, $10, '')`,
      row
    );
  }
}

async function seedDisposer(users) {
  if ((await count('disposer_profiles')) > 0) return;

  await sql`
    INSERT INTO disposer_profiles
      (user_id, service_area, contact_method, contact_value, bio, available, cleanups_completed, kg_diverted, vouch_count)
    VALUES (${users.aminaID}, 'Kisumu, Nyalenda', 'whatsapp', '2547XXXXXXX',
            'Mkokoteni collector — daily route through Nyalenda and Kibos Road.', true, 14, 1820, 6)
    ON CONFLICT (user_id) DO NOTHING`;
}

async function seedActivities(users) {
  if ((await count('activities')) > 0) return;

  await sql`
    INSERT INTO activities
      (user_id, title, description, photo_url, location, target_volume_label, target_kg,
       event_date, volunteers_needed, volunteers_pledged, status, needs_disposer)
    VALUES (${users.zawadiID}, 'Nyalenda Drain Clearing',
            'Clear the blocked drain near the market and bag the waste before the rains.', '',
            'Kisumu, Nyalenda', '~120kg', 120, now() + interval '7 days', 8, 2, 'upcoming', true)`;

  await sql`
    INSERT INTO activities
      (user_id, title, description, photo_url, location, target_volume_label, target_kg,
       event_date, volunteers_needed, volunteers_pledged, status, needs_disposer)
    VALUES (${users.aminaID}, 'Kibos Road Cleanup',
            'Weekly roadside cleanup along Kibos Road with the neighbourhood.', '',
            'Kisumu, Kibos Road', '~300kg', 300, now() + interval '2 days', 12, 3, 'active', false)`;
}

async function seedStories(users) {
  if ((await count('stories')) > 0) return;

  await sql`
    INSERT INTO stories
      (user_id, title, caption, before_photo_url, after_photo_url, location, kg_removed, disposer_user_id)
    VALUES (${users.zawadiID}, 'Before & After: Milimani alley',
            'Cleared a tight alley behind the market, then composted the organics.',
            '', '', 'Kisumu, Milimani', 60, ${users.aminaID})`;
}

async function seedSupportRequests() {
  if ((await count('support_requests')) > 0) return;

  // Attaches to whichever activity exists; inserts nothing when there are none.
  await sql`
    INSERT INTO support_requests
      (activity_id, kind, item_label, qty_needed, qty_fulfilled, contact_method, contact_value)
    SELECT id, 'bags', 'Heavy-duty trash bags', 10, 3, 'whatsapp', '2547XXXXXXX'
    FROM activities
    ORDER BY id ASC
    LIMIT 1`;
}

async function seed() {
  await seedUsers();

  const users = await demoUsers();
  if (!users) return; // nothing to attach demo rows to

  await seedListings(users);
  await seedDisposer(users);
  await seedActivities(users);
  await seedStories(users);
  await seedSupportRequests();
}

async function ensureSchema() {
  await run(TABLES);
  await run(COLUMNS);
  await run(INDEXES);
  await seed();
}

module.exports = { ensureSchema, DEMO_PASSWORD };
