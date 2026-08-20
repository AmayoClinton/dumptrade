package handlers

import (
	"net/http"
	"strconv"
	"time"

	"dumptrade/models"

	"github.com/gin-gonic/gin"
)

type ListingStore interface {
	GetAll(category, status, search string) ([]models.Listing, error)
	GetByID(id int) (*models.Listing, error)
	Create(listing *models.Listing) error
	UpdateStatus(id int, status string) error
	Claim(listingID int, claimantID int) error
	MarkCollected(listingID int) error
}

type ListingHandler struct {
	Store ListingStore
}

func NewListingHandler(store ListingStore) *ListingHandler {
	return &ListingHandler{Store: store}
}

func (h *ListingHandler) GetListings(c *gin.Context) {
	category := c.Query("category")
	status := c.Query("status")
	search := c.Query("search")

	// If status is "all", don't filter by status
	if status == "all" {
		status = ""
	}

	listings, err := h.Store.GetAll(category, status, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch listings: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, listings)
}

func (h *ListingHandler) GetListing(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid listing ID"})
		return
	}

	listing, err := h.Store.GetByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch listing: " + err.Error()})
		return
	}
	if listing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Listing not found"})
		return
	}

	c.JSON(http.StatusOK, listing)
}

type CreateListingInput struct {
	Title       string `json:"title" binding:"required"`
	Category    string `json:"category" binding:"required"`
	Description string `json:"description"`
	PhotoUrl    string `json:"photo_url"`
	QtyLabel    string `json:"qty_label" binding:"required"`
	QtyNum      int    `json:"qty_num"`
	Condition   string `json:"condition"`
	Location    string `json:"location" binding:"required"`
}

func (h *ListingHandler) CreateListing(c *gin.Context) {
	var input CreateListingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validCategories := map[string]bool{
		"furniture": true, "ewaste": true, "textiles": true, "construction": true,
		"organic": true, "plastic": true, "industrial": true, "other": true,
	}
	if !validCategories[input.Category] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category. Must be one of: furniture, ewaste, textiles, construction, organic, plastic, industrial, other"})
		return
	}

	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User authentication required"})
		return
	}
	userID, ok := userIDVal.(int)
	if !ok || userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authenticated user ID"})
		return
	}

	qtyNum := input.QtyNum
	if qtyNum <= 0 {
		qtyNum = 1
	}

	listing := models.Listing{
		UserID:      userID,
		Title:       input.Title,
		Category:    input.Category,
		Description: input.Description,
		PhotoUrl:    input.PhotoUrl,
		QtyLabel:    input.QtyLabel,
		QtyNum:      qtyNum,
		Condition:   input.Condition,
		Location:    input.Location,
		Status:      "available",
		CreatedAt:   time.Now(),
	}

	if err := h.Store.Create(&listing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create listing: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, listing)
}

func (h *ListingHandler) ClaimListing(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid listing ID"})
		return
	}

	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User authentication required"})
		return
	}
	claimantID, ok := userIDVal.(int)
	if !ok || claimantID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authenticated user ID"})
		return
	}

	if err := h.Store.Claim(id, claimantID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Listing claimed successfully"})
}

func (h *ListingHandler) MarkCollected(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid listing ID"})
		return
	}

	if err := h.Store.MarkCollected(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Listing marked as collected successfully"})
}
