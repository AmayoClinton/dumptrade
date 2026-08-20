package models

import (
	"encoding/json"
	"testing"
	"time"
)

func TestModelsJSON(t *testing.T) {
	now := time.Now().Truncate(time.Second)

	user := User{
		ID:           1,
		Name:         "John Doe",
		Email:        "john@example.com",
		PasswordHash: "hashedsecret",
		AccountType:  "individual",
		Location:     "Nairobi",
		CreatedAt:    now,
	}

	data, err := json.Marshal(user)
	if err != nil {
		t.Fatalf("failed to marshal user: %v", err)
	}

	// Verify PasswordHash is omitted from json
	var unmarshaled map[string]interface{}
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal user JSON: %v", err)
	}
	if _, exists := unmarshaled["password_hash"]; exists {
		t.Fatalf("password_hash should not be present in user JSON")
	}
	if unmarshaled["name"] != "John Doe" || unmarshaled["email"] != "john@example.com" {
		t.Fatalf("unexpected unmarshaled user values: %v", unmarshaled)
	}

	listing := Listing{
		ID:          10,
		UserID:      1,
		Title:       "Scrap Metal",
		Category:    "industrial",
		Description: "Steel sheets",
		QtyLabel:    "50kg",
		QtyNum:      50,
		Condition:   "Good",
		Location:    "Industrial Area",
		Status:      "available",
		CreatedAt:   now,
		PosterName:  "John Doe",
		AccountType: "individual",
	}

	listData, err := json.Marshal(listing)
	if err != nil {
		t.Fatalf("failed to marshal listing: %v", err)
	}

	var parsedListing Listing
	if err := json.Unmarshal(listData, &parsedListing); err != nil {
		t.Fatalf("failed to unmarshal listing JSON: %v", err)
	}
	if parsedListing.Title != listing.Title || parsedListing.Category != listing.Category {
		t.Fatalf("mismatched listing: expected %+v, got %+v", listing, parsedListing)
	}
}
