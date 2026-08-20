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
	db.LoadEnv()

	if err := db.Connect(); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer db.Close()

	if err := db.Migrate(); err != nil {
		log.Fatalf("Database migration failed: %v", err)
	}
	if err := db.Seed(); err != nil {
		log.Printf("Notice: DB seed skipped or failed: %v", err)
	}
	log.Println("Database connection pool established, migrations applied, and data seeded successfully")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dumptrade-secret-key-12345"
	}

	userStore := handlers.NewPostgresUserStore()
	listingStore := handlers.NewPostgresListingStore()

	authHandler := handlers.NewAuthHandler(userStore, jwtSecret)
	listingHandler := handlers.NewListingHandler(listingStore)

	router := gin.Default()
	router.Use(middleware.CORS())

	frontendDir := "../frontend"
	if _, err := os.Stat(frontendDir); err == nil {
		router.StaticFile("/", frontendDir+"/index.html")
		router.StaticFile("/index.html", frontendDir+"/index.html")
		router.StaticFile("/browse.html", frontendDir+"/browse.html")
		router.StaticFile("/listing.html", frontendDir+"/listing.html")
		router.StaticFile("/post.html", frontendDir+"/post.html")
		router.StaticFile("/login.html", frontendDir+"/login.html")
		router.StaticFile("/register.html", frontendDir+"/register.html")
		router.Static("/css", frontendDir+"/css")
		router.Static("/js", frontendDir+"/js")
	}

	api := router.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "dumptrade-api"})
		})

		api.POST("/register", authHandler.Register)
		api.POST("/login", authHandler.Login)

		api.GET("/listings", listingHandler.GetListings)
		api.GET("/listings/:id", listingHandler.GetListing)

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