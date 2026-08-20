// Package db manages the Postgres (Neon) connection pool.
package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the shared connection pool used by handlers/models.
var Pool *pgxpool.Pool

// Connect reads DATABASE_URL from the environment and opens a pooled
// connection to Neon. Call this once from main() at startup.
func Connect() error {
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

// Close shuts down the pool. Call this with defer in main().
func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
