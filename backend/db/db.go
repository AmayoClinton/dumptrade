// Package db manages the Postgres (Neon) connection pool, migrations, and seeding.
package db

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Pool is the shared connection pool used by handlers/models.
var Pool *pgxpool.Pool

// LoadEnv reads a .env file and sets environment variables if they are not already set.
func LoadEnv(filenames ...string) {
	if len(filenames) == 0 {
		filenames = []string{".env", "../.env"}
	}

	for _, filename := range filenames {
		file, err := os.Open(filename)
		if err != nil {
			continue
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				value := strings.TrimSpace(parts[1])
				// Strip quotes if present
				if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
					value = value[1 : len(value)-1]
				}
				if os.Getenv(key) == "" {
					os.Setenv(key, value)
				}
			}
		}
		break
	}
}

// Connect reads DATABASE_URL from the environment and opens a pooled
// connection to Neon. Call this once from main() at startup.
func Connect() error {
	LoadEnv()

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		return fmt.Errorf("DATABASE_URL is not set (check your .env file)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cfg, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return fmt.Errorf("parsing DATABASE_URL: %w", err)
	}

	// Keep the pool small -- Neon's pooled endpoint already multiplexes
	cfg.MaxConns = 5

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("creating connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("pinging database: %w", err)
	}

	Pool = pool
	return nil
}

// Migrate ensures all required types, tables, and indexes exist in the database.
func Migrate() error {
	if Pool == nil {
		return fmt.Errorf("database connection pool is not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	migrationSQL := `
	DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
			CREATE TYPE account_type AS ENUM ('individual', 'organization');
		END IF;
	END $$;

	DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
			CREATE TYPE listing_status AS ENUM ('available', 'claimed', 'collected');
		END IF;
	END $$;

	DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'category_key') THEN
			CREATE TYPE category_key AS ENUM (
				'furniture', 'ewaste', 'textiles', 'construction',
				'organic', 'plastic', 'industrial', 'other'
			);
		END IF;
	END $$;

	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		account_type account_type NOT NULL DEFAULT 'individual',
		location TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);

	CREATE TABLE IF NOT EXISTS listings (
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

	CREATE TABLE IF NOT EXISTS claims (
		id SERIAL PRIMARY KEY,
		listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
		claimant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		collected_at TIMESTAMPTZ
	);

	CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
	CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
	CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
	CREATE INDEX IF NOT EXISTS idx_claims_listing_id ON claims(listing_id);
	CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_listings_category_status_created_at ON listings(category, status, created_at DESC);
	`

	_, err := Pool.Exec(ctx, migrationSQL)
	if err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}

	return nil
}

// Seed populates initial sample data if the listings table is empty.
func Seed() error {
	if Pool == nil {
		return fmt.Errorf("database connection pool is not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var count int
	err := Pool.QueryRow(ctx, `SELECT COUNT(*) FROM listings`).Scan(&count)
	if err != nil {
		return fmt.Errorf("checking listings count: %w", err)
	}

	if count > 0 {
		return nil // Already seeded
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing demo password: %w", err)
	}

	// Create demo user
	var userID int
	err = Pool.QueryRow(ctx, `
		INSERT INTO users (name, email, password_hash, account_type, location)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
		RETURNING id
	`, "Amina O.", "amina@example.com", string(hashedPassword), "individual", "Kisumu, Milimani").Scan(&userID)
	if err != nil {
		return fmt.Errorf("creating demo user: %w", err)
	}

	var orgID int
	err = Pool.QueryRow(ctx, `
		INSERT INTO users (name, email, password_hash, account_type, location)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
		RETURNING id
	`, "Zawadi Works Ltd.", "zawadi@example.com", string(hashedPassword), "organization", "Nairobi, Industrial Area").Scan(&orgID)
	if err != nil {
		return fmt.Errorf("creating demo org user: %w", err)
	}

	demoListings := []struct {
		userID      int
		title       string
		category    string
		description string
		photoURL    string
		qtyLabel    string
		qtyNum      int
		condition   string
		location    string
		status      string
	}{
		{userID, "3 office chairs, minor wear", "furniture", "Swivel chairs from a closed workspace. Two need a screw tightened, otherwise solid.", "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7D-BCRTSdQfbNWg22b0VSQnZtG7Jn3ECol5nBpkQRgA&s=10", "3 units", 3, "Used - good", "Kisumu, Milimani", "available"},
		{orgID, "Offcut timber, mixed sizes", "construction", "Leftover from cabinet production. Good for small joinery or a firewood alternative.", "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9Rz3jYcg5Qia8Am2p36MQJP1149evIrNEYSMFAxtIlw&s=10", "~40kg", 4, "New offcuts", "Nairobi, Industrial Area", "available"},
		{userID, "Broken laptops (for parts)", "ewaste", "Screens cracked, boards may still work. Good for a repair shop or e-waste recycler.", "", "6 units", 6, "Non-functional", "Kisumu, CBD", "claimed"},
		{orgID, "Fabric offcuts, assorted colors", "textiles", "Cotton and ankara offcuts from tailoring. Great for patchwork or stuffing.", "https://www.blackbirdfabrics.com/cdn/shop/articles/Untitled-1_0336d11c-814e-4f77-b609-d07f8a48b265.jpg?v=1682380353&width=4864", "5 bags", 5, "New offcuts", "Nairobi, Gikomba", "available"},
		{orgID, "Spent coffee grounds, daily", "organic", "Recurring listing â€” great for composting or mushroom substrate. Collect daily after 6pm.", "", "10kg / day", 5, "Fresh daily", "Kisumu, Milimani", "available"},
		{userID, "Dining table, one leg wobbly", "furniture", "Solid wood, just needs a leg brace.", "", "1 unit", 1, "Used - fair", "Kisumu, Nyalenda", "collected"},
		{orgID, "PET bottle bales", "plastic", "Baled PET from packaging line. Ready for a recycler with pickup capacity.", "", "200kg", 20, "Sorted, clean", "Nairobi, Industrial Area", "available"},
		{orgID, "Metal shavings from lathe work", "industrial", "Steel and aluminum shavings, unsorted. Good for scrap buyers.", "", "80kg", 5, "Mixed alloy", "Kisumu, Kibos Road", "available"},
	}

	for _, l := range demoListings {
		_, err := Pool.Exec(ctx, `
			INSERT INTO listings (user_id, title, category, description, photo_url, qty_label, qty_num, condition, location, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, l.userID, l.title, l.category, l.description, l.photoURL, l.qtyLabel, l.qtyNum, l.condition, l.location, l.status)
		if err != nil {
			return fmt.Errorf("seeding listing '%s': %w", l.title, err)
		}
	}

	return nil
}

// Close shuts down the pool. Call this with defer in main().
func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
