-- 0001_init.up.sql
-- Core schema for DumpTrade

CREATE TYPE account_type AS ENUM ('individual', 'organization');
CREATE TYPE listing_status AS ENUM ('available', 'claimed', 'collected');
CREATE TYPE category_key AS ENUM (
  'furniture', 'ewaste', 'textiles', 'construction',
  'organic', 'plastic', 'industrial', 'other'
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  account_type account_type NOT NULL DEFAULT 'individual',
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category category_key NOT NULL,
  description TEXT,
  photo_url TEXT,
  qty_label TEXT NOT NULL,
  qty_num INTEGER NOT NULL DEFAULT 1,
  condition TEXT,
  location TEXT NOT NULL,
  status listing_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  claimant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at TIMESTAMPTZ
);

CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category);
CREATE INDEX idx_listings_location ON listings(location);
CREATE INDEX idx_claims_listing_id ON claims(listing_id);
