package main

import (
	"log"
	"net/http"
	"os"

	"dumptrade/db"
	"dumptrade/handlers"
	"dumptrade/middleware"

	"github.com/gin-gonic/gin"
)

func main() {
	// 1. Load environment variables from .env
	db.LoadEnv()

	// 2. Initialize the database connection pool
	if err := db.Connect(); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer db.Close()

	// 3. Run database migrations to ensure all tables and types exist
	if err := db.Migrate(); err != nil {
		log.Fatalf("Database migration failed: %v", err)
	}
	if err := db.Seed(); err != nil {
		log.Printf("Notice: DB seed skipped or failed: %v", err)
	}
	log.Println("Database connection pool established, migrations applied, and data seeded successfully")

	// 4. Configuration
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dumptrade-secret-key-12345"
	}

	// 5. Stores & Handlers
	userStore := handlers.NewPostgresUserStore()
	listingStore := handlers.NewPostgresListingStore()

	authHandler := handlers.NewAuthHandler(userStore, jwtSecret)
	listingHandler := handlers.NewListingHandler(listingStore)

	// 6. Router & Middleware
	router := gin.Default()
	router.Use(middleware.CORS())

	// Serve Frontend directly on http://localhost:8080/
	frontendDir := "../frontend"
	if _, err := os.Stat(frontendDir); err == nil {
		router.StaticFile("/", frontendDir+"/index.html")
		router.StaticFile("/index.html", frontendDir+"/index.html")
	}

	api := router.Group("/api")
	{
		// Health check
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "dumptrade-api"})
		})

		// Auth
		api.POST("/register", authHandler.Register)
		api.POST("/login", authHandler.Login)

		// Listings (Public read)
		api.GET("/listings", listingHandler.GetListings)
		api.GET("/listings/:id", listingHandler.GetListing)

		// Protected routes (Require valid JWT)
		protected := api.Group("")
		protected.Use(middleware.AuthRequired([]byte(jwtSecret)))
		{
			protected.POST("/listings", listingHandler.CreateListing)
			protected.POST("/listings/:id/claim", listingHandler.ClaimListing)
			protected.POST("/listings/:id/collect", listingHandler.MarkCollected)
		}
	}

	log.Printf("DumpTrade backend running on :%s\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
