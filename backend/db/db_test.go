package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadEnv(t *testing.T) {
	tmpDir := t.TempDir()
	envPath := filepath.Join(tmpDir, ".env")

	content := `
# Comment line
TEST_DUMPTRADE_KEY=test_value_123
TEST_QUOTED_KEY="quoted_value"
`
	if err := os.WriteFile(envPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test .env: %v", err)
	}

	LoadEnv(envPath)

	if os.Getenv("TEST_DUMPTRADE_KEY") != "test_value_123" {
		t.Fatalf("expected test_value_123, got %s", os.Getenv("TEST_DUMPTRADE_KEY"))
	}
	if os.Getenv("TEST_QUOTED_KEY") != "quoted_value" {
		t.Fatalf("expected quoted_value, got %s", os.Getenv("TEST_QUOTED_KEY"))
	}
}
