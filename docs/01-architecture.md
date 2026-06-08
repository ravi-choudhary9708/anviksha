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
│                   EXPRESS.JS + WEBSOCKET SERVER                     │
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │              processTransaction() pipeline                │     │
│   │                                                           │     │
│   │  [1] extractFeatures()  ──→  19 behavioral signals       │     │
│   │  [2] scoreTransaction() ──→  XGBoost + IsoForest ONNX    │     │
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
│  SQLite Database │                    │    React Dashboard         │
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

### 1. Data Ingestion Layer

| Component | File | Purpose |
|-----------|------|---------|
| Transaction Generator | `server/generators/transaction-generator.js` | Emits synthetic UPI/NEFT/IMPS/ATM transactions on a timer |
| I4C Feed Generator | `server/generators/i4c-feed-generator.js` | Simulates I4C/NCRP regulatory blacklist updates |
| Seed Data Script | `server/generators/seed-data.js` | Populates DB with initial accounts and transactions for demo |

### 2. Backend Processing Layer

| Component | File | Purpose |
|-----------|------|---------|
| Entry Point | `server/index.js` | Express app, WebSocket server, pipeline orchestration |
| Database Layer | `server/db/index.js` | SQLite init, prepared statements for all CRUD |
| Feature Extractor | `server/ml/feature-extractor.js` | Computes 19 behavioral features per transaction |
| Scoring Engine | `server/ml/scoring-engine.js` | ONNX inference (XGBoost + IsoForest) with rule-based fallback |
| Graph Analyzer | `server/ml/graph-analyzer.js` | In-memory directed graph, fan-in/fan-out detection |
| Explainer | `server/ml/explainer.js` | Gemini API + template engine for AI case summaries |

### 3. ML Training Layer (Python, run once)

| Component | File | Purpose |
|-----------|------|---------|
| Training Script | `server/ml/train_model.py` | Generates data, trains XGBoost + IsoForest, exports to ONNX |
| XGBoost model | `server/ml/models/xgboost_fraud.onnx` | Fraud probability classifier |
| Isolation Forest | `server/ml/models/isolation_forest.onnx` | Anomaly detector |
| Feature config | `server/ml/models/feature_config.json` | Feature names, importance scores, thresholds |

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
[1] New transaction arrives (generator OR POST /api/transactions)
        │
        ▼
[2] extractFeatures(transaction, accountId)
    → Queries DB for last 1h and 24h transaction history
    → Queries graph for unique senders/receivers
    → Checks suspect registry for phone/UPI/account matches
    → Returns: Float32Array[19] + featureMap{key: value}
        │
        ▼
[3] scoreTransaction(features)
    IF onnx models loaded:
        → XGBoost inference → fraudProb (0.0–1.0)
        → IsolationForest inference → anomalyLabel (-1 or 1)
        → compositeScore = fraudProb × 100 + anomalyBoost
    ELSE (fallback):
        → ruleBasedScoring(featureMap)
        → compositeScore = weighted average of 4 sub-scores
        │
        ▼
[4] DB: INSERT INTO transactions (with risk_score, features_json)
    DB: INSERT INTO risk_scores (audit trail)
        │
        ▼
[5] updateGraph(transaction)
    → Update in-memory adjacency list
    → Recalculate fan-in/fan-out degrees
    → DB: UPSERT account_connections
        │
        ▼
[6] DB: UPDATE accounts SET risk_score = 0.3×newScore + 0.7×oldScore
        │
        ▼
[7] IF compositeScore >= 41:
    → DB: INSERT INTO alerts
    IF compositeScore >= 65:
        → generateExplanation() (Gemini API or template)
        │
        ▼
[8] broadcast('transaction', {...}) → all WebSocket clients
    broadcast('alert', {...})      → if alert was created
```

---

## Technology Choices & Rationale

| Decision | Choice | Why Not Alternative |
|----------|--------|---------------------|
| Database | SQLite (better-sqlite3) | No PostgreSQL install, synchronous API, perfect for hackathon |
| ML runtime | onnxruntime-node | No Python at runtime, universal format, 1ms inference |
| ML training | XGBoost | Industry standard for tabular fraud, handles class imbalance |
| Anomaly detection | Isolation Forest | Unsupervised — catches new fraud patterns without labels |
| GenAI | Gemini API | Free tier, excellent for structured prompts, fast |
| Realtime | WebSockets (ws) | Simpler than Socket.IO, works on same HTTP port |
| Frontend | React + Vite | Fast HMR, minimal config, modern ecosystem |
| Network graph | D3.js | Most powerful force graph library, full control |

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
