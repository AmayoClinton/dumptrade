-- 0001_init.down.sql
DROP INDEX IF EXISTS idx_claims_listing_id;
DROP INDEX IF EXISTS idx_listings_location;
DROP INDEX IF EXISTS idx_listings_category;
DROP INDEX IF EXISTS idx_listings_status;

DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS category_key;
DROP TYPE IF EXISTS listing_status;
DROP TYPE IF EXISTS account_type;