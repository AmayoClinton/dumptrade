package handlers

import (
	"context"
	"errors"
	"time"

	"dumptrade/db"
	"dumptrade/models"

	"github.com/jackc/pgx/v5"
)

type PostgresUserStore struct{}

func NewPostgresUserStore() *PostgresUserStore {
	return &PostgresUserStore{}
}

func (s *PostgresUserStore) GetByEmail(email string) (*models.User, error) {
	var u models.User
	row := db.Pool.QueryRow(context.Background(),
		`SELECT id, name, email, password_hash, account_type, COALESCE(location, ''), created_at
		 FROM users WHERE email = $1`, email)

	err := row.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.AccountType, &u.Location, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *PostgresUserStore) GetByID(id int) (*models.User, error) {
	var u models.User
	row := db.Pool.QueryRow(context.Background(),
		`SELECT id, name, email, password_hash, account_type, COALESCE(location, ''), created_at
		 FROM users WHERE id = $1`, id)

	err := row.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.AccountType, &u.Location, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *PostgresUserStore) Create(u *models.User) error {
	if u.CreatedAt.IsZero() {
		u.CreatedAt = time.Now()
	}
	return db.Pool.QueryRow(context.Background(),
		`INSERT INTO users (name, email, password_hash, account_type, location, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
		u.Name, u.Email, u.PasswordHash, u.AccountType, u.Location, u.CreatedAt,
	).Scan(&u.ID, &u.CreatedAt)
}
