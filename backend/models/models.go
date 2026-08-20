package models

import "time"

type User struct {
	ID           int       `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	AccountType  string    `json:"account_type" db:"account_type"` // "individual" or "organization"
	Location     string    `json:"location,omitempty" db:"location"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type Listing struct {
	ID          int       `json:"id" db:"id"`
	UserID      int       `json:"user_id" db:"user_id"`
	Title       string    `json:"title" db:"title"`
	Category    string    `json:"category" db:"category"` // furniture, ewaste, textiles, construction, organic, plastic, industrial, other
	Description string    `json:"description" db:"description"`
	PhotoUrl    string    `json:"photo_url" db:"photo_url"`
	QtyLabel    string    `json:"qty_label" db:"qty_label"` // e.g., "5 bags", "2 pieces"
	QtyNum      int       `json:"qty_num" db:"qty_num"`     // for sorting/filtering
	Condition   string    `json:"condition" db:"condition"`
	Location    string    `json:"location" db:"location"`
	Status      string    `json:"status" db:"status"` // "available", "claimed", "collected"
	CreatedAt   time.Time `json:"created_at" db:"created_at"`

	// Joined poster details for frontend convenience
	PosterName  string `json:"poster_name,omitempty" db:"poster_name"`
	AccountType string `json:"account_type,omitempty" db:"account_type"`
}

type Claim struct {
	ID          int        `json:"id" db:"id"`
	ListingID   int        `json:"listing_id" db:"listing_id"`
	ClaimantID  int        `json:"claimant_id" db:"claimant_id"`
	ClaimedAt   time.Time  `json:"claimed_at" db:"claimed_at"`
	CollectedAt *time.Time `json:"collected_at,omitempty" db:"collected_at"`
}
