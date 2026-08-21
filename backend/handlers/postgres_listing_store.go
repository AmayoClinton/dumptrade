package handlers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"dumptrade/db"
	"dumptrade/models"

	"github.com/jackc/pgx/v5"
)

const listingQueryTimeout = 5 * time.Second

type PostgresListingStore struct{}

func NewPostgresListingStore() *PostgresListingStore {
	return &PostgresListingStore{}
}

func (s *PostgresListingStore) GetAll(category, status, search, city string, limit, offset int) ([]models.Listing, error) {
	ctx, cancel := context.WithTimeout(context.Background(), listingQueryTimeout)
	defer cancel()

	conditions := make([]string, 0, 4)
	args := make([]any, 0, 6)
	addArg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}
	if category != "" {
		conditions = append(conditions, "l.category = "+addArg(category)+"::category_key")
	}
	if status != "" {
		conditions = append(conditions, "l.status = "+addArg(status)+"::listing_status")
	}
	if search != "" {
		placeholder := addArg(search)
		conditions = append(conditions, "(l.title ILIKE '%' || "+placeholder+" || '%' OR l.description ILIKE '%' || "+placeholder+" || '%')")
	}
	if city != "" {
		conditions = append(conditions, "l.location ILIKE "+addArg(city)+" || '%'")
	}
	if len(conditions) == 0 {
		conditions = append(conditions, "TRUE")
	}
	if limit <= 0 || limit > 100 {
		limit = 24
	}
	if offset < 0 {
		offset = 0
	}
	limitPlaceholder := addArg(limit)
	offsetPlaceholder := addArg(offset)

	query := fmt.Sprintf(`
        SELECT l.id, l.user_id, l.title, l.category, COALESCE(l.description, ''), COALESCE(l.photo_url, ''),
               l.qty_label, l.qty_num, COALESCE(l.condition, ''), l.location, l.status, l.created_at,
               COALESCE(u.name, ''), COALESCE(u.account_type::text, '')
        FROM listings l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE %s
        ORDER BY l.created_at DESC
        LIMIT %s OFFSET %s
    `, strings.Join(conditions, " AND "), limitPlaceholder, offsetPlaceholder)

	rows, err := db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("querying listings: %w", err)
	}
	defer rows.Close()

	listings := make([]models.Listing, 0)
	for rows.Next() {
		var listing models.Listing
		if err := rows.Scan(
			&listing.ID, &listing.UserID, &listing.Title, &listing.Category, &listing.Description, &listing.PhotoUrl,
			&listing.QtyLabel, &listing.QtyNum, &listing.Condition, &listing.Location, &listing.Status, &listing.CreatedAt,
			&listing.PosterName, &listing.AccountType,
		); err != nil {
			return nil, fmt.Errorf("scanning listing row: %w", err)
		}
		listings = append(listings, listing)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating listing rows: %w", err)
	}
	return listings, nil
}

func (s *PostgresListingStore) GetByID(id int) (*models.Listing, error) {
	ctx, cancel := context.WithTimeout(context.Background(), listingQueryTimeout)
	defer cancel()
	query := `
        SELECT l.id, l.user_id, l.title, l.category, COALESCE(l.description, ''), COALESCE(l.photo_url, ''),
               l.qty_label, l.qty_num, COALESCE(l.condition, ''), l.location, l.status, l.created_at,
               COALESCE(u.name, ''), COALESCE(u.account_type::text, '')
        FROM listings l LEFT JOIN users u ON l.user_id = u.id WHERE l.id = $1
    `
	var listing models.Listing
	err := db.Pool.QueryRow(ctx, query, id).Scan(
		&listing.ID, &listing.UserID, &listing.Title, &listing.Category, &listing.Description, &listing.PhotoUrl,
		&listing.QtyLabel, &listing.QtyNum, &listing.Condition, &listing.Location, &listing.Status, &listing.CreatedAt,
		&listing.PosterName, &listing.AccountType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting listing by id: %w", err)
	}
	return &listing, nil
}

func (s *PostgresListingStore) Create(listing *models.Listing) error {
	ctx, cancel := context.WithTimeout(context.Background(), listingQueryTimeout)
	defer cancel()
	if listing.QtyNum <= 0 {
		listing.QtyNum = 1
	}
	if listing.Status == "" {
		listing.Status = "available"
	}
	if listing.CreatedAt.IsZero() {
		listing.CreatedAt = time.Now()
	}

	return db.Pool.QueryRow(ctx, `
        INSERT INTO listings (user_id, title, category, description, photo_url, qty_label, qty_num, condition, location, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at
    `, listing.UserID, listing.Title, listing.Category, listing.Description, listing.PhotoUrl, listing.QtyLabel, listing.QtyNum, listing.Condition, listing.Location, listing.Status, listing.CreatedAt).Scan(&listing.ID, &listing.CreatedAt)
}

func (s *PostgresListingStore) UpdateStatus(id int, status string) error {
	ctx, cancel := context.WithTimeout(context.Background(), listingQueryTimeout)
	defer cancel()
	tag, err := db.Pool.Exec(ctx, `UPDATE listings SET status = $1 WHERE id = $2`, status, id)
	if err != nil {
		return fmt.Errorf("updating listing status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("listing not found")
	}
	return nil
}

func (s *PostgresListingStore) Claim(listingID int, claimantID int) error {
	ctx, cancel := context.WithTimeout(context.Background(), listingQueryTimeout)
	defer cancel()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var status string
	var ownerID int
	err = tx.QueryRow(ctx, `SELECT user_id, status FROM listings WHERE id = $1 FOR UPDATE`, listingID).Scan(&ownerID, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("listing not found")
	}
	if err != nil {
		return fmt.Errorf("querying listing status: %w", err)
	}
	if ownerID == claimantID {
		return errors.New("you cannot claim your own listing")
	}
	if status != "available" {
		return fmt.Errorf("listing is already %s", status)
	}

	if _, err = tx.Exec(ctx, `UPDATE listings SET status = 'claimed' WHERE id = $1`, listingID); err != nil {
		return fmt.Errorf("updating listing to claimed: %w", err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO claims (listing_id, claimant_id, claimed_at) VALUES ($1, $2, $3)`, listingID, claimantID, time.Now()); err != nil {
		return fmt.Errorf("inserting claim: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *PostgresListingStore) MarkCollected(listingID int, actorID int) error {
	ctx, cancel := context.WithTimeout(context.Background(), listingQueryTimeout)
	defer cancel()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
        UPDATE listings l SET status = 'collected'
        WHERE l.id = $1 AND l.status = 'claimed'
          AND (l.user_id = $2 OR EXISTS (
            SELECT 1 FROM claims c WHERE c.listing_id = l.id AND c.claimant_id = $2
          ))
    `, listingID, actorID)
	if err != nil {
		return fmt.Errorf("updating listing to collected: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("only the poster or claimant can mark a claimed listing collected")
	}
	if _, err = tx.Exec(ctx, `UPDATE claims SET collected_at = now() WHERE listing_id = $1 AND collected_at IS NULL`, listingID); err != nil {
		return fmt.Errorf("updating claim collection time: %w", err)
	}
	return tx.Commit(ctx)
}
