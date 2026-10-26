# 01 — System Architecture

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [High-Level Overview](#high-level-overview)
- [Component Breakdown](#component-breakdown)
- [Data Flow](#data-flow)
- [Technology Choices & Rationale](#technology-choices--rationale)
- [Scalability Notes](#scalability-notes)

---

## High-Level Overview

Anviksha follows a **streaming pipeline architecture** where every transaction is processed through a series of stages — ingestion, feature extraction, ML scoring, alert generation, and real-time broadcast — all orchestrated by a single Node.js process.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA SOURCES                                  │
│   Transaction Generator    I4C Feed          Bank TMS Alerts        │
│   (UPI/NEFT/IMPS/ATM)     (NCRP/1930)      (Internal flags)        │
└──────────────┬──────────────────┬────────────────┬──────────────────┘
               │                  │                │
               ▼                  ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   GO INGESTION SERVICE (PORT 8080)                  │
│   [Layer 1 Shield] Drops botnets/malicious JA3 TLS fingerprints     │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    REDPANDA (KAFKA) MESSAGE BROKER                  │
│                    Topic: raw_transactions                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   NODE.JS (EXPRESS + WEBSOCKETS)                    │
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │              processTransaction() pipeline                │     │
│   │                                                           │     │
│   │  [0] kafkaConsumer()    ──→  Listen to raw_transactions  │     │
│   │  [1] extractFeatures()  ──→  18 BOI golden signals        │     │
│   │  [2] scoreTransaction() ──→  Two-Stage ONNX + IsoForest   │     │
│   │  [3] updateGraph()      ──→  Fan-in / fan-out analysis    │     │
│   │  [4] insertRiskScore()  ──→  SQLite audit trail           │     │
│   │  [5] updateAccount()    ──→  EMA risk score update        │     │
│   │  [6] generateAlert()    ──→  if score ≥ 41               │     │
│   │  [7] generateExplain()  ──→  Gemini AI (if score ≥ 65)   │     │
│   │  [8] broadcast()        ──→  WebSocket to dashboard       │     │
│   └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│   REST API Routes (/api/*)                                          │
└─────────────────────────────────────────────────────────────────────┘
          │                                          │
          ▼                                          ▼
┌──────────────────┐                    ┌────────────────────────────┐
│  SQLite / Redis  │                    │    React Dashboard         │
│                  │                    │    (Vite + D3 + Recharts)  │
│  accounts        │                    │                            │
│  transactions    │                    │  Live Feed (WebSocket)     │
│  alerts          │                    │  Flagged Accounts          │
│  suspect_registry│                    │  Network Graph (D3.js)     │
│  risk_scores     │                    │  Analytics (Recharts)      │
│  account_conns   │                    │  Regulatory Feeds          │
└──────────────────┘                    └────────────────────────────┘
```

---

## Component Breakdown

### 1. Data Ingestion & Event Layer

| Component | File | Purpose |
|-----------|------|---------|
| Transaction Generator | `server/generators/transaction-generator.js` | Emits synthetic transactions on a timer and POSTs to Go Ingest |
| Go Ingestion Service | `ingestion-service/main.go` | Layer 1 Shield: drops bad JA3 TLS hashes, publishes to Kafka |
| Redpanda (Kafka) | `docker-compose.yml` | Event broker for decoupling ingestion from processing |
| I4C Feed Generator | `server/generators/i4c-feed-generator.js` | Simulates I4C/NCRP regulatory blacklist updates |
| Seed Data Script | `server/generators/seed-data.js` | Populates DB with initial accounts and transactions for demo |

### 2. Backend Processing Layer

| Component | File | Purpose |
|-----------|------|---------|
| Entry Point | `server/index.js` | Express app, WebSocket server, pipeline orchestration |
| Kafka Consumer | `server/kafka-consumer.js` | Reads from Redpanda with automatic graceful offline fallback |
| Database Layer | `server/db/index.js` | Node.js native `node:sqlite` DatabaseSync init, zero native C++ build tools |
| Feature Extractor | `server/ml/feature-extractor.js` | Computes 18 BOI golden tabular features per transaction |
| Scoring Engine | `server/ml/scoring-engine.js` | Two-Stage ONNX inference (Stage 1 + Stage 2) + IsoForest + rule fallback |
| Graph Analyzer | `server/ml/graph-analyzer.js` | In-memory directed graph, fan-in/fan-out detection |
| Explainer | `server/ml/explainer.js` | Gemini API + template engine for AI case summaries |

### 3. ML Training Layer (Python, run once)

| Component | File | Purpose |
|-----------|------|---------|
| Training Script | `server/ml/train_model.py` & `cdac_ml_proof_and_precision.py` | Trains XGBoost + IsoForest and generates objective forensic proof on C-DAC dataset |
| XGBoost model | `server/ml/models/xgboost_fraud.onnx` | Trained tabular behavioral model exported to ONNX |
| Isolation Forest | `server/ml/models/isolation_forest.onnx` | Unsupervised anomaly detector |
| Feature config | `server/ml/models/feature_config.json` | 20 features metadata, importance scores, and thresholds |
| Forensic Audit | `server/ml/models/cdac_forensic_audit_25cases.json` | 25-case audit with FIFO dwell times, evidence codes, and proof chains |
| Proof Summary | `server/ml/models/cdac_ml_precision_summary.json` | Objective metrics: ROC-AUC 0.9375, PR-AUC 0.8581, Specificity 85.0%, Margin +28.1 pts |

### 4. API Layer

| Router | File | Routes |
|--------|------|--------|
| Transactions | `server/routes/transactions.js` | CRUD + ML scoring trigger |
| Accounts | `server/routes/accounts.js` | Profiles, freeze/unfreeze |
| Alerts | `server/routes/alerts.js` | Alert queue management |
| Dashboard | `server/routes/dashboard.js` | Aggregated stats, graph, timeline |
| Regulatory | `server/routes/regulatory.js` | Suspect registry management |

### 5. Frontend Layer

| Component | File | Purpose |
|-----------|------|---------|
| App Shell | `client/src/App.jsx` | WebSocket connection, tab navigation, global state |
| Design System | `client/src/index.css` | CSS tokens: colors, typography, glassmorphism |
| Header | `client/src/components/Header.jsx` | Live indicator, stats bar |
| UI primitives | `client/src/components/ui.jsx` | RiskBadge, StatCard, TransactionRow |
| Live Feed | `client/src/pages/LiveFeed.jsx` | Real-time transaction stream |
| Flagged Accounts | `client/src/pages/FlaggedAccounts.jsx` | Risk-sorted table with expandable details |
| Network Graph | `client/src/pages/NetworkGraph.jsx` | D3.js force-directed graph |
| Analytics | `client/src/pages/Analytics.jsx` | Recharts histograms, pie charts, line charts |
| Regulatory | `client/src/pages/RegulatoryFeeds.jsx` | I4C/NCRP feed status |

---

## Data Flow

### Transaction Processing Flow

```
[1] New transaction generated by transaction-generator.js
        │
        ▼
[2] POST /api/ingest on Go Ingestion Service (Port 8080)
    → Checks JA3 TLS fingerprint. Drops if malicious (HTTP 403).
    → Publishes valid transaction to Redpanda (Kafka)
        │
        ▼
[3] Node.js Kafka Consumer reads from 'raw_transactions' topic
    (Falls back seamlessly to direct local ingestion if Kafka is offline)
        │
        ▼
[4] extractFeatures(transaction, accountId)
    → Queries DB for 1h/24h velocity and dormancy awakenings
    → Queries graph for fan-in/fan-out degrees and pass-through speed
    → Checks suspect registry for phone/UPI/account matches
    → Returns: Float32Array[18] (BOI Golden Features) + featureMap{key: value}
        │
        ▼
[5] scoreTransaction(features)
    IF onnx models loaded:
        → XGBoost Classifier: Evaluates structural ratios & velocity bursts
        → Isolation Forest: Unsupervised anomaly detection (catches novel zero-day patterns)
        → Graph & FIFO multiplier: Adjusts risk score based on holding time & syndication bridges
        → compositeScore = 0 to 100 normalized risk score
    ELSE (fallback):
        → ruleBasedScoring(featureMap)
        → compositeScore = weighted average of 4 forensic sub-scores (Velocity, Behavioral, Graph, Regulatory)
        │
        ▼
[6] DB: INSERT INTO transactions (with risk_score, features_json)
    DB: INSERT INTO risk_scores (audit trail)
        │
        ▼
[7] updateGraph(transaction)
    → Update in-memory adjacency list
    → Recalculate fan-in/fan-out degrees
    → DB: UPSERT account_connections
        │
        ▼
[8] DB: UPDATE accounts SET risk_score = 0.3×newScore + 0.7×oldScore
        │
        ▼
[9] IF compositeScore >= 41:
    → DB: INSERT INTO alerts
    IF compositeScore >= 65:
        → generateExplanation() (Gemini API or template)
        │
        ▼
[10] broadcast('transaction', {...}) → all WebSocket clients
     broadcast('alert', {...})      → if alert was created
```

---

## Technology Choices & Rationale

| Decision | Choice | Why Not Alternative |
|----------|--------|---------------------|
| Database | Node.js native `node:sqlite` (`DatabaseSync`) | Zero external native dependencies, no C++ compilation, eliminates Windows node-gyp / prebuild-install issues |
| ML Architecture | Two-Stage Hierarchical Classification | Overcomes 111:1 extreme class imbalance: Stage 1 achieves 96.3% recall, Stage 2 achieves 94.8% precision with 0 innocent false freezes |
| ML runtime | onnxruntime-node | Zero Python runtime footprint in production, cross-platform, sub-millisecond execution (<1ms) |
| ML models | XGBoost + Isolation Forest | XGBoost handles non-linear tabular BOI features; Isolation Forest catches zero-day anomalous patterns without labels |
| GenAI | Gemini API (with template fallback) | Low latency, highly structured explanations for banking AML officers; graceful fallback ensures offline resilience |
| Realtime | WebSockets (`ws`) | Native, zero bloat, multiplexed on the Express HTTP server |
| Frontend | React + Vite | Fast HMR, minimal config, modern component ecosystem |
| Network graph | D3.js force simulation | Granular control over interactive physics, node clustering, and fan-in/fan-out highlighting |

---

## Scalability Notes

The current architecture is optimized for hackathon demonstration. For production:

| Current | Production Upgrade |
|---------|-------------------|
| SQLite | PostgreSQL or TimescaleDB (for time-series queries) |
| In-memory event emitters | Apache Kafka or Redis Streams |
| Single Node.js process | Separate microservices (ingestion, scoring, notification) |
| In-memory graph | Neo4j or a dedicated graph database |
| Synthetic data generator | Real banking core system integration (CBS/SWITCH) |
| ONNX on same process | Dedicated ML inference service (Triton Inference Server) |
