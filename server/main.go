package main

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/storage"
)

//go:embed template.html
var templateHTML string

var (
	host     = getEnv("HOST", "0.0.0.0")
	port     = getEnv("PORT", "8765")
	version  = getEnv("VERSION", "dev")
	gitSHA   = getEnv("GIT_SHA", "unknown")
	cacheTTL = 1 * time.Hour
)

type CachedView struct {
	HTML      string
	Source    string
	Stats     Stats
	CreatedAt time.Time
}

type Stats struct {
	Success int `json:"success"`
	Pass    int `json:"pass"`
	Error   int `json:"error"`
	Fail    int `json:"fail"`
	Warn    int `json:"warn"`
	Skipped int `json:"skipped"`
	Total   int `json:"total"`
}

type RunResults struct {
	Results []struct {
		Status string `json:"status"`
	} `json:"results"`
}

var (
	viewCache = make(map[string]*CachedView)
	cacheMu   sync.RWMutex
	gcsClient *storage.Client
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func extractStats(data []byte) Stats {
	var results RunResults
	if err := json.Unmarshal(data, &results); err != nil {
		return Stats{}
	}

	stats := Stats{Total: len(results.Results)}
	for _, r := range results.Results {
		switch strings.ToLower(r.Status) {
		case "success":
			stats.Success++
		case "pass":
			stats.Pass++
		case "error":
			stats.Error++
		case "fail":
			stats.Fail++
		case "warn":
			stats.Warn++
		case "skipped":
			stats.Skipped++
		}
	}
	return stats
}

func generateHTML(data []byte, source string) string {
	html := strings.Replace(templateHTML, "%%DATA%%", string(data), 1)
	return strings.Replace(html, "%%SOURCE%%", source, 1)
}

func fetchFromGCS(ctx context.Context, gsURL string) ([]byte, error) {
	if !strings.HasPrefix(gsURL, "gs://") {
		return nil, fmt.Errorf("URL must start with gs://")
	}

	path := strings.TrimPrefix(gsURL, "gs://")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid GCS URL format")
	}

	bucket := parts[0]
	object := parts[1]

	log.Printf("Fetching: gs://%s/%s", bucket, object)

	rc, err := gcsClient.Bucket(bucket).Object(object).NewReader(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to open GCS object: %w", err)
	}
	defer rc.Close()

	return io.ReadAll(rc)
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"version": version,
		"git_sha": gitSHA,
	})
}

func viewsHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)
	w.Header().Set("Content-Type", "application/json")

	cacheMu.RLock()
	defer cacheMu.RUnlock()

	now := time.Now()
	views := []map[string]any{}

	for id, v := range viewCache {
		if now.Sub(v.CreatedAt) < cacheTTL {
			views = append(views, map[string]any{
				"id":         id,
				"source":     v.Source,
				"stats":      v.Stats,
				"created":    v.CreatedAt.Unix(),
				"expires_in": int(cacheTTL.Seconds() - now.Sub(v.CreatedAt).Seconds()),
			})
		}
	}

	json.NewEncoder(w).Encode(map[string]any{"views": views})
}

func viewHandler(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/view/")
	viewID := strings.Split(path, "?")[0]

	cacheMu.RLock()
	v, exists := viewCache[viewID]
	cacheMu.RUnlock()

	if !exists || time.Since(v.CreatedAt) >= cacheTTL {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("<h1>View not found or expired</h1>"))
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(v.HTML))
}

func createViewHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	if !strings.HasPrefix(req.URL, "gs://") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "URL must start with gs://"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	data, err := fetchFromGCS(ctx, req.URL)
	if err != nil {
		log.Printf("GCS fetch error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	var js json.RawMessage
	if err := json.Unmarshal(data, &js); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON in GCS file"})
		return
	}

	html := generateHTML(data, req.URL)
	stats := extractStats(data)

	hash := sha256.Sum256([]byte(fmt.Sprintf("%s%d", req.URL, time.Now().UnixNano())))
	viewID := fmt.Sprintf("%x", hash[:6])

	cacheMu.Lock()
	viewCache[viewID] = &CachedView{
		HTML:      html,
		Source:    req.URL,
		Stats:     stats,
		CreatedAt: time.Now(),
	}
	cacheMu.Unlock()

	log.Printf("Created view %s for %s", viewID, req.URL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"id": viewID})
}

func main() {
	ctx := context.Background()

	var err error
	gcsClient, err = storage.NewClient(ctx)
	if err != nil {
		log.Fatalf("Failed to create GCS client: %v", err)
	}
	defer gcsClient.Close()

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/views", viewsHandler)
	http.HandleFunc("/view/", viewHandler)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			createViewHandler(w, r)
		} else {
			http.NotFound(w, r)
		}
	})

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Server running on http://%s", addr)
	log.Printf("POST {\"url\": \"gs://...\"} to create visualization")

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
