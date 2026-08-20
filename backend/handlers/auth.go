package handlers

import (
	"net/http"
	"time"

	"dumptrade/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type UserStore interface {
	GetByEmail(email string) (*models.User, error)
	GetByID(id int) (*models.User, error)
	Create(user *models.User) error
}

type AuthHandler struct {
	Store     UserStore
	JWTSecret []byte
}

func NewAuthHandler(store UserStore, secret string) *AuthHandler {
	return &AuthHandler{
		Store:     store,
		JWTSecret: []byte(secret),
	}
}

type RegisterInput struct {
	Name        string `json:"name" binding:"required"`
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=6"`
	AccountType string `json:"account_type" binding:"required"`
	Location    string `json:"location"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) generateToken(user *models.User) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":          user.ID,
		"email":        user.Email,
		"account_type": user.AccountType,
		"exp":          time.Now().Add(time.Hour * 24 * 7).Unix(), // 7 days
	})
	return token.SignedString(h.JWTSecret)
}

func (h *AuthHandler) Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.AccountType != "individual" && input.AccountType != "organization" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_type must be 'individual' or 'organization'"})
		return
	}

	existing, err := h.Store.GetByEmail(input.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check email availability"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := &models.User{
		Name:         input.Name,
		Email:        input.Email,
		PasswordHash: string(hashedPassword),
		AccountType:  input.AccountType,
		Location:     input.Location,
		CreatedAt:    time.Now(),
	}

	if err := h.Store.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	tokenString, err := h.generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate authentication token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "User registered successfully",
		"token":   tokenString,
		"user": gin.H{
			"id":           user.ID,
			"name":         user.Name,
			"email":        user.Email,
			"account_type": user.AccountType,
			"location":     user.Location,
			"created_at":   user.CreatedAt,
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.Store.GetByEmail(input.Email)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	tokenString, err := h.generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"user": gin.H{
			"id":           user.ID,
			"name":         user.Name,
			"email":        user.Email,
			"account_type": user.AccountType,
			"location":     user.Location,
			"created_at":   user.CreatedAt,
		},
	})
}
