package handlers

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUploadHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uploadDir := t.TempDir()
	handler := NewUploadHandler(uploadDir)
	router := gin.New()
	router.POST("/uploads", handler.Upload)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	file, err := writer.CreateFormFile("photo", "waste.png")
	if err != nil {
		t.Fatal(err)
	}
	_, err = file.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d})
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/uploads", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		PhotoURL string `json:"photo_url"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(payload.PhotoURL, "/uploads/") {
		t.Fatalf("unexpected URL: %s", payload.PhotoURL)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, filepath.Base(payload.PhotoURL))); err != nil {
		t.Fatalf("uploaded file was not stored: %v", err)
	}
}

func TestUploadHandlerRejectsNonImage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewUploadHandler(t.TempDir())
	router := gin.New()
	router.POST("/uploads", handler.Upload)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	file, err := writer.CreateFormFile("photo", "notes.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, err = file.Write([]byte("not an image"))
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/uploads", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}
