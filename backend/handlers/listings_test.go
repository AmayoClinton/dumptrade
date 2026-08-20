package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dumptrade/models"

	"github.com/gin-gonic/gin"
)

type mockListingStore struct {
	listings []models.Listing
	claims   []models.Claim
}

func newMockListingStore() *mockListingStore {
	return &mockListingStore{
		listings: make([]models.Listing, 0),
		claims:   make([]models.Claim, 0),
	}
}

func (m *mockListingStore) GetAll(category, status, search string) ([]models.Listing, error) {
	result := make([]models.Listing, 0)
	for _, l := range m.listings {
		if category != "" && l.Category != category {
			continue
		}
		if status != "" && l.Status != status {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(l.Title), strings.ToLower(search)) && !strings.Contains(strings.ToLower(l.Description), strings.ToLower(search)) {
			continue
		}
		result = append(result, l)
	}
	return result, nil
}

func (m *mockListingStore) GetByID(id int) (*models.Listing, error) {
	for _, l := range m.listings {
		if l.ID == id {
			copy := l
			return &copy, nil
		}
	}
	return nil, nil
}

func (m *mockListingStore) Create(listing *models.Listing) error {
	listing.ID = len(m.listings) + 1
	listing.CreatedAt = time.Now()
	m.listings = append(m.listings, *listing)
	return nil
}

func (m *mockListingStore) UpdateStatus(id int, status string) error {
	for i, l := range m.listings {
		if l.ID == id {
			m.listings[i].Status = status
			return nil
		}
	}
	return errors.New("listing not found")
}

func (m *mockListingStore) Claim(listingID int, claimantID int) error {
	for i, l := range m.listings {
		if l.ID == listingID {
			if l.Status != "available" {
				return fmt.Errorf("listing is already %s", l.Status)
			}
			m.listings[i].Status = "claimed"
			m.claims = append(m.claims, models.Claim{
				ID:         len(m.claims) + 1,
				ListingID:  listingID,
				ClaimantID: claimantID,
				ClaimedAt:  time.Now(),
			})
			return nil
		}
	}
	return errors.New("listing not found")
}

func (m *mockListingStore) MarkCollected(listingID int) error {
	for i, l := range m.listings {
		if l.ID == listingID {
			m.listings[i].Status = "collected"
			return nil
		}
	}
	return errors.New("listing not found")
}

func TestListingHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newMockListingStore()
	store.listings = append(store.listings, models.Listing{
		ID:          1,
		UserID:      10,
		Title:       "Timber Offcuts",
		Category:    "construction",
		Description: "Leftover oak planks",
		QtyLabel:    "5 planks",
		QtyNum:      5,
		Condition:   "Good",
		Location:    "Nairobi",
		Status:      "available",
		CreatedAt:   time.Now(),
	}, models.Listing{
		ID:          2,
		UserID:      11,
		Title:       "Used Office Chair",
		Category:    "furniture",
		Description: "Swivel chair",
		QtyLabel:    "1 unit",
		QtyNum:      1,
		Condition:   "Fair",
		Location:    "Kisumu",
		Status:      "claimed",
		CreatedAt:   time.Now(),
	})

	h := NewListingHandler(store)
	router := gin.New()

	router.GET("/listings", h.GetListings)
	router.GET("/listings/:id", h.GetListing)

	// Simulated auth middleware
	authMiddleware := func(c *gin.Context) {
		c.Set("userID", 99)
		c.Next()
	}

	router.POST("/listings", authMiddleware, h.CreateListing)
	router.POST("/listings/:id/claim", authMiddleware, h.ClaimListing)
	router.POST("/listings/:id/collect", authMiddleware, h.MarkCollected)

	t.Run("Get all listings without filter", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/listings", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var list []models.Listing
		json.Unmarshal(w.Body.Bytes(), &list)
		if len(list) != 2 {
			t.Fatalf("expected 2 listings, got %d", len(list))
		}
	})

	t.Run("Get listings with category filter", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/listings?category=furniture", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		var list []models.Listing
		json.Unmarshal(w.Body.Bytes(), &list)
		if len(list) != 1 || list[0].Category != "furniture" {
			t.Fatalf("expected 1 furniture listing, got %d", len(list))
		}
	})

	t.Run("Get single listing by ID", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/listings/1", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var l models.Listing
		json.Unmarshal(w.Body.Bytes(), &l)
		if l.Title != "Timber Offcuts" {
			t.Fatalf("unexpected title: %s", l.Title)
		}
	})

	t.Run("Get single listing not found", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/listings/999", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})

	t.Run("Create listing success", func(t *testing.T) {
		body, _ := json.Marshal(CreateListingInput{
			Title:       "Old Batteries",
			Category:    "ewaste",
			Description: "AA batteries for recycling",
			QtyLabel:    "20 pcs",
			QtyNum:      20,
			Condition:   "Used",
			Location:    "Mombasa",
		})
		req, _ := http.NewRequest(http.MethodPost, "/listings", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var created models.Listing
		json.Unmarshal(w.Body.Bytes(), &created)
		if created.UserID != 99 || created.Status != "available" {
			t.Fatalf("expected userID 99 and available status, got %v", created)
		}
	})

	t.Run("Claim listing", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPost, "/listings/1/claim", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		// Trying to claim again should fail
		req2, _ := http.NewRequest(http.MethodPost, "/listings/1/claim", nil)
		w2 := httptest.NewRecorder()
		router.ServeHTTP(w2, req2)
		if w2.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 on already claimed listing, got %d", w2.Code)
		}
	})

	t.Run("Mark collected", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPost, "/listings/1/collect", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	})
}
