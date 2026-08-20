package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestAuthRequiredMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := []byte("test-secret-key")

	tests := []struct {
		name           string
		authHeader     string
		expectedStatus int
		expectUserID   int
	}{
		{
			name:           "missing auth header",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "malformed auth header",
			authHeader:     "Basic 12345",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "invalid jwt token",
			authHeader:     "Bearer invalid.jwt.token",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "token signed with wrong secret",
			authHeader: func() string {
				tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
					"sub": 1,
					"exp": time.Now().Add(time.Hour).Unix(),
				})
				s, _ := tok.SignedString([]byte("wrong-secret"))
				return "Bearer " + s
			}(),
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "expired token",
			authHeader: func() string {
				tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
					"sub": 1,
					"exp": time.Now().Add(-time.Hour).Unix(),
				})
				s, _ := tok.SignedString(secret)
				return "Bearer " + s
			}(),
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "valid token",
			authHeader: func() string {
				tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
					"sub":          42,
					"email":        "test@example.com",
					"account_type": "individual",
					"exp":          time.Now().Add(time.Hour).Unix(),
				})
				s, _ := tok.SignedString(secret)
				return "Bearer " + s
			}(),
			expectedStatus: http.StatusOK,
			expectUserID:   42,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var recordedUserID int
			router := gin.New()
			router.Use(AuthRequired(secret))
			router.GET("/test", func(c *gin.Context) {
				if val, exists := c.Get("userID"); exists {
					recordedUserID = val.(int)
				}
				c.Status(http.StatusOK)
			})

			w := httptest.NewRecorder()
			req, _ := http.NewRequest(http.MethodGet, "/test", nil)
			if tc.authHeader != "" {
				req.Header.Set("Authorization", tc.authHeader)
			}

			router.ServeHTTP(w, req)

			if w.Code != tc.expectedStatus {
				t.Fatalf("expected status %d, got %d, body: %s", tc.expectedStatus, w.Code, w.Body.String())
			}

			if tc.expectedStatus == http.StatusOK && recordedUserID != tc.expectUserID {
				t.Fatalf("expected userID %d, got %d", tc.expectUserID, recordedUserID)
			}
		})
	}
}

func TestCORSMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORS())
	router.GET("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// Test regular GET request
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("unexpected CORS origin: %s", w.Header().Get("Access-Control-Allow-Origin"))
	}

	// Test OPTIONS preflight request
	wOpt := httptest.NewRecorder()
	reqOpt, _ := http.NewRequest(http.MethodOptions, "/test", nil)
	router.ServeHTTP(wOpt, reqOpt)

	if wOpt.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for OPTIONS, got %d", wOpt.Code)
	}
}
