package handlers

import (
	"fmt"
	"os"
	"testing"
	"time"

	"dumptrade/db"
	"dumptrade/models"
)

func TestPostgresStoresIntegration(t *testing.T) {
	db.LoadEnv()
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set, skipping DB store integration test")
	}

	if err := db.Connect(); err != nil {
		t.Fatalf("db.Connect failed: %v", err)
	}
	defer db.Close()

	if err := db.Migrate(); err != nil {
		t.Fatalf("db.Migrate failed: %v", err)
	}

	userStore := NewPostgresUserStore()
	listingStore := NewPostgresListingStore()

	// 1. Create a unique test user
	uniqueEmail := fmt.Sprintf("testuser_%d@example.com", time.Now().UnixNano())
	user := &models.User{
		Name:         "Integration Tester",
		Email:        uniqueEmail,
		PasswordHash: "hashedpass123",
		AccountType:  "individual",
		Location:     "Nairobi",
	}

	if err := userStore.Create(user); err != nil {
		t.Fatalf("userStore.Create failed: %v", err)
	}
	if user.ID <= 0 {
		t.Fatalf("expected positive user ID, got %d", user.ID)
	}

	// 2. Fetch user by email
	fetchedUser, err := userStore.GetByEmail(uniqueEmail)
	if err != nil {
		t.Fatalf("userStore.GetByEmail failed: %v", err)
	}
	if fetchedUser == nil || fetchedUser.ID != user.ID {
		t.Fatalf("fetched user mismatch: %+v", fetchedUser)
	}

	// 3. Create a listing for this user
	listing := &models.Listing{
		UserID:      user.ID,
		Title:       "Test Scrap Wood",
		Category:    "construction",
		Description: "Pallets and wood cuts",
		PhotoUrl:    "https://example.com/wood.jpg",
		QtyLabel:    "10 pallets",
		QtyNum:      10,
		Condition:   "Good",
		Location:    "Nairobi",
		Status:      "available",
	}

	if err := listingStore.Create(listing); err != nil {
		t.Fatalf("listingStore.Create failed: %v", err)
	}
	if listing.ID <= 0 {
		t.Fatalf("expected positive listing ID, got %d", listing.ID)
	}

	// 4. Fetch listing by ID
	fetchedListing, err := listingStore.GetByID(listing.ID)
	if err != nil {
		t.Fatalf("listingStore.GetByID failed: %v", err)
	}
	if fetchedListing == nil || fetchedListing.Title != listing.Title {
		t.Fatalf("fetched listing mismatch: %+v", fetchedListing)
	}
	if fetchedListing.PosterName != user.Name {
		t.Fatalf("expected PosterName %s, got %s", user.Name, fetchedListing.PosterName)
	}

	// 5. Query listings with filters
	listings, err := listingStore.GetAll("construction", "available", "Scrap")
	if err != nil {
		t.Fatalf("listingStore.GetAll failed: %v", err)
	}
	found := false
	for _, l := range listings {
		if l.ID == listing.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected to find created listing in filtered GetAll results")
	}

	// 6. Create claimant user and claim listing
	claimantEmail := fmt.Sprintf("claimant_%d@example.com", time.Now().UnixNano())
	claimant := &models.User{
		Name:         "Claimant User",
		Email:        claimantEmail,
		PasswordHash: "hashedpass456",
		AccountType:  "organization",
		Location:     "Kisumu",
	}
	if err := userStore.Create(claimant); err != nil {
		t.Fatalf("failed to create claimant user: %v", err)
	}

	if err := listingStore.Claim(listing.ID, claimant.ID); err != nil {
		t.Fatalf("listingStore.Claim failed: %v", err)
	}

	// Verify listing status is now 'claimed'
	updatedListing, err := listingStore.GetByID(listing.ID)
	if err != nil || updatedListing.Status != "claimed" {
		t.Fatalf("expected status claimed, got %s (err: %v)", updatedListing.Status, err)
	}

	// 7. Mark listing as collected
	if err := listingStore.MarkCollected(listing.ID); err != nil {
		t.Fatalf("listingStore.MarkCollected failed: %v", err)
	}

	collectedListing, err := listingStore.GetByID(listing.ID)
	if err != nil || collectedListing.Status != "collected" {
		t.Fatalf("expected status collected, got %s (err: %v)", collectedListing.Status, err)
	}
}
