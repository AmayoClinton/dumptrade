package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"dumptrade/models"

	"github.com/gin-gonic/gin"
)

type ListingStore interface {
	GetAll(category, status, search, city string, limit, offset int) ([]models.Listing, error)
	GetByID(id int) (*models.Listing, error)
	Create(listing *models.Listing) error
	UpdateStatus(id int, status string) error
	Claim(listingID int, claimantID int) error
	MarkCollected(listingID int, actorID int) error
}

type ListingHandler struct {
	Store ListingStore
}

func NewListingHandler(store ListingStore) *ListingHandler {
	return &ListingHandler{Store: store}
}

func queryInt(c *gin.Context, key string, fallback, max int) int {
	value, err := strconv.Atoi(c.DefaultQuery(key, strconv.Itoa(fallback)))
	if err != nil || value < 0 {
		return fallback
	}
	if max > 0 && value > max {
		return max
	}
	return value
}

func (h *ListingHandler) GetListings(c *gin.Context) {
	category := c.Query("category")
	status := c.Query("status")
	search := strings.TrimSpace(c.Query("search"))
	city := strings.TrimSpace(c.Query("city"))
	if status == "all" {
		status = ""
	}

	limit := queryInt(c, "limit", 24, 100)
	if limit == 0 {
		limit = 24
	}
	offset := queryInt(c, "offset", 0, 0)

	listings, err := h.Store.GetAll(category, status, search, city, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch listings: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, listings)
}

func (h *ListingHandler) GetListing(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
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
	PhotoURL    string `json:"photo_url"`
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

	input.Title = strings.TrimSpace(input.Title)
	input.QtyLabel = strings.TrimSpace(input.QtyLabel)
	input.Location = strings.TrimSpace(input.Location)
	if input.Title == "" || input.QtyLabel == "" || input.Location == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title, quantity label, and location are required"})
		return
	}

	validCategories := map[string]bool{
		"furniture": true, "ewaste": true, "textiles": true, "construction": true,
		"organic": true, "plastic": true, "industrial": true, "other": true,
	}
	if !validCategories[input.Category] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category"})
		return
	}

	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User authentication required"})
		return
	}
	userIDInt, ok := userID.(int)
	if !ok || userIDInt <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authenticated user ID"})
		return
	}

	qtyNum := input.QtyNum
	if qtyNum <= 0 {
		qtyNum = 1
	}

	listing := models.Listing{
		UserID: userIDInt, Title: input.Title, Category: input.Category,
		Description: strings.TrimSpace(input.Description), PhotoUrl: input.PhotoURL,
		QtyLabel: input.QtyLabel, QtyNum: qtyNum, Condition: strings.TrimSpace(input.Condition),
		Location: input.Location, Status: "available", CreatedAt: time.Now(),
	}
	if err := h.Store.Create(&listing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create listing: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, listing)
}

func (h *ListingHandler) ClaimListing(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid listing ID"})
		return
	}
	userID, ok := c.Get("userID")
	claimantID, validUser := userID.(int)
	if !ok || !validUser || claimantID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User authentication required"})
		return
	}
	if err := h.Store.Claim(id, claimantID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Listing claimed successfully"})
}

func (h *ListingHandler) MarkCollected(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid listing ID"})
		return
	}
	userID, ok := c.Get("userID")
	actorID, validUser := userID.(int)
	if !ok || !validUser || actorID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User authentication required"})
		return
	}
	if err := h.Store.MarkCollected(id, actorID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Listing marked as collected successfully"})
}
