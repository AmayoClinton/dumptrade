package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

const maxUploadBytes int64 = 5 * 1024 * 1024

type UploadHandler struct {
	UploadDir string
}

func NewUploadHandler(uploadDir string) *UploadHandler {
	return &UploadHandler{UploadDir: uploadDir}
}

func imageExtension(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/gif":
		return ".gif", true
	case "image/webp":
		return ".webp", true
	default:
		return "", false
	}
}

func randomFilename(extension string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes) + extension, nil
}

func (h *UploadHandler) Upload(c *gin.Context) {
	fileHeader, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A photo file is required"})
		return
	}
	if fileHeader.Size <= 0 || fileHeader.Size > maxUploadBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Photo must be between 1 byte and 5 MB"})
		return
	}

	source, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not read the uploaded photo"})
		return
	}
	defer source.Close()

	header := make([]byte, 512)
	read, err := io.ReadFull(source, header)
	if err != nil && err != io.ErrUnexpectedEOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not inspect the uploaded photo"})
		return
	}
	extension, valid := imageExtension(http.DetectContentType(header[:read]))
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Photo must be a PNG, JPG, GIF, or WebP image"})
		return
	}

	if err := os.MkdirAll(h.UploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not prepare image storage"})
		return
	}
	filename, err := randomFilename(extension)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save the uploaded photo"})
		return
	}
	destinationPath := filepath.Join(h.UploadDir, filename)
	destination, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save the uploaded photo"})
		return
	}

	_, writeErr := destination.Write(header[:read])
	if writeErr == nil {
		_, writeErr = io.Copy(destination, io.LimitReader(source, maxUploadBytes-int64(read)+1))
	}
	closeErr := destination.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(destinationPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save the uploaded photo"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"photo_url": path.Join("/uploads", filename)})
}
