package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/segmentio/kafka-go"
)

type Config struct {
	KafkaBrokers []string
	KafkaTopic   string
	Port         string
}

func loadConfig() Config {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9092"
	}
	topic := os.Getenv("KAFKA_TOPIC")
	if topic == "" {
		topic = "raw_transactions"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return Config{
		KafkaBrokers: []string{brokers},
		KafkaTopic:   topic,
		Port:         port,
	}
}

// Known malicious JA3 TLS fingerprints (Botnets, Script Kiddies, Automated API attacks)
var blockedJA3Hashes = map[string]bool{
	"771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0": true, // TrickBot
	"771,4866-4867-4865-49196-49200-159-52393-52392-52394-49195-49199-158-49188-49192-107-49187-49191-103-49162-49172-57-49161-49171-51-157-156-53-47-255,0-11-10-35-22-23-13-43-45-51-21,29-23-30-25-24,0-1-2": true, // Mirai Variant
}

func main() {
	cfg := loadConfig()

	// Initialize Kafka Writer
	writer := &kafka.Writer{
		Addr:                   kafka.TCP(cfg.KafkaBrokers...),
		Topic:                  cfg.KafkaTopic,
		Balancer:               &kafka.LeastBytes{},
		AllowAutoTopicCreation: true,
	}
	defer writer.Close()

	log.Printf("[INGESTION] Starting Go microservice on port %s", cfg.Port)
	log.Printf("[INGESTION] Connecting to Kafka at %v, topic: %s", cfg.KafkaBrokers, cfg.KafkaTopic)

	http.HandleFunc("/api/ingest", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Error reading body", http.StatusBadRequest)
			return
		}

		// Quick sanity check (must be valid JSON, though we treat it mostly opaquely)
		var payload map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
			return
		}

		// LAYER 1: The Shield (JA3 TLS Fingerprinting)
		// Instantly drop automated botnet traffic without hitting the ML pipeline
		if ja3, ok := payload["ja3_fingerprint"].(string); ok {
			if blockedJA3Hashes[ja3] {
				log.Printf("[SECURITY] Dropped transaction. Malicious JA3 Fingerprint detected: %s", ja3)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"status":"rejected","reason":"Malicious TLS fingerprint detected (Layer 1 Shield)"}`))
				return
			}
		}

		// We use the transaction ID as the Kafka key if present, otherwise no key
		var key []byte
		if id, ok := payload["id"].(string); ok {
			key = []byte(id)
		}

		msg := kafka.Message{
			Key:   key,
			Value: body,
			Time:  time.Now(),
		}

		err = writer.WriteMessages(context.Background(), msg)
		if err != nil {
			log.Printf("[ERROR] Failed to write to Kafka: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Fast response
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"status":"accepted","message":"Transaction queued successfully"}`))
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: nil, // Use default ServeMux
	}

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[FATAL] Could not listen on %s: %v\n", cfg.Port, err)
	}
}
