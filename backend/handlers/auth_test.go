package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"dumptrade/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type mockUserStore struct {
	users map[string]*models.User
}

func newMockUserStore() *mockUserStore {
	return &mockUserStore{users: make(map[string]*models.User)}
}

func (m *mockUserStore) GetByEmail(email string) (*models.User, error) {
	if email == "db_error@example.com" {
		return nil, errors.New("db connection failure")
	}
	u, ok := m.users[email]
	if !ok {
		return nil, nil
	}
	return u, nil
}

func (m *mockUserStore) GetByID(id int) (*models.User, error) {
	for _, u := range m.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, nil
}

func (m *mockUserStore) Create(u *models.User) error {
	if u.Email == "create_error@example.com" {
		return errors.New("insert failed")
	}
	u.ID = len(m.users) + 1
	m.users[u.Email] = u
	return nil
}

func TestAuthHandler_Register(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newMockUserStore()
	h := NewAuthHandler(store, "secret123")

	router := gin.New()
	router.POST("/register", h.Register)

	t.Run("successful register", func(t *testing.T) {
		body, _ := json.Marshal(RegisterInput{
			Name:        "Test User",
			Email:       "test@example.com",
			Password:    "password123",
			AccountType: "individual",
			Location:    "Nairobi",
		})
		req, _ := http.NewRequest(http.MethodPost, "/register", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}

		var res map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &res)
		if res["token"] == nil || res["token"] == "" {
			t.Fatal("expected token in response")
		}
	})

	t.Run("duplicate email", func(t *testing.T) {
		body, _ := json.Marshal(RegisterInput{
			Name:        "Test User",
			Email:       "test@example.com",
			Password:    "password123",
			AccountType: "individual",
		})
		req, _ := http.NewRequest(http.MethodPost, "/register", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("invalid account type", func(t *testing.T) {
		body, _ := json.Marshal(RegisterInput{
			Name:        "Test User",
			Email:       "test2@example.com",
			Password:    "password123",
			AccountType: "alien",
		})
		req, _ := http.NewRequest(http.MethodPost, "/register", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", w.Code)
		}
	})

	t.Run("short password", func(t *testing.T) {
		body, _ := json.Marshal(RegisterInput{
			Name:        "Test User",
			Email:       "test3@example.com",
			Password:    "123",
			AccountType: "individual",
		})
		req, _ := http.NewRequest(http.MethodPost, "/register", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", w.Code)
		}
	})
}

func TestAuthHandler_Login(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newMockUserStore()
	hashed, _ := bcrypt.GenerateFromPassword([]byte("secretpassword"), bcrypt.DefaultCost)
	store.users["alice@example.com"] = &models.User{
		ID:           1,
		Name:         "Alice",
		Email:        "alice@example.com",
		PasswordHash: string(hashed),
		AccountType:  "organization",
		CreatedAt:    time.Now(),
	}

	h := NewAuthHandler(store, "secret123")
	router := gin.New()
	router.POST("/login", h.Login)

	t.Run("successful login", func(t *testing.T) {
		body, _ := json.Marshal(LoginInput{
			Email:    "alice@example.com",
			Password: "secretpassword",
		})
		req, _ := http.NewRequest(http.MethodPost, "/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &res)
		if res["token"] == nil || res["token"] == "" {
			t.Fatal("expected token in login response")
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		body, _ := json.Marshal(LoginInput{
			Email:    "alice@example.com",
			Password: "wrongpassword",
		})
		req, _ := http.NewRequest(http.MethodPost, "/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("user not found", func(t *testing.T) {
		body, _ := json.Marshal(LoginInput{
			Email:    "nonexistent@example.com",
			Password: "password123",
		})
		req, _ := http.NewRequest(http.MethodPost, "/login", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})
}
