package handlers

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dumptrade/db"
	"dumptrade/models"

	"github.com/jackc/pgx/v5"
)

type PostgresListingStore struct{}

func NewPostgresListingStore() *PostgresListingStore {
	return &PostgresListingStore{}
}

func (s *PostgresListingStore) GetAll(category, status, search string) ([]models.Listing, error) {
	query := `
		SELECT l.id, l.user_id, l.title, l.category, COALESCE(l.description, ''), COALESCE(l.photo_url, ''),
		       l.qty_label, l.qty_num, COALESCE(l.condition, ''), l.location, l.status, l.created_at,
		       COALESCE(u.name, ''), COALESCE(u.account_type::text, '')
		FROM listings l
		LEFT JOIN users u ON l.user_id = u.id
		WHERE ($1 = '' OR l.category::text = $1)
		  AND ($2 = '' OR l.status::text = $2)
		  AND ($3 = '' OR l.title ILIKE '%' || $3 || '%' OR l.description ILIKE '%' || $3 || '%')
		ORDER BY l.created_at DESC
	`

	rows, err := db.Pool.Query(context.Background(), query, category, status, search)
	if err != nil {
		return nil, fmt.Errorf("querying listings: %w", err)
	}
	defer rows.Close()

	listings := make([]models.Listing, 0)
	for rows.Next() {
		var l models.Listing
		err := rows.Scan(
			&l.ID, &l.UserID, &l.Title, &l.Category, &l.Description, &l.PhotoUrl,
			&l.QtyLabel, &l.QtyNum, &l.Condition, &l.Location, &l.Status, &l.CreatedAt,
			&l.PosterName, &l.AccountType,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning listing row: %w", err)
		}
		listings = append(listings, l)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating listing rows: %w", err)
	}

	return listings, nil
}

func (s *PostgresListingStore) GetByID(id int) (*models.Listing, error) {
	query := `
		SELECT l.id, l.user_id, l.title, l.category, COALESCE(l.description, ''), COALESCE(l.photo_url, ''),
		       l.qty_label, l.qty_num, COALESCE(l.condition, ''), l.location, l.status, l.created_at,
		       COALESCE(u.name, ''), COALESCE(u.account_type::text, '')
		FROM listings l
		LEFT JOIN users u ON l.user_id = u.id
		WHERE l.id = $1
	`

	var l models.Listing
	err := db.Pool.QueryRow(context.Background(), query, id).Scan(
		&l.ID, &l.UserID, &l.Title, &l.Category, &l.Description, &l.PhotoUrl,
		&l.QtyLabel, &l.QtyNum, &l.Condition, &l.Location, &l.Status, &l.CreatedAt,
		&l.PosterName, &l.AccountType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting listing by id: %w", err)
	}
	return &l, nil
}

func (s *PostgresListingStore) Create(l *models.Listing) error {
	if l.QtyNum <= 0 {
		l.QtyNum = 1
	}
	if l.Status == "" {
		l.Status = "available"
	}
	if l.CreatedAt.IsZero() {
		l.CreatedAt = time.Now()
	}

	query := `
		INSERT INTO listings (user_id, title, category, description, photo_url, qty_label, qty_num, condition, location, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at
	`
	return db.Pool.QueryRow(
		context.Background(),
		query,
		l.UserID, l.Title, l.Category, l.Description, l.PhotoUrl, l.QtyLabel, l.QtyNum, l.Condition, l.Location, l.Status, l.CreatedAt,
	).Scan(&l.ID, &l.CreatedAt)
}

func (s *PostgresListingStore) UpdateStatus(id int, status string) error {
	query := `UPDATE listings SET status = $1 WHERE id = $2`
	tag, err := db.Pool.Exec(context.Background(), query, status, id)
	if err != nil {
		return fmt.Errorf("updating listing status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("listing not found")
	}
	return nil
}

func (s *PostgresListingStore) Claim(listingID int, claimantID int) error {
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM listings WHERE id = $1 FOR UPDATE`, listingID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("listing not found")
	}
	if err != nil {
		return fmt.Errorf("querying listing status: %w", err)
	}

	if status != "available" {
		return fmt.Errorf("listing is already %s", status)
	}

	_, err = tx.Exec(ctx, `UPDATE listings SET status = 'claimed' WHERE id = $1`, listingID)
	if err != nil {
		return fmt.Errorf("updating listing to claimed: %w", err)
	}

	_, err = tx.Exec(ctx, `INSERT INTO claims (listing_id, claimant_id, claimed_at) VALUES ($1, $2, $3)`, listingID, claimantID, time.Now())
	if err != nil {
		return fmt.Errorf("inserting claim: %w", err)
	}

	return tx.Commit(ctx)
}

func (s *PostgresListingStore) MarkCollected(listingID int) error {
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `UPDATE listings SET status = 'collected' WHERE id = $1`, listingID)
	if err != nil {
		return fmt.Errorf("updating listing to collected: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("listing not found")
	}

	// Update claims record if one exists
	_, _ = tx.Exec(ctx, `UPDATE claims SET collected_at = now() WHERE listing_id = $1 AND collected_at IS NULL`, listingID)

	return tx.Commit(ctx)
}
