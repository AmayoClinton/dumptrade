package db

import (
	"os"
	"testing"
)

func TestDBConnectAndMigrate(t *testing.T) {
	LoadEnv()
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set, skipping DB integration test")
	}

	err := Connect()
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer Close()

	err = Migrate()
	if err != nil {
		t.Fatalf("Migrate failed: %v", err)
	}
}
