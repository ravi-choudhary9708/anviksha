# 00 — Project Overview & File Structure

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [What is Anviksha?](#what-is-anviksha)
- [Key Features](#key-features)
- [Design Principles](#design-principles)
- [Project File Structure](#project-file-structure)
- [Documentation Index](#documentation-index)

---

## What is Anviksha?

**Anviksha** (Sanskrit: "investigation", "inquiry") is a real-time mule account detection platform built to solve the problem of financial mule networks — accounts used as intermediaries to launder fraud proceeds.

It processes a continuous stream of transactions and evaluates them in real time using a combination of behavioral features, graph network analysis, machine learning (XGBoost + Isolation Forest via ONNX), and Generative AI (Google Gemini).

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Real-time Ingestion** | Consumes simulated UPI, NEFT, IMPS, ATM transactions every 2 seconds |
| **ML Scoring** | XGBoost + Isolation Forest (ONNX) scores each transaction 0–100 |
| **19 Behavioral Features** | Extracts velocity, behavioral, account, graph, and regulatory signals |
| **Graph Analysis** | Fan-in/fan-out detection, layering chains, clustering coefficients |
| **GenAI Explanations** | Gemini API generates case summaries for flagged accounts |
| **Regulatory Integration** | Simulates I4C/NCRP/1930 suspect registry feeds |
| **Live Dashboard** | React app with WebSocket-driven real-time updates and D3.js visualization |
| **Zero Config DB** | SQLite — no PostgreSQL install required |

---

## Design Principles

- **Hackathon-first**: Runs with `npm run dev` + `python train_model.py`, no Docker/Kafka/Redis required. Easy to deploy and demo.
- **Graceful Degradation**: Falls back to rule-based scoring if ONNX models not found; falls back to template explanations if Gemini key not set. The demo will always work.
- **Transparent ML**: Sub-scores (velocity, behavioral, graph, regulatory) are always computed and shown alongside ONNX output.
- **Premium UI**: Dark mode, glassmorphism, responsive design, and real-time animations to wow the judges.

---

## Project File Structure

The project is structured as a monorepo containing both the backend and frontend.

```
mule/                                   ← Project root
├── package.json                        ← Root package (server deps + scripts)
├── .env                                ← Environment variables (create this)
├── .env.example                        ← Template for .env
├── .gitignore
├── AI_HANDOVER.md                      ← AI agent handover guide
├── README.md                           ← Quick start README
├── docs/                               ← Dedicated documentation folder
│   ├── 00-project-overview.md
│   ├── 01-architecture.md
│   ├── 02-database.md
│   ├── 03-ml-training.md
│   ├── 04-api-reference.md
│   ├── 05-websocket.md
│   ├── 06-running-and-setup.md
│   ├── 07-graph-analysis.md
│   ├── 08-genai-explainer.md
│   ├── 09-dashboard.md
│   ├── 10-generators.md
│   ├── 11-troubleshooting.md
│   ├── 12-demo-script.md
│   └── images/                         ← Diagrams and screenshots
│
├── data/
│   └── anviksha.db                     ← SQLite database (auto-created on first run)
│
├── server/                             ← Node.js backend
│   ├── index.js                        ← Main entry point: Express + WebSocket
│   │
│   ├── db/
│   │   ├── index.js                    ← DB initialization + prepared statements
│   │   └── schema.sql                  ← Table definitions
│   │
│   ├── generators/
│   │   ├── transaction-generator.js    ← Simulates live UPI/NEFT/IMPS stream
│   │   ├── i4c-feed-generator.js       ← Simulates I4C regulatory feed updates
│   │   └── seed-data.js                ← Populates DB with initial data
│   │
│   ├── ml/
│   │   ├── feature-extractor.js        ← Extracts 19 behavioral features
│   │   ├── scoring-engine.js           ← ONNX inference + rule-based fallback
│   │   ├── graph-analyzer.js           ← In-memory transaction graph
│   │   ├── explainer.js                ← Gemini API + template fallback
│   │   ├── train_model.py              ← Python: train XGBoost + IsolationForest
│   │   └── models/                     ← ONNX models (created after training)
│   │       ├── xgboost_fraud.onnx
│   │       ├── isolation_forest.onnx
│   │       └── feature_config.json
│   │
│   └── routes/                         ← API route controllers
│       ├── transactions.js
│       ├── accounts.js
│       ├── alerts.js
│       ├── dashboard.js
│       └── regulatory.js
│
└── client/                             ← React frontend
    ├── package.json                    ← Client-specific deps (React, D3, Recharts)
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx                    ← React entry point
        ├── App.jsx                     ← Root component, WebSocket connection, tabs
        ├── index.css                   ← Global design system tokens
        ├── components/
        │   ├── Header.jsx              ← App header with live indicator + stats
        │   └── ui.jsx                  ← RiskBadge, StatCard, TransactionRow
        └── pages/
            ├── LiveFeed.jsx            ← Real-time transaction stream
            ├── FlaggedAccounts.jsx     ← Accounts sorted by risk score
            ├── NetworkGraph.jsx        ← D3.js force-directed graph
            ├── Analytics.jsx           ← Recharts dashboards
            └── RegulatoryFeeds.jsx     ← I4C/NCRP feed status
```

---

## Documentation Index

Read the documentation in the `docs/` folder in the following logical order for a complete understanding of the system:

1. **`00-project-overview.md`** - You are here.
2. **`01-architecture.md`** - System design, tech stack, data flow.
3. **`02-database.md`** - SQLite schema, tables, and seeding logic.
4. **`03-ml-training.md`** - **CRITICAL:** How to train the ML models, export ONNX, and the 19 behavioral features.
5. **`04-api-reference.md`** - REST API endpoints.
6. **`05-websocket.md`** - Real-time WebSocket events.
7. **`06-running-and-setup.md`** - Commands to run the project.
8. **`07-graph-analysis.md`** - The network graph engine.
9. **`08-genai-explainer.md`** - Gemini API integration.
10. **`09-dashboard.md`** - React dashboard UI structure.
11. **`10-generators.md`** - Mock data generators.
12. **`11-troubleshooting.md`** - Error fixes.
13. **`12-demo-script.md`** - Pitch script for hackathon judges.
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
| Kafka Consumer | `server/kafka-consumer.js` | Reads from Redpanda and feeds ML engine |
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
[1] New transaction generated by transaction-generator.js
        │
        ▼
[2] POST /api/ingest on Go Ingestion Service (Port 8080)
    → Checks JA3 TLS fingerprint. Drops if malicious (HTTP 403).
    → Publishes valid transaction to Redpanda (Kafka)
        │
        ▼
[3] Node.js Kafka Consumer reads from 'raw_transactions' topic
        │
        ▼
[4] extractFeatures(transaction, accountId)
    → Queries DB for last 1h and 24h transaction history
    → Queries graph for unique senders/receivers
    → Checks suspect registry for phone/UPI/account matches
    → Returns: Float32Array[19] + featureMap{key: value}
        │
        ▼
[5] scoreTransaction(features)
    IF onnx models loaded:
        → XGBoost inference → fraudProb (0.0–1.0)
        → IsolationForest inference → anomalyLabel (-1 or 1)
        → compositeScore = fraudProb × 100 + anomalyBoost
    ELSE (fallback):
        → ruleBasedScoring(featureMap)
        → compositeScore = weighted average of 4 sub-scores
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
# 02 — Database: Schema, Seeding & Queries

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Database Engine](#database-engine)
- [Initialization](#initialization)
- [Table Schemas](#table-schemas)
- [Relationships](#relationships)
- [Seeding the Database](#seeding-the-database)
- [Prepared Statements Reference](#prepared-statements-reference)
- [Common Queries](#common-queries)
- [Reset & Re-seed](#reset--re-seed)

---

## Database Engine

**SQLite** via the `better-sqlite3` npm package.

Why SQLite?
- **Zero installation** — no PostgreSQL, MySQL, or Docker required
- **Synchronous API** — no async/await complexity in DB operations
- **File-based** — the entire database is `data/anviksha.db` (easy to inspect, reset, backup)
- **Fast** — `better-sqlite3` is the fastest SQLite binding for Node.js
- **Hackathon-perfect** — anyone can clone and run without DB setup

The database file is created automatically at `data/anviksha.db` on first server startup.

---

## Initialization

`server/db/index.js` handles:
1. Creating the `data/` directory if it doesn't exist
2. Opening/creating the SQLite file
3. Running `schema.sql` to create all tables (uses `CREATE TABLE IF NOT EXISTS`)
4. Creating all prepared statements for fast repeated queries
5. Exporting: `db` (raw connection) and `stmts` (all prepared statements)

```javascript
import { db, stmts } from './db/index.js';

// Use prepared statements for all operations:
const account = stmts.getAccount.get(accountId);
stmts.insertTransaction.run(transaction);
stmts.updateAccountRisk.run({ risk_score: 75.2, status: 'flagged', id: accountId });
```

---

## Table Schemas

### `accounts` — Bank accounts being monitored

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id               TEXT PRIMARY KEY,          -- UUID
  account_number   TEXT NOT NULL UNIQUE,      -- 10-digit number
  account_holder   TEXT NOT NULL,             -- Full name
  ifsc_code        TEXT NOT NULL,             -- e.g. BKID0001234
  bank_name        TEXT NOT NULL,             -- e.g. Bank of India
  upi_id           TEXT,                      -- e.g. ravi23@oksbi
  phone            TEXT,                      -- +91XXXXXXXXXX
  account_type     TEXT DEFAULT 'savings',    -- savings / current / salary
  kyc_status       TEXT DEFAULT 'verified',   -- verified / pending / failed
  opened_date      TEXT,                      -- ISO datetime
  risk_score       REAL DEFAULT 0,            -- Current score 0-100
  status           TEXT DEFAULT 'active',     -- active / under_review / flagged / frozen
  is_mule          INTEGER DEFAULT 0,         -- Ground truth: 0=normal, 1=mule (hidden in UI)
  created_at       TEXT DEFAULT (datetime('now'))
);
```

**Key columns:**
- `risk_score` is updated via EMA every time a new transaction is scored: `newScore = 0.3 × txnScore + 0.7 × prevScore`
- `status` transitions: `active` → `under_review` (score ≥ 41) → `flagged` (score ≥ 71) → `frozen` (manual)
- `is_mule` is the hidden ground truth label set during seeding — not shown in the UI, used for evaluation

---

### `transactions` — All financial transactions

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id                   TEXT PRIMARY KEY,       -- UUID
  txn_ref              TEXT NOT NULL UNIQUE,   -- Bank reference (TXN20260608...)
  type                 TEXT NOT NULL,          -- UPI / NEFT / IMPS / ATM / RTGS
  amount               REAL NOT NULL,          -- Amount in ₹
  sender_account_id    TEXT NOT NULL,          -- FK → accounts.id
  receiver_account_id  TEXT NOT NULL,          -- FK → accounts.id
  channel              TEXT DEFAULT 'digital', -- digital / branch / atm
  description          TEXT,                   -- Payment note
  timestamp            TEXT DEFAULT (datetime('now')),
  risk_score           REAL DEFAULT 0,         -- ML score for this specific transaction
  is_flagged           INTEGER DEFAULT 0,      -- 1 if score >= 41
  features_json        TEXT,                   -- JSON of all 19 extracted features
  ml_scores_json       TEXT                    -- JSON: {velocity, behavioral, graph, regulatory, anomaly}
);
```

**Key columns:**
- `features_json` stores all 19 feature values at the time of scoring — used for explainability
- `ml_scores_json` stores the sub-scores breakdown for the analytics dashboard
- `is_flagged` is pre-computed (score ≥ 41) for fast filtering queries

---

### `alerts` — Escalated fraud alerts

```sql
CREATE TABLE IF NOT EXISTS alerts (
  id              TEXT PRIMARY KEY,
  alert_type      TEXT DEFAULT 'ml_flag',   -- ml_flag / regulatory / analyst
  severity        TEXT DEFAULT 'medium',    -- medium / high / critical
  account_id      TEXT NOT NULL,            -- FK → accounts.id
  txn_id          TEXT,                     -- FK → transactions.id (nullable for account-level alerts)
  title           TEXT NOT NULL,            -- Short headline
  description     TEXT,                     -- Detailed description
  ai_explanation  TEXT,                     -- Gemini or template text
  status          TEXT DEFAULT 'open',      -- open / acknowledged / resolved
  created_at      TEXT DEFAULT (datetime('now'))
);
```

**Severity thresholds:**
- `medium`: score 41–54
- `high`: score 55–70
- `critical`: score ≥ 71

**`ai_explanation`** is populated for score ≥ 65 by `server/ml/explainer.js`. For lower scores it's left null and the description text is used.

---

### `suspect_registry` — I4C/NCRP/1930 blacklist

```sql
CREATE TABLE IF NOT EXISTS suspect_registry (
  id                TEXT PRIMARY KEY,
  identifier_type   TEXT NOT NULL,    -- phone / upi / account / device
  identifier_value  TEXT NOT NULL,    -- The actual value (+91987..., ravi@oksbi, etc.)
  source            TEXT NOT NULL,    -- I4C / NCRP / 1930_helpline / RBI_DPIP
  complaint_ref     TEXT,             -- e.g. NCRP/2026/100001
  reason            TEXT,             -- Investment fraud, phishing, loan scam, etc.
  reported_at       TEXT,
  status            TEXT DEFAULT 'active',  -- active / resolved
  created_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(identifier_type, identifier_value)  -- No duplicate entries
);
```

**How it's used in scoring:**
The feature extractor checks the receiver account's `phone`, `upi_id`, and `account_number` against this table. A match sets `suspect_registry_match = 1`, which contributes **60 points** to the regulatory sub-score — the highest weight of any single feature.

```javascript
// In feature-extractor.js:
const suspectMatch = stmts.checkSuspectRegistry.get({
  phone: account.phone,
  upi: account.upi_id,
  account: account.account_number
});
featureMap.suspect_registry_match = suspectMatch ? 1 : 0;
```

---

### `risk_scores` — Audit trail of all ML scoring events

```sql
CREATE TABLE IF NOT EXISTS risk_scores (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL,         -- FK → accounts.id
  txn_id            TEXT NOT NULL,         -- FK → transactions.id
  composite_score   REAL NOT NULL,         -- Final 0-100 score
  velocity_score    REAL DEFAULT 0,        -- Velocity sub-score
  behavioral_score  REAL DEFAULT 0,        -- Behavioral sub-score
  graph_score       REAL DEFAULT 0,        -- Graph sub-score
  regulatory_score  REAL DEFAULT 0,        -- Regulatory sub-score
  anomaly_score     REAL DEFAULT 0,        -- IsolationForest boost
  model_type        TEXT,                  -- 'xgboost+isolation_forest' or 'rule_based'
  features_json     TEXT,                  -- All 19 features at time of scoring
  scored_at         TEXT DEFAULT (datetime('now'))
);
```

This table is the **complete audit trail**. Every time a transaction is scored, a row is inserted here — even if the score is low. This powers:
- The risk timeline charts in the Analytics tab
- Historical feature analysis for account investigation
- Model performance evaluation

---

### `account_connections` — Pre-aggregated transaction graph edges

```sql
CREATE TABLE IF NOT EXISTS account_connections (
  source_account_id  TEXT NOT NULL,    -- Sender
  dest_account_id    TEXT NOT NULL,    -- Receiver
  txn_count          INTEGER DEFAULT 1, -- How many transactions between them
  total_amount       REAL DEFAULT 0,    -- Total ₹ transferred
  first_txn_at       TEXT,             -- First transaction datetime
  last_txn_at        TEXT,             -- Most recent datetime
  PRIMARY KEY (source_account_id, dest_account_id)
);
```

This table is the persistence layer for the network graph. It's updated with every new transaction (`UPSERT` — insert or update). On server startup, the entire graph is loaded into memory from this table via `initGraph()`.

The `GET /api/dashboard/graph` endpoint reads this table to provide D3.js with nodes and links.

---

## Relationships

```
accounts ──────────────── transactions (sender_account_id)
   │                          │
   │                     transactions (receiver_account_id)
   │
   ├──────────────────── alerts (account_id)
   │
   ├──────────────────── risk_scores (account_id)
   │
   └──────────────────── account_connections (source_account_id / dest_account_id)

transactions ────────── alerts (txn_id)
             ────────── risk_scores (txn_id)
```

---

## Seeding the Database

### Command

```bash
npm run seed
```

### What it creates

| Data | Count | Details |
|------|-------|---------|
| Normal accounts | 45 | Established (1–3 years old), KYC verified, low initial risk |
| Mule accounts | 5 | New (0–60 days), some pending KYC, elevated initial risk |
| Normal transactions | 150 | Grocery, bills, salary, peer transfers — spread over last 7 days |
| Suspicious transactions | 50 | Round amounts, mule patterns, high amounts — last 3 days |
| Suspect registry entries | ~11 | 3 from mule phones/UPIs + 5 random external suspects |
| Initial alerts | 3 | Pre-seeded on the 3 worst mule accounts |

### Mule account properties

```javascript
// In seed-data.js:
{
  account_holder: 'Ravi Dubey',          // One of 5 pre-defined mule names
  kyc_status: Math.random() < 0.3        // 30% chance of pending KYC
    ? 'pending' : 'verified',
  opened_date: randomDate(60),            // 0-60 days ago
  risk_score: 30 + Math.random() * 30,   // Starting risk: 30-60
  status: 'active',                      // Starts active — system will flag them
  is_mule: 1                             // Hidden ground truth
}
```

### Suspicious transaction patterns in seed

```javascript
// Round amounts (structuring pattern):
amount: Math.round((Math.random() * 150000 + 20000) / 1000) * 1000  // e.g. ₹49,000

// Recent timestamps (more suspicious activity is recent):
timestamp: randomDate(3)   // Last 3 days for suspicious txns

// Pre-flagged:
is_flagged: Math.random() < 0.4 ? 1 : 0   // 40% already flagged in historical data
```

### Clearing and re-seeding

The seed script always clears all data first:
```javascript
db.exec('DELETE FROM risk_scores');
db.exec('DELETE FROM alerts');
db.exec('DELETE FROM account_connections');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM suspect_registry');
db.exec('DELETE FROM accounts');
```

This means running `npm run seed` is always a **clean slate** operation. All transaction history from the running simulation is erased.

---

## Prepared Statements Reference

All queries in `server/db/index.js` are compiled once at startup as prepared statements for performance:

| Statement | Operation |
|-----------|-----------|
| `stmts.insertAccount` | Insert a new account |
| `stmts.getAccount` | Get account by ID |
| `stmts.getAllAccounts` | Get all accounts (optional status filter) |
| `stmts.updateAccountRisk` | Update risk_score + status |
| `stmts.insertTransaction` | Insert a scored transaction |
| `stmts.getTransactions` | List transactions (with filters) |
| `stmts.getAccountTransactions` | Get all transactions for one account |
| `stmts.getRecentTransactions` | Transactions in last N hours (for feature extraction) |
| `stmts.insertAlert` | Create a new alert |
| `stmts.getAlerts` | List alerts with filters |
| `stmts.updateAlert` | Update alert status |
| `stmts.insertRiskScore` | Audit trail insert |
| `stmts.getRiskTimeline` | Risk scores over time (for charts) |
| `stmts.insertSuspect` | Add suspect registry entry |
| `stmts.checkSuspectRegistry` | Check if phone/UPI/account is in registry |
| `stmts.getAllSuspects` | List all registry entries |
| `stmts.upsertConnection` | Insert or update account connection edge |
| `stmts.getAllConnections` | Load all edges (for graph init) |
| `stmts.getDashboardStats` | Aggregated counts for dashboard header |

---

## Common Queries

### Get all flagged accounts sorted by risk score
```sql
SELECT * FROM accounts
WHERE status IN ('flagged', 'frozen')
ORDER BY risk_score DESC;
```

### Get all transactions for an account in the last 24 hours
```sql
SELECT * FROM transactions
WHERE (sender_account_id = ? OR receiver_account_id = ?)
  AND timestamp > datetime('now', '-24 hours')
ORDER BY timestamp DESC;
```

### Get risk score timeline for charts
```sql
SELECT scored_at, composite_score, model_type
FROM risk_scores
WHERE account_id = ?
ORDER BY scored_at DESC
LIMIT 50;
```

### Get account network connections for D3.js
```sql
SELECT
  a1.id as source, a1.account_holder as source_name, a1.risk_score as source_risk,
  a2.id as target, a2.account_holder as target_name, a2.risk_score as target_risk,
  ac.txn_count, ac.total_amount
FROM account_connections ac
JOIN accounts a1 ON ac.source_account_id = a1.id
JOIN accounts a2 ON ac.dest_account_id = a2.id;
```

---

## Reset & Re-seed

```bash
# Method 1: Re-seed (keeps DB file, clears all data)
npm run seed

# Method 2: Full reset (delete DB file and re-seed)
del data\anviksha.db
npm run seed

# Method 3: Inspect the database with SQLite CLI
sqlite3 data/anviksha.db
sqlite> .tables
sqlite> SELECT account_holder, risk_score, status FROM accounts ORDER BY risk_score DESC;
sqlite> .quit
```
# 03 — ML Training: Complete Guide

> **Anviksha** | Bank of India Hackathon 2026  
> This is the most critical document. Read it fully before running any Python commands.

---

## Table of Contents
- [Overview: What the ML System Does](#overview-what-the-ml-system-does)
- [What Data the Model Expects](#what-data-the-model-expects)
- [The 18 Abstract Features Explained](#the-18-abstract-features-explained)
- [Step 1: Install Python Dependencies](#step-1-install-python-dependencies)
- [Step 2: Training Data — DataSet.csv](#step-2-training-data--datasetcsv)
- [Step 3: Training XGBoost](#step-3-training-xgboost)
- [Step 4: Training Isolation Forest](#step-4-training-isolation-forest)
- [Step 5: ONNX Export](#step-5-onnx-export)
- [Step 6: Run the Training Script](#step-6-run-the-training-script)
- [Step 7: Verify ONNX Files Were Created](#step-7-verify-onnx-files-were-created)
- [Step 8: Restart the Node Server](#step-8-restart-the-node-server)
- [Step 9: Verify Models Loaded on Dashboard](#step-9-verify-models-loaded-on-dashboard)
- [Understanding Model Output](#understanding-model-output)
- [Troubleshooting Training Errors](#troubleshooting-training-errors)

---

## Overview: What the ML System Does

The Anviksha ML system uses **two complementary models**:

```
Go Ingestion Service (JA3 Shield)
    │
    ▼
Redpanda (Kafka Topic: raw_transactions)
    │
    ▼
Node.js Kafka Consumer
    │
    ▼
[Feature Extraction]
 Extract 18 abstract features from dataset simulation
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
[XGBoost Classifier]          [Isolation Forest]
 Supervised learning            Unsupervised anomaly detection
 Trained on DataSet.csv         Trained on ALL data (no labels needed)
 Output: fraud probability      Output: is_anomaly (-1 or 1)
 (0.0 = normal, 1.0 = fraud)
    │                                  │
    └──────────────┬───────────────────┘
                   ▼
          [Composite Score]
          XGBoost × 100 + IsoForest boost
          Final score: 0 to 100
                   │
                   ▼
          [Risk Decision]
          0-40: Monitor
          41-70: Review Queue
          71-100: Freeze + Alert
```

**Why two models?**
- XGBoost is excellent at detecting **known fraud patterns** it was trained on
- Isolation Forest catches **novel/emerging mule behaviors** that aren't in the training data
- Together they cover both known and unknown fraud patterns

---

## What Data the Model Expects

The model expects exactly **18 features** based on the provided `DataSet.csv`. 

### Input Format

```python
# One sample = one row = one transaction being scored
# Shape: [1, 18] — 1 sample, 18 features
# All values must be float32

sample = [
    F115,  F321,  F527,  F531,  F670,  F1692, 
    F2082, F2122, F2582, F2678, F2737, F2956, 
    F3043, F3836, F3887, F3889, F3891, F3894
]
```

### Important Rules for Input Data

| Rule | Explanation |
|------|-------------|
| **String to Integer Encoding** | `F3889` (Account Age) and `F3891` (Occupation) are string categories in the raw CSV. They are LabelEncoded into integers during training. The `feature_config.json` saves these mappings for the Node.js server. |
| **Missing Values** | Null/NaN numeric features are zero-filled. Missing string features are mapped to "UNKNOWN". |
| **Order matters** | Features must be in EXACTLY the order listed above. |

---

## The 18 Abstract Features Explained

Unlike our previous iterations which used human-readable synthetic features (e.g., `txn_count_1h`), this iteration uses **abstract features** from `DataSet.csv`. 

While the exact bank definitions are proprietary, we do know:
- **F3891 (Occupation):** E.g., `salaried`, `student`, `agriculture`.
- **F3889 (Account Age):** E.g., `G365D` (Greater than 365 Days), `L14D` (Less than 14 Days).
- **F2082:** The highest importance continuous feature (accounts for ~26% of model decision weight).
- **F3924:** The Target Variable (0 = Normal, 1 = Fraud/Mule).

---

## Step 1: Install Python Dependencies

```bash
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common
```

---

## Step 2: Training Data — DataSet.csv

The data is loaded from `dataset/DataSet.csv`. 

- **Size:** 9,082 samples
- **Class Balance:** Highly imbalanced (7,200 normal vs 65 fraud).
- **Scale Pos Weight:** XGBoost automatically applies a `scale_pos_weight` of ~110.7 to compensate for the imbalance, forcing the model to pay 110x more attention to the rare fraud cases.

---

## Step 3: Training XGBoost

```python
from xgboost import XGBClassifier

model = XGBClassifier(
    n_estimators=200,           
    max_depth=6,                
    learning_rate=0.1,          
    scale_pos_weight=110.77,    # Auto-calculated handling of imbalanced data
    eval_metric='auc',          
    random_state=42,            
    subsample=0.8,              
    colsample_bytree=0.8,       
)

model.fit(X_train, y_train, eval_set=[(X_test, y_test)])
```

---

## Step 4: Training Isolation Forest

```python
from sklearn.ensemble import IsolationForest

iso_model = IsolationForest(
    n_estimators=150,        
    contamination=0.03,      # Estimated anomaly rate in the dataset
    max_samples='auto',      
    random_state=42,
    n_jobs=-1,               
)

iso_model.fit(X_train)       
```

---

## Step 5: ONNX Export

ONNX (Open Neural Network Exchange) converts the Python models into a format that Node.js can run natively without Python.

**Warning:** We use `target_opset=12` for XGBoost and `{'': 12, 'ai.onnx.ml': 3}` for Isolation Forest to ensure compatibility with `onnxruntime-node`.

---

## Step 6: Run the Training Script

```bash
python server/ml/train_model.py
```

### Expected Output

```
============================================================
  Anviksha — ML Model Training Pipeline (Real Dataset)
============================================================

[STEP 1] Loading and preprocessing real data...
Loading dataset from: C:\Users\Admin\Desktop\mule\dataset\DataSet.csv
[DATA] Loaded 9082 samples with 81 fraud cases
[DATA] Features: 18
[DATA] Train: 7265, Test: 1817

[STEP 2] Training XGBoost classifier...
[TRAIN] Class distribution: Normal=7200, Fraud=65
[TRAIN] scale_pos_weight = 110.77

[EVAL] XGBoost Classification Report:
              precision    recall  f1-score   support

      Normal       0.99      1.00      1.00      1801
       Fraud       1.00      0.25      0.40        16

[EVAL] ROC AUC Score: 0.9149

[STEP 3] Training Isolation Forest...
[EVAL] Isolation Forest detected 218 anomalies in training data
```

---

## Step 7: Verify ONNX Files Were Created

Check the models directory (`server/ml/models/`). You should see:
- `xgboost_fraud.onnx`
- `isolation_forest.onnx`
- `feature_config.json`

### What's in `feature_config.json`?
This JSON contains the `mappings` object. Because `onnxruntime-node` cannot process strings, the Python script label-encodes categorical data (like "salaried" -> 4). The Node.js server reads this JSON and applies the exact same integer mapping before scoring the transaction.

---

## Step 8: Restart the Node Server

The ONNX models are loaded **once at startup** by `server/ml/scoring-engine.js`. You must restart the server after training.

```bash
npm run dev
```

---

## Step 9: Verify Models Loaded on Dashboard

After restarting, open the UI. In the header stats bar, you should see:
```
ML: XGBoost + Isolation Forest (ONNX)
```

If it shows `ML: Rule-Based Fallback`, the ONNX models failed to load. Check the node console for the specific error.
# 04 — API Routes Reference

> **Anviksha** | Bank of India Hackathon 2026  
> Base URL: `http://localhost:3001`

---

## Table of Contents
- [Health Check](#health-check)
- [Transactions](#transactions)
- [Accounts](#accounts)
- [Alerts](#alerts)
- [Dashboard](#dashboard)
- [Regulatory Feeds](#regulatory-feeds)
- [Error Responses](#error-responses)
- [Testing APIs on Windows](#testing-apis-on-windows)

---

## Health Check

### `GET /api/health`

Returns server and ML engine status. Use this to verify the server is running and which ML mode is active.

**Response:**
```json
{
  "status": "ok",
  "service": "Anviksha Fraud Detection API",
  "version": "1.0.0",
  "timestamp": "2026-06-08T05:44:32.571Z",
  "wsClients": 2
}
```

---

## Transactions

### `POST /api/transactions`
Ingest a new transaction and run it through the full ML scoring pipeline.

**Request Body:**
```json
{
  "type": "UPI",
  "amount": 45000,
  "sender_account_id": "uuid-of-sender",
  "receiver_account_id": "uuid-of-receiver",
  "channel": "digital",
  "description": "Fund transfer"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "txn_ref": "TXN20260608123456",
    "type": "UPI",
    "amount": 45000,
    "risk_score": 87.3,
    "is_flagged": 1,
    "features_json": "{...}",
    "ml_scores_json": "{...}"
  },
  "scoring": {
    "compositeScore": 87.3,
    "velocityScore": 95,
    "behavioralScore": 80,
    "graphScore": 90,
    "regulatoryScore": 60,
    "anomalyScore": 15,
    "modelType": "xgboost+isolation_forest",
    "riskLevel": "critical",
    "action": "freeze_and_alert"
  }
}
```

---

### `GET /api/transactions`
List transactions with optional filters.

**Query Parameters:**

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `flagged` | boolean | `?flagged=true` | Only return flagged transactions |
| `account_id` | string | `?account_id=uuid` | Transactions for a specific account |
| `type` | string | `?type=UPI` | Filter by channel type |
| `limit` | number | `?limit=50` | Max results (default: 50) |
| `offset` | number | `?offset=100` | Pagination offset |

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "txn_ref": "TXN...",
      "type": "NEFT",
      "amount": 125000,
      "risk_score": 91.2,
      "is_flagged": 1,
      "timestamp": "2026-06-08T03:24:11Z",
      "sender": { "id": "...", "account_holder": "Aarav Sharma", "account_number": "..." },
      "receiver": { "id": "...", "account_holder": "Ravi Dubey", "account_number": "..." }
    }
  ],
  "total": 301,
  "flagged": 19
}
```

---

### `GET /api/transactions/:id`
Get a single transaction with full feature breakdown.

**Response:**
```json
{
  "transaction": { ... },
  "features": {
    "txn_count_1h": 12,
    "txn_count_24h": 47,
    "amount_received_1h": 380000,
    "amount_sent_1h": 355000,
    "avg_time_between_txns": 180,
    "is_off_hours": 1,
    "is_round_amount": 1,
    "is_near_threshold": 0,
    "immediate_passthrough": 1,
    "cross_channel_mixing": 1,
    "account_age_days": 23,
    "is_new_account": 1,
    "no_prior_history": 0,
    "previously_flagged": 0,
    "unique_senders_24h": 14,
    "unique_receivers_24h": 3,
    "passthrough_ratio": 0.93,
    "suspect_registry_match": 1,
    "linked_to_flagged": 1
  },
  "mlScores": {
    "velocity": 95,
    "behavioral": 80,
    "graph": 90,
    "regulatory": 100,
    "anomaly": 18,
    "composite": 91.2,
    "modelType": "xgboost+isolation_forest"
  }
}
```

---

## Accounts

### `GET /api/accounts`
List all accounts with risk scores.

**Query Parameters:**

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | string | `?status=flagged` | Filter: active/under_review/flagged/frozen |
| `sort` | string | `?sort=risk_score` | Sort field (default: risk_score DESC) |
| `limit` | number | `?limit=20` | Max results |

**Response:**
```json
{
  "accounts": [
    {
      "id": "uuid",
      "account_number": "4821763901",
      "account_holder": "Ravi Dubey",
      "bank_name": "Bank of India",
      "upi_id": "ravi23@oksbi",
      "account_type": "savings",
      "kyc_status": "verified",
      "opened_date": "2026-04-15T00:00:00Z",
      "risk_score": 87.4,
      "status": "flagged"
    }
  ],
  "total": 50,
  "flagged": 3,
  "frozen": 1
}
```

---

### `GET /api/accounts/:id`
Get full account profile with history, connections, and risk timeline.

**Response:**
```json
{
  "account": { ...account fields... },
  "recentTransactions": [ ...last 20 transactions... ],
  "connections": [
    { "accountId": "...", "accountHolder": "...", "txnCount": 8, "totalAmount": 340000 }
  ],
  "riskTimeline": [
    { "scored_at": "2026-06-08T03:00:00Z", "composite_score": 45.2 },
    { "scored_at": "2026-06-08T03:15:00Z", "composite_score": 67.8 }
  ],
  "latestAlert": { ...most recent alert for this account... },
  "suspectRegistryMatches": [ ...any matching registry entries... ]
}
```

---

### `POST /api/accounts/:id/freeze`
Freeze an account (manual analyst action).

**Request Body:** (empty)

**Response:**
```json
{ "success": true, "account": { "id": "...", "status": "frozen" } }
```

After freezing, a WebSocket broadcast is sent to all dashboard clients with the updated account status.

---

### `POST /api/accounts/:id/unfreeze`
Unfreeze an account and set it back to `under_review`.

**Response:**
```json
{ "success": true, "account": { "id": "...", "status": "under_review" } }
```

---

## Alerts

### `GET /api/alerts`
List all alerts with optional filters.

**Query Parameters:**

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | string | `?status=open` | Filter by status: open/acknowledged/resolved |
| `severity` | string | `?severity=critical` | Filter: medium/high/critical |
| `account_id` | string | `?account_id=uuid` | Alerts for specific account |
| `limit` | number | `?limit=20` | Max results |

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "alert_type": "ml_flag",
      "severity": "critical",
      "title": "🚨 CRITICAL: Mule account pattern detected — 4821763901",
      "description": "Transaction of ₹1,25,000 via NEFT. Risk score: 91.2/100. Action: freeze_and_alert.",
      "ai_explanation": "Account ACC-4821 received ₹3.2L from 14 different accounts...",
      "status": "open",
      "created_at": "2026-06-08T03:24:15Z",
      "account": { "account_holder": "Ravi Dubey", "risk_score": 87.4 }
    }
  ],
  "total": 24,
  "stats": {
    "open": 3,
    "critical": 2,
    "high": 1,
    "medium": 0
  }
}
```

---

### `PATCH /api/alerts/:id`
Update alert status (acknowledge or resolve).

**Request Body:**
```json
{ "status": "acknowledged" }
// or
{ "status": "resolved" }
```

**Response:**
```json
{ "success": true, "alert": { "id": "...", "status": "acknowledged" } }
```

---

### `GET /api/alerts/stats`
Get aggregated alert statistics for the dashboard.

**Response:**
```json
{
  "total": 24,
  "open_count": 3,
  "acknowledged_count": 8,
  "resolved_count": 13,
  "critical_count": 2,
  "high_count": 1,
  "medium_count": 0
}
```

---

## Dashboard

### `GET /api/dashboard/stats`
Main aggregated metrics. Called on dashboard load and periodically refreshed.

**Response:**
```json
{
  "total_accounts": 50,
  "flagged_accounts": 3,
  "total_transactions": 301,
  "flagged_transactions": 19,
  "total_volume": 8780108,
  "flagged_volume": 1942000,
  "open_alerts": 3,
  "avg_risk_score": 5.58,
  "txnByType": [
    { "type": "ATM",  "count": 9,   "volume": 127410   },
    { "type": "IMPS", "count": 70,  "volume": 2737195  },
    { "type": "NEFT", "count": 66,  "volume": 3872173  },
    { "type": "UPI",  "count": 151, "volume": 2027783  }
  ],
  "riskDistribution": [
    { "bucket": "0-20",  "count": 251 },
    { "bucket": "21-40", "count": 6   },
    { "bucket": "41-60", "count": 25  },
    { "bucket": "61-80", "count": 14  },
    { "bucket": "81-100","count": 5   }
  ],
  "alertStats": {
    "total": 3,
    "open_count": 3,
    "critical_count": 2,
    "high_count": 1
  },
  "mlEngine": "XGBoost + Isolation Forest (ONNX)",
  "serverTime": "2026-06-08T05:44:47.052Z"
}
```

---

### `GET /api/dashboard/graph`
Returns network graph data formatted for D3.js force-directed graph.

**Response:**
```json
{
  "nodes": [
    {
      "id": "uuid",
      "label": "Ravi Dubey",
      "account_number": "4821763901",
      "risk_score": 87.4,
      "status": "flagged",
      "account_type": "savings"
    }
  ],
  "links": [
    {
      "source": "uuid-sender",
      "target": "uuid-receiver",
      "txn_count": 8,
      "total_amount": 340000,
      "value": 8
    }
  ]
}
```

---

### `GET /api/dashboard/timeline`
Risk score timeline for line charts. Returns risk score history over the last 24 hours.

**Response:**
```json
{
  "timeline": [
    { "hour": "2026-06-08T00:00:00Z", "avg_score": 12.3, "flagged_count": 0 },
    { "hour": "2026-06-08T01:00:00Z", "avg_score": 45.8, "flagged_count": 2 }
  ]
}
```

---

## Regulatory Feeds

### `GET /api/regulatory/suspect-registry`
Get all entries in the suspect registry.

**Query Parameters:**
- `source` — Filter by source: `I4C`, `NCRP`, `1930_helpline`, `RBI_DPIP`
- `type` — Filter by type: `phone`, `upi`, `account`, `device`
- `status` — Filter by status: `active`, `resolved`

**Response:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "identifier_type": "phone",
      "identifier_value": "+919876543210",
      "source": "I4C",
      "complaint_ref": "NCRP/2026/100001",
      "reason": "Reported in online financial fraud — UPI phishing scheme",
      "reported_at": "2026-05-25T00:00:00Z",
      "status": "active"
    }
  ],
  "total": 11
}
```

---

### `POST /api/regulatory/suspect-registry`
Add a new suspect registry entry (simulates an I4C feed update).

**Request Body:**
```json
{
  "identifier_type": "upi",
  "identifier_value": "fraudster@paytm",
  "source": "NCRP",
  "complaint_ref": "NCRP/2026/200001",
  "reason": "Investment fraud — fake trading app",
  "reported_at": "2026-06-08T10:00:00Z"
}
```

**Response:**
```json
{ "success": true, "entry": { ...inserted entry... } }
```

Adding a new entry triggers an immediate re-check of all active accounts — if any account's phone/UPI/account matches the new entry, their `suspect_registry_match` feature becomes 1 on the next transaction.

---

### `GET /api/regulatory/feed-status`
Returns simulated status of all regulatory feed connections.

**Response:**
```json
{
  "feeds": [
    { "name": "I4C Suspect Registry",    "status": "connected", "lastUpdate": "2026-06-08T05:30:00Z", "entriesCount": 11 },
    { "name": "NCRP Complaint Feed",     "status": "connected", "lastUpdate": "2026-06-08T05:15:00Z", "entriesCount": 6  },
    { "name": "1930 Helpline",           "status": "connected", "lastUpdate": "2026-06-08T04:55:00Z", "entriesCount": 3  },
    { "name": "RBI DPIP",               "status": "degraded",  "lastUpdate": "2026-06-08T03:00:00Z", "entriesCount": 1  }
  ]
}
```

---

## Error Responses

All errors return a consistent JSON structure:

```json
{
  "error": true,
  "message": "Account not found",
  "code": "NOT_FOUND"
}
```

| HTTP Status | When |
|------------|------|
| 200 OK | Successful GET |
| 201 Created | Successful POST |
| 400 Bad Request | Missing or invalid request body |
| 404 Not Found | Resource doesn't exist |
| 500 Internal Server Error | Unexpected server error |

---

## Testing APIs on Windows

Since `curl` may not work in PowerShell, use `Invoke-RestMethod`:

```powershell
# GET request
Invoke-RestMethod -Uri "http://localhost:3001/api/dashboard/stats" | ConvertTo-Json

# POST request
$body = @{ type="UPI"; amount=45000; sender_account_id="uuid"; receiver_account_id="uuid" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/transactions" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json

# PATCH request
$body = @{ status="acknowledged" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/alerts/uuid-here" -Method PATCH -Body $body -ContentType "application/json" | ConvertTo-Json
```
# 05 — WebSocket Events Reference

> **Anviksha** | Bank of India Hackathon 2026  
> WebSocket URL: `ws://localhost:3001`

---

## Table of Contents
- [Connecting](#connecting)
- [Event Types](#event-types)
- [init Event](#init-event)
- [transaction Event](#transaction-event)
- [alert Event](#alert-event)
- [suspect_registry Event](#suspect_registry-event)
- [How the Dashboard Uses Events](#how-the-dashboard-uses-events)
- [Reconnection Logic](#reconnection-logic)
- [Testing WebSockets](#testing-websockets)

---

## Connecting

The WebSocket server runs on the **same port as the HTTP server** (3001). This is achieved using the `ws` package attached to the Node.js `http.Server` instance.

```javascript
// Client-side connection (from App.jsx):
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  console.log('Connected to Anviksha live feed');
};

ws.onmessage = (event) => {
  const { type, data, timestamp } = JSON.parse(event.data);
  // Handle event based on type
};

ws.onclose = () => {
  // Auto-reconnect after 3 seconds
  setTimeout(connect, 3000);
};
```

All messages follow this wrapper format:
```json
{
  "type": "event_name",
  "data": { ... },
  "timestamp": "2026-06-08T05:44:32.571Z"
}
```

---

## Event Types

| Event | When it's sent | Frequency |
|-------|---------------|-----------|
| `init` | Immediately on WebSocket connection | Once per connection |
| `transaction` | Every time a transaction is processed | Every 2 seconds (SIMULATION_INTERVAL) |
| `alert` | When a transaction scores ≥ 41 | Variable — depends on fraud rate |
| `suspect_registry` | When a new I4C/NCRP entry is added | Every ~45 seconds (random) |

---

## `init` Event

Sent immediately when a client connects. Provides the current dashboard state so the UI can populate without waiting for the first `transaction` event.

```json
{
  "type": "init",
  "data": {
    "total_accounts": 50,
    "flagged_accounts": 3,
    "total_transactions": 301,
    "flagged_transactions": 19,
    "total_volume": 8780108,
    "flagged_volume": 1942000,
    "open_alerts": 3,
    "avg_risk_score": 5.58,
    "txnByType": [...],
    "riskDistribution": [...],
    "alertStats": {...},
    "mlEngine": "XGBoost + Isolation Forest (ONNX)"
  },
  "timestamp": "2026-06-08T05:44:32.571Z"
}
```

**Dashboard action:** Populates the stats bar in the Header component and initializes chart data.

---

## `transaction` Event

Emitted after every transaction completes the full ML pipeline (scoring, DB insert, graph update). This is the core real-time event that drives the Live Feed tab.

```json
{
  "type": "transaction",
  "data": {
    "transaction": {
      "id": "a1b2c3d4-e5f6-...",
      "txn_ref": "TXN202606080534120045",
      "type": "UPI",
      "amount": 45000,
      "channel": "digital",
      "description": "Fund transfer",
      "timestamp": "2026-06-08T05:34:12Z",
      "risk_score": 87.3,
      "is_flagged": 1,
      "features_json": "{\"txn_count_1h\":12,\"passthrough_ratio\":0.93,...}",
      "sender": {
        "id": "uuid-sender",
        "name": "Aarav Sharma",
        "account_number": "3920148762"
      },
      "receiver": {
        "id": "uuid-receiver",
        "name": "Ravi Dubey",
        "account_number": "4821763901"
      }
    },
    "scoring": {
      "compositeScore": 87.3,
      "velocityScore": 95,
      "behavioralScore": 80,
      "graphScore": 90,
      "regulatoryScore": 60,
      "anomalyScore": 15,
      "modelType": "xgboost+isolation_forest",
      "riskLevel": "critical",
      "action": "freeze_and_alert",
      "featureMap": {
        "txn_count_1h": 12,
        "txn_count_24h": 47,
        "amount_received_1h": 380000,
        "passthrough_ratio": 0.93,
        "suspect_registry_match": 1,
        "immediate_passthrough": 1,
        "is_off_hours": 1
      }
    }
  },
  "timestamp": "2026-06-08T05:34:12.891Z"
}
```

**Dashboard actions:**
- **LiveFeed**: Prepend to transaction list with slide-in animation; if `risk_score >= 71`, add pulse-red animation
- **Header**: Update `total_transactions` counter
- **Analytics**: Update risk distribution chart

---

## `alert` Event

Emitted when `compositeScore >= 41`. This event carries both the alert details AND the full transaction context. Only sent AFTER the alert is persisted to the database.

```json
{
  "type": "alert",
  "data": {
    "alert": {
      "id": "uuid-alert",
      "alert_type": "ml_flag",
      "severity": "critical",
      "account_id": "uuid-account",
      "txn_id": "uuid-txn",
      "title": "🚨 CRITICAL: Mule account pattern detected — 4821763901",
      "description": "Transaction of ₹45,000 via UPI. Risk score: 87.3/100. Action: freeze_and_alert.",
      "ai_explanation": "Account ACC-4821 received ₹3.2L from 14 different accounts in 47 minutes, immediately forwarding to 3 accounts. The account's phone number matches I4C Suspect Registry entry NCRP/2026/100001. Risk Score: 87.3/100. Recommended Action: FREEZE",
      "status": "open"
    },
    "account": {
      "id": "uuid-account",
      "account_holder": "Ravi Dubey",
      "account_number": "4821763901",
      "risk_score": 87.4,
      "status": "flagged"
    },
    "transaction": {
      "id": "uuid-txn",
      "amount": 45000,
      "type": "UPI",
      "risk_score": 87.3,
      "sender": { "id": "...", "name": "Aarav Sharma" },
      "receiver": { "id": "...", "name": "Ravi Dubey" }
    },
    "scoring": { ... same scoring object as transaction event ... }
  },
  "timestamp": "2026-06-08T05:34:13.102Z"
}
```

**Dashboard actions:**
- **Header**: Increment alert badge counter (red dot with number)
- **LiveFeed**: Pin this transaction to the top with red pulsing border
- **FlaggedAccounts**: Add/update the flagged account in the table
- **Browser notification** (if permission granted): Show browser notification

---

## `suspect_registry` Event

Emitted by the I4C Feed Generator when a new regulatory blacklist entry is added. Average frequency: every 45 seconds.

```json
{
  "type": "suspect_registry",
  "data": {
    "entry": {
      "id": "uuid-entry",
      "identifier_type": "phone",
      "identifier_value": "+919876543210",
      "source": "I4C",
      "complaint_ref": "NCRP/2026/300005",
      "reason": "Lottery scam — collected funds via UPI",
      "reported_at": "2026-06-08T05:30:00Z",
      "status": "active"
    }
  },
  "timestamp": "2026-06-08T05:30:00.000Z"
}
```

**Dashboard actions:**
- **RegulatoryFeeds tab**: Add new entry to the top of the registry list with a highlight animation
- **Header**: Update feed "last sync" timestamp

---

## How the Dashboard Uses Events

In `client/src/App.jsx`, all WebSocket handling is centralized:

```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'init':
      setStats(msg.data);
      break;
      
    case 'transaction':
      // Add to live feed (max 100 items in memory)
      setTransactions(prev => [msg.data.transaction, ...prev].slice(0, 100));
      // Update stats counter
      setStats(prev => ({ ...prev, total_transactions: prev.total_transactions + 1 }));
      break;
      
    case 'alert':
      // Increment alert badge
      setAlertCount(prev => prev + 1);
      setAlerts(prev => [msg.data.alert, ...prev].slice(0, 50));
      // Update flagged accounts list
      setFlaggedAccounts(prev => {
        const updated = prev.filter(a => a.id !== msg.data.account.id);
        return [msg.data.account, ...updated];
      });
      break;
      
    case 'suspect_registry':
      setRegistryEntries(prev => [msg.data.entry, ...prev].slice(0, 100));
      setLastRegUpdate(msg.timestamp);
      break;
  }
};
```

---

## Reconnection Logic

The dashboard automatically reconnects if the WebSocket connection drops:

```javascript
// From App.jsx:
function connect() {
  const ws = new WebSocket('ws://localhost:3001');
  
  ws.onclose = () => {
    setWsConnected(false);
    // Show "Reconnecting..." indicator in header
    setTimeout(connect, 3000);  // Retry after 3 seconds
  };
  
  ws.onopen = () => {
    setWsConnected(true);
    // Re-fetch full state via REST API to catch up on missed events
    fetchDashboardStats();
    fetchFlaggedAccounts();
  };
}
```

The green pulsing dot in the Header shows the WebSocket connection status. If it turns red, the system is reconnecting.

---

## Testing WebSockets

### Option 1: Browser Console

Open browser DevTools → Console:
```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
// Wait 2 seconds — you should see transaction events
```

### Option 2: wscat (Node.js CLI)

```bash
npm install -g wscat
wscat -c ws://localhost:3001
# Connected — you'll see JSON events every 2 seconds
```

### Option 3: PowerShell (basic check)

```powershell
# WebSocket connection test via HTTP upgrade
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = New-Object System.Uri("ws://localhost:3001")
$ws.ConnectAsync($uri, [System.Threading.CancellationToken]::None).Wait()
Write-Host "Connected: $($ws.State)"
```
# 06 — Running, Setup & Scripts

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [First-Time Setup (A→Z)](#first-time-setup-az)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Server Startup Sequence](#server-startup-sequence)
- [What the Logs Mean](#what-the-logs-mean)
- [Stopping and Restarting](#stopping-and-restarting)
- [Running Without ONNX Models](#running-without-onnx-models)
- [Running Without Gemini API Key](#running-without-gemini-api-key)

---

## Prerequisites

| Tool | Min Version | Check | Install |
|------|-------------|-------|---------|
| Node.js | v20+ | `node --version` | [nodejs.org](https://nodejs.org) |
| npm | v10+ | `npm --version` | Comes with Node.js |
| Python | v3.9+ | `python --version` | [python.org](https://python.org) |
| pip | any | `pip --version` | Comes with Python |

**Optional:**
- A **Gemini API key** — get one free at [ai.google.dev](https://ai.google.dev). If not set, the system uses template explanations.

---

## First-Time Setup (A→Z)

### Step 1: Create environment file

```bash
copy .env.example .env
```

Edit `.env`:
```env
PORT=3001
DB_PATH=./data/anviksha.db
SIMULATION_INTERVAL=2000
GEMINI_API_KEY=             ← add your key here, or leave blank
```

### Step 2: Start via Docker Compose (Recommended)

The entire microservices architecture (Go Ingestion, Redpanda Kafka, Redis, Node Backend, React Frontend) is orchestrated via Docker Compose.

```bash
docker-compose up --build
```

*Note: The Node.js container automatically installs dependencies, builds the Vite frontend, and seeds the SQLite database on startup.*

### Step 3: Open the dashboard

Navigate to **http://localhost:5173** in your browser.

> **Optional: Standalone Mode**
> If you don't have Docker, you can run the system in standalone mode (which bypasses the Go microservice and Kafka, posting directly to Node).
> 1. `npm run setup`
> 2. `npm run dev`

---

## Available Scripts

All scripts are in the root `package.json`.

### `npm run dev`
Starts both server and client concurrently using the `concurrently` package.

```bash
npm run dev
# Starts:
# [0] node --watch server/index.js    → Backend on port 3001
# [1] cd client && npx vite           → Frontend on port 5173
```

The `--watch` flag automatically restarts the server when any file in `server/` changes.

---

### `npm run dev:server`
Starts only the backend.

```bash
npm run dev:server
# node --watch server/index.js
# Backend: http://localhost:3001
```

Use this when you only need the API (e.g., testing with Postman/curl).

---

### `npm run dev:client`
Starts only the Vite frontend dev server.

```bash
npm run dev:client
# cd client && npx vite --port 5173
# Frontend: http://localhost:5173
```

The frontend will show connection errors in the console if the backend isn't running, but the UI will still render.

---

### `npm run seed`
Re-seeds the database. **This clears all existing data** and recreates the initial 50 accounts + 200 transactions.

```bash
npm run seed

# Output:
# [DB] SQLite initialized at ./data/anviksha.db
# [SEED] Clearing existing data...
# [SEED] Creating 50 accounts (45 normal + 5 mule)...
# [SEED] ✅ Created 50 accounts
# [SEED] Creating 200 historical transactions...
# [SEED] ✅ Created 200 transactions
# [SEED] Creating suspect registry entries...
# [SEED] ✅ Created 11 suspect registry entries
# [SEED] Creating initial alerts...
# [SEED] ✅ Created 3 alerts
# ==================================================
#   Seed Complete!
# ==================================================
#   Accounts:     50
#   Transactions: 200
#   Open Alerts:  3
#   Flagged:      0 accounts, 19 txns
```

---

### `npm run setup`
Full first-time setup. Equivalent to: `npm install && cd client && npm install && npm run seed`.

---

### `python server/ml/train_model.py`
Trains XGBoost + Isolation Forest and exports to ONNX. See [03-ml-training.md](./03-ml-training.md) for full details.

---

## Environment Variables

File: `.env` in the project root.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3001` | No | HTTP + WebSocket server port |
| `DB_PATH` | `./data/anviksha.db` | No | SQLite database file path |
| `SIMULATION_INTERVAL` | `2000` | No | Milliseconds between generated transactions |
| `GEMINI_API_KEY` | (empty) | No | Google Gemini API key for AI explanations |

### Adjusting `SIMULATION_INTERVAL`

| Value | Effect |
|-------|--------|
| `500` | Very fast (2 txns/second) — good for stress testing |
| `2000` | Default (1 txn every 2 seconds) — good for demo |
| `5000` | Slow (1 txn every 5 seconds) — easier to follow in demo |
| `30000` | Very slow (1 txn every 30 seconds) — for live presentations |

---

## Server Startup Sequence

When you run `npm run dev:server`, here is exactly what happens in `server/index.js`:

```
1. dotenv loads .env → process.env.PORT, DB_PATH, GEMINI_API_KEY set
2. Express app created
3. HTTP server created (wrapping Express)
4. WebSocket server created (attached to HTTP server)
5. CORS middleware applied
6. JSON body parser applied
7. API routes mounted (/api/transactions, /api/accounts, etc.)
8. Health check route mounted (/api/health)
9. initScoringEngine() called:
   ├─ If xgboost_fraud.onnx + isolation_forest.onnx exist:
   │   → Loads onnxruntime-node
   │   → Creates XGBoost InferenceSession
   │   → Creates Isolation Forest InferenceSession
   │   → Sets useONNX = true
   └─ If not:
       → Sets useONNX = false (rule-based fallback)
10. initGraph() called:
    → Reads all rows from account_connections table
    → Builds in-memory adjacency list
    → Logs: [GRAPH] Initialized with N nodes and M edges
11. HTTP server starts listening on PORT:
    → Logs: [SERVER] ✅ API running at http://localhost:3001
    → Logs: [SERVER] ✅ WebSocket running at ws://localhost:3001
12. startTransactionGenerator(processTransaction, SIMULATION_INTERVAL):
    → Starts setInterval loop
    → Generates a transaction every SIMULATION_INTERVAL ms
    → POSTs transaction to Go Ingestion Service (http://ingestion-service:8080)
    → Go service checks JA3 fingerprint, drops bad actors (403), or publishes to Redpanda (Kafka)
    → Node.js Kafka Consumer reads from 'raw_transactions' topic
    → Passes each transaction through processTransaction()
13. startI4CFeedGenerator(callback, 45000):
    → Starts random-interval loop
    → Generates a new suspect entry every ~45 seconds
    → Inserts into DB
    → Calls callback to broadcast to WebSocket clients
14. Logs: [SERVER] 🚀 All systems running. Dashboard: http://localhost:5173
```

---

## What the Logs Mean

### Good startup logs:
```
[DB] SQLite initialized at ./data/anviksha.db
[ML] ✅ XGBoost ONNX model loaded           ← Real ML is active
[ML] ✅ Isolation Forest ONNX model loaded   ← Both models loaded
[ML] ✅ Feature config loaded
[ML] 🚀 ONNX inference engine ready (real ML models)
[GRAPH] Initialized with 50 nodes and 192 edges  ← Graph from DB
[GENERATOR] Starting transaction generator (interval: 2000ms)
[I4C FEED] Starting regulatory feed simulator (avg interval: 45000ms)
[SERVER] ✅ API running at http://localhost:3001
[SERVER] ✅ WebSocket running at ws://localhost:3001
[SERVER] 🚀 All systems running. Dashboard: http://localhost:5173
```

### Fallback mode logs (ONNX not available):
```
[ML] ⚠️ ONNX model files not found at C:\...\server\ml\models
[ML] ⚠️ Run "npm run train" (python server/ml/train_model.py) to train models
[ML] 📋 Using rule-based fallback scoring engine
```

### Runtime logs (every ~2 seconds):
```
[🚨 FRAUD] Account 4821763901 — Score: 87.3 — Action: freeze_and_alert
[I4C] New entry: +919876543210 from I4C
[WS] Client connected. Total: 2
[WS] Client disconnected. Total: 1
```

---

## Stopping and Restarting

### Stop the server:
Press `Ctrl + C` in the terminal running `npm run dev`.

The server handles `SIGINT` gracefully:
```
[SERVER] Shutting down...
[SERVER] HTTP server closed
```

### Restart the server:
```bash
npm run dev
```

> The `--watch` flag in `npm run dev:server` auto-restarts when server files change. You don't need to manually restart for server-side code changes.

---

## Running Without ONNX Models

If you haven't run the Python training script, the system still works fully — it just uses the rule-based scoring engine instead of ONNX inference.

**Rule-based scoring** uses the same 19 features with calibrated thresholds and weighted sums:
```
compositeScore = 0.25 × velocityScore
               + 0.20 × behavioralScore
               + 0.25 × graphScore
               + 0.30 × regulatoryScore
```

This is transparent, explainable, and appropriate for a demo. For the hackathon judges, you can mention both modes.

---

## Running Without Gemini API Key

If `GEMINI_API_KEY` is empty or not set, the explanation system automatically falls back to a **template engine**:

```javascript
// In explainer.js:
if (!process.env.GEMINI_API_KEY) {
  return generateTemplateExplanation(data);
}
// Otherwise call Gemini API
```

The template engine produces structured explanations like:
```
"Account 4821763901 (Ravi Dubey) exhibits multiple mule account indicators:
CRITICAL: Account identifier matches I4C Suspect Registry (NCRP/2026/100001).
HIGH RISK: Immediate pass-through pattern — funds received and forwarded within 5 minutes.
HIGH RISK: Fan-in pattern — 14 unique senders in 24 hours.
MODERATE: Account opened 23 days ago (new account risk).
MODERATE: Off-hours activity detected (transaction at 3:24 AM).
Risk Score: 87.3/100. Recommended Action: FREEZE AND ESCALATE."
```

This is sufficient for demo purposes and doesn't require any API key.
# 07 — Graph Analysis Engine

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Why Graph Analysis?](#why-graph-analysis)
- [Graph Structure](#graph-structure)
- [Initialization](#initialization)
- [Live Updates](#live-updates)
- [Computed Metrics](#computed-metrics)
- [Mule Pattern Detection](#mule-pattern-detection)
- [Graph Features Used in ML Scoring](#graph-features-used-in-ml-scoring)
- [D3.js Visualization](#d3js-visualization)

---

## Why Graph Analysis?

Traditional fraud detection looks at individual transactions in isolation. **Graph analysis** looks at the *network of relationships* between accounts. Mule networks have distinctive graph topologies:

```
Normal person's transaction network:      Mule account's transaction network:

  salary      grocery                    victim1   victim2   victim3
    │            │                          │         │         │
    └────[YOU]───┘                          └──────[MULE]──────┘
         │                                           │
         │ rent                                      │ (all sent to one account)
         ▼                                           ▼
       landlord                                  layering_account
```

The mule's graph has:
- High **in-degree** (many accounts sending money TO the mule)
- Low **out-degree** (all money going to ONE account)
- Very few **triangles** (not socially connected — isolated hub)

---

## Graph Structure

`server/ml/graph-analyzer.js` maintains an **in-memory directed weighted graph**:

```javascript
const graph = {
  // Map of accountId → array of {to, count, amount}
  adjacencyList: new Map(),
  
  // Per-account aggregated stats
  accountStats: new Map(),
  // accountStats.get(accountId) = {
  //   inDegree: 14,          // unique senders
  //   outDegree: 3,          // unique receivers
  //   totalReceived: 380000, // ₹ received
  //   totalSent: 355000,     // ₹ sent
  //   txnTimestamps: [...]   // for velocity computation
  // }
}
```

---

## Initialization

On server startup, the graph is loaded from the `account_connections` table:

```javascript
export function initGraph() {
  // Load all persisted connections from DB
  const connections = stmts.getAllConnections.all();
  
  connections.forEach(conn => {
    // Add to adjacency list
    addEdge(conn.source_account_id, conn.dest_account_id, conn.txn_count, conn.total_amount);
  });
  
  console.log(`[GRAPH] Initialized with ${graph.adjacencyList.size} nodes and ${connections.length} edges`);
}
```

---

## Live Updates

Every new transaction updates the graph immediately:

```javascript
export function updateGraph(transaction) {
  const { sender_account_id, receiver_account_id, amount, type } = transaction;
  
  // 1. Add/update edge
  addEdge(sender_account_id, receiver_account_id, 1, amount);
  
  // 2. Update sender stats (outgoing)
  updateAccountStats(sender_account_id, {
    sentAmount: amount,
    sentTo: receiver_account_id,
    channel: type
  });
  
  // 3. Update receiver stats (incoming)
  updateAccountStats(receiver_account_id, {
    receivedAmount: amount,
    receivedFrom: sender_account_id,
    channel: type
  });
  
  // 4. Persist to DB (upsert)
  stmts.upsertConnection.run({
    source: sender_account_id,
    dest: receiver_account_id,
    txn_count: 1,
    amount: amount
  });
}
```

---

## Computed Metrics

### In-Degree (Fan-in detection)

```javascript
export function getInDegree(accountId, hours = 24) {
  const cutoff = Date.now() - (hours * 3600 * 1000);
  const stats = graph.accountStats.get(accountId);
  
  // Count unique senders within the time window
  const uniqueSenders = new Set(
    stats.incomingTxns
      .filter(t => t.timestamp > cutoff)
      .map(t => t.fromAccountId)
  );
  
  return uniqueSenders.size;  // e.g. 14
}
```

### Out-Degree (Fan-out detection)

```javascript
export function getOutDegree(accountId, hours = 24) {
  // Count unique receivers in last N hours
  const uniqueReceivers = new Set(
    stats.outgoingTxns
      .filter(t => t.timestamp > cutoff)
      .map(t => t.toAccountId)
  );
  return uniqueReceivers.size;
}
```

### Passthrough Ratio

```javascript
export function getPassthroughRatio(accountId, hours = 24) {
  const stats = graph.accountStats.get(accountId);
  
  const received = stats.incomingTxns
    .filter(t => t.timestamp > cutoff)
    .reduce((sum, t) => sum + t.amount, 0);
    
  const sent = stats.outgoingTxns
    .filter(t => t.timestamp > cutoff)
    .reduce((sum, t) => sum + t.amount, 0);
    
  return received > 0 ? sent / received : 0;
  // 0.93 = mule (forwards 93% of received funds)
  // 0.30 = normal person (spends 30% of received)
}
```

### Clustering Coefficient

A measure of how interconnected an account's neighbors are. Normal people's neighbors (friends, family) often know each other. Mules are isolated hubs — their senders don't know each other.

```javascript
export function getClusteringCoefficient(accountId) {
  const neighbors = getNeighbors(accountId);
  if (neighbors.length < 2) return 0;
  
  let triangles = 0;
  // Check if any two neighbors are also connected to each other
  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      if (hasEdge(neighbors[i], neighbors[j])) {
        triangles++;
      }
    }
  }
  
  const possibleTriangles = (neighbors.length * (neighbors.length - 1)) / 2;
  return triangles / possibleTriangles;
  // 0.8 = highly clustered (normal social network)
  // 0.05 = isolated hub (mule network)
}
```

---

## Mule Pattern Detection

### Pattern 1: Fan-in (Aggregation)

```
victim1 ──₹10,000──→ ┐
victim2 ──₹15,000──→ MULE ──₹80,000──→ layering_account
victim3 ──₹25,000──→ ┘
victim4 ──₹30,000──→ ┘
```

**Detection:** `unique_senders_24h > 10`

---

### Pattern 2: Immediate Pass-through

```
₹45,000 received at 3:15:00 AM (via UPI)
₹42,000 sent    at 3:17:23 AM (via NEFT)

Time delta: 143 seconds → immediate_passthrough = 1
```

---

### Pattern 3: Layering Chain

```
A ──→ B ──→ C ──→ D ──→ E

All within 30 minutes, each forwarding ~90% of received amount
```

The graph analyzer detects chains by doing a **BFS from B** and finding if C, D, E are also high-passthrough accounts recently active.

---

### Pattern 4: Split Withdrawal (Structuring)

```
₹1,00,000 received
   ├─ ₹48,000 sent to account1 (below ₹50K threshold)
   ├─ ₹48,000 sent to account2 (below ₹50K threshold)
   └─ ₹4,000  kept
```

Detected by `is_near_threshold = 1` and `unique_receivers_24h > 1`.

---

## Graph Features Used in ML Scoring

The graph analyzer provides 3 of the 19 features to the ML model:

| Feature | Source | Weight |
|---------|--------|--------|
| `unique_senders_24h` | `getInDegree(accountId, 24)` | High (fan-in signal) |
| `unique_receivers_24h` | `getOutDegree(accountId, 24)` | Medium (fan-out signal) |
| `passthrough_ratio` | `getPassthroughRatio(accountId, 24)` | Very High (key mule signal) |

The `linked_to_flagged` feature also uses graph data:

```javascript
const neighbors = getNeighbors(receiverAccountId);
featureMap.linked_to_flagged = neighbors.some(id => {
  const acc = stmts.getAccount.get(id);
  return acc?.status === 'flagged' || acc?.status === 'frozen';
}) ? 1 : 0;
```

---

## D3.js Visualization

The `GET /api/dashboard/graph` endpoint returns the graph in D3-compatible format.

The React dashboard (`client/src/pages/NetworkGraph.jsx`) renders it as a **force-directed graph** where:

- **Node size** = account `risk_score` (larger = riskier)
- **Node color** = status:
  - 🟢 Green = `active` (normal)
  - 🟡 Amber = `under_review`
  - 🔴 Red = `flagged`
  - ⬛ Dark = `frozen`
- **Edge thickness** = `txn_count` (thicker edge = more transactions between these accounts)
- **Edge color** = `total_amount` (gradient: low=blue, high=red)

**Force simulation parameters:**
```javascript
d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(80))
  .force('charge', d3.forceManyBody().strength(-200))  // Repulsion
  .force('center', d3.forceCenter(width/2, height/2))
  .force('collision', d3.forceCollide(25));
```

Clicking on a node opens an account detail panel showing risk score, recent transactions, and the AI explanation.
# 08 — GenAI Explanation Layer

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Purpose](#purpose)
- [When is it Called?](#when-is-it-called)
- [Gemini API Mode](#gemini-api-mode)
- [Template Fallback Mode](#template-fallback-mode)
- [Adding Your Gemini API Key](#adding-your-gemini-api-key)
- [Example Outputs](#example-outputs)

---

## Purpose

The GenAI Explanation Layer converts raw ML scores and feature values into **human-readable case summaries** that an analyst can immediately act on. Instead of showing just "Risk Score: 91.2", it explains *why* the account is suspicious.

---

## When is it Called?

```javascript
// In server/index.js, processTransaction():
if (scoring.compositeScore >= 65) {
  const explanation = await generateExplanation({
    account,
    transaction,
    scoring,
    featureMap
  });
  // Attached to the alert as ai_explanation
}
```

Only triggered for `compositeScore >= 65` to avoid excessive API calls (or template computation) for routine transactions.

---

## Gemini API Mode

When `GEMINI_API_KEY` is set in `.env`, the explainer calls the Gemini API.

### The Prompt

```javascript
const prompt = `You are a senior financial fraud analyst at Bank of India.

A machine learning system has flagged the following account and transaction. 
Analyze the behavioral signals and write a 3-4 sentence case summary.

=== FLAGGED ACCOUNT ===
Name: ${account.account_holder}
Account: ${account.account_number}
Bank: ${account.bank_name}
KYC Status: ${account.kyc_status}
Account Age: ${featureMap.account_age_days} days
Prior Flags: ${account.status === 'flagged' ? 'YES' : 'NO'}

=== TRIGGERING TRANSACTION ===
Amount: ₹${transaction.amount.toLocaleString('en-IN')}
Type: ${transaction.type}
Channel: ${transaction.channel}
Time: ${transaction.timestamp}

=== ML RISK ASSESSMENT ===
Composite Risk Score: ${scoring.compositeScore.toFixed(1)}/100
Model: ${scoring.modelType}
Velocity Sub-score: ${scoring.velocityScore}
Behavioral Sub-score: ${scoring.behavioralScore}
Graph Sub-score: ${scoring.graphScore}
Regulatory Sub-score: ${scoring.regulatoryScore}

=== KEY BEHAVIORAL SIGNALS ===
- Transactions in last 1 hour: ${featureMap.txn_count_1h}
- Transactions in last 24 hours: ${featureMap.txn_count_24h}
- Unique senders in 24h (fan-in): ${featureMap.unique_senders_24h}
- Unique receivers in 24h (fan-out): ${featureMap.unique_receivers_24h}
- Pass-through ratio: ${(featureMap.passthrough_ratio * 100).toFixed(0)}%
- Immediate pass-through detected: ${featureMap.immediate_passthrough ? 'YES ⚠️' : 'NO'}
- Off-hours transaction: ${featureMap.is_off_hours ? 'YES (Night activity)' : 'NO'}
- Round amount: ${featureMap.is_round_amount ? 'YES' : 'NO'}
- Near ₹50K threshold (structuring): ${featureMap.is_near_threshold ? 'YES ⚠️' : 'NO'}
- Cross-channel mixing: ${featureMap.cross_channel_mixing ? 'YES (Layering)' : 'NO'}
- Suspect registry match: ${featureMap.suspect_registry_match ? 'YES 🚨 (I4C/NCRP)' : 'NO'}
- Linked to flagged accounts: ${featureMap.linked_to_flagged ? 'YES ⚠️' : 'NO'}

Write a clear, concise case summary (3-4 sentences) explaining why this account is suspicious.
Reference specific signals. Use banking/fraud terminology.
End with: "Recommended Action: [FREEZE / ESCALATE TO COMPLIANCE / MONITOR]"

Do NOT include any JSON, markdown headers, or bullet points. Plain paragraph text only.`;
```

### API Call

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const result = await model.generateContent(prompt);
const explanation = result.response.text();
```

---

## Template Fallback Mode

When no Gemini API key is configured, a deterministic template engine generates explanations based on which features are elevated.

```javascript
function generateTemplateExplanation({ account, transaction, scoring, featureMap }) {
  const signals = [];
  
  // Check each feature and add to signals array
  if (featureMap.suspect_registry_match) {
    signals.push(`CRITICAL: Account identifier matches I4C Suspect Registry — 
    reported for financial fraud (${registryReason}).`);
  }
  
  if (featureMap.immediate_passthrough) {
    const gap = featureMap.avg_time_between_txns;
    signals.push(`HIGH RISK: Immediate pass-through pattern — funds received and 
    forwarded within ${Math.round(gap/60)} minutes.`);
  }
  
  if (featureMap.unique_senders_24h > 8) {
    signals.push(`HIGH RISK: Fan-in pattern detected — ${featureMap.unique_senders_24h} 
    unique senders deposited funds in 24 hours.`);
  }
  
  if (featureMap.passthrough_ratio > 0.80) {
    signals.push(`HIGH RISK: ${(featureMap.passthrough_ratio*100).toFixed(0)}% 
    of received funds immediately forwarded — consistent with mule account layering.`);
  }
  
  if (featureMap.is_new_account && featureMap.account_age_days < 30) {
    signals.push(`MODERATE: Account only ${featureMap.account_age_days} days old 
    with high transaction volume.`);
  }
  
  if (featureMap.is_off_hours) {
    signals.push(`MODERATE: Off-hours transaction activity detected.`);
  }
  
  if (featureMap.is_near_threshold) {
    signals.push(`MODERATE: Structuring behavior — amount of 
    ₹${transaction.amount.toLocaleString()} just below ₹50,000 reporting threshold.`);
  }
  
  if (featureMap.linked_to_flagged) {
    signals.push(`MODERATE: Account transacting with previously flagged accounts.`);
  }
  
  const actionMap = {
    critical: 'FREEZE AND ESCALATE TO COMPLIANCE',
    high:     'ESCALATE TO ANALYST REVIEW',
    medium:   'MONITOR AND COLLECT MORE DATA'
  };
  
  return [
    `Account ${account.account_number} (${account.account_holder}) has been flagged ` +
    `with a risk score of ${scoring.compositeScore.toFixed(1)}/100 ` +
    `by the ${scoring.modelType} model.`,
    signals.join(' '),
    `Recommended Action: ${actionMap[scoring.riskLevel]}.`
  ].join(' ');
}
```

---

## Adding Your Gemini API Key

1. Go to [https://ai.google.dev/](https://ai.google.dev/)
2. Click "Get API Key" → Create a project → Copy the key
3. Add to your `.env` file:
   ```
   GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX
   ```
4. Restart the server — no code changes needed

The free tier (Gemini 1.5 Flash) allows 15 requests/minute and 1,500 requests/day, which is more than enough for the hackathon demo.

---

## Example Outputs

### Gemini API Output (High Risk)
> "Account 4821763901 (Ravi Dubey) demonstrates classic mule account behavior with a composite risk score of 91.2/100. The account received ₹3.8L from 14 distinct sources within 47 minutes and immediately forwarded 93% of those funds to downstream accounts, consistent with structured money laundering. Additionally, the account was opened only 23 days ago, operates primarily during off-hours (2-4 AM), and the registered phone number is linked to NCRP Complaint NCRP/2026/100001 filed for UPI phishing. Recommended Action: FREEZE AND ESCALATE TO COMPLIANCE."

### Template Fallback Output (High Risk)
> "Account 4821763901 (Ravi Dubey) has been flagged with a risk score of 91.2/100 by the xgboost+isolation_forest model. CRITICAL: Account identifier matches I4C Suspect Registry — reported for UPI phishing. HIGH RISK: Immediate pass-through pattern — funds received and forwarded within 3 minutes. HIGH RISK: Fan-in pattern detected — 14 unique senders deposited funds in 24 hours. HIGH RISK: 93% of received funds immediately forwarded — consistent with mule account layering. MODERATE: Account only 23 days old with high transaction volume. MODERATE: Off-hours transaction activity detected. Recommended Action: FREEZE AND ESCALATE TO COMPLIANCE."
# 09 — React Dashboard Guide

> **Anviksha** | Bank of India Hackathon 2026  
> Dashboard URL: `http://localhost:5173`

---

## Table of Contents
- [Design System](#design-system)
- [App Shell & State Management](#app-shell--state-management)
- [Tab 1: Live Feed](#tab-1-live-feed)
- [Tab 2: Flagged Accounts](#tab-2-flagged-accounts)
- [Tab 3: Network Graph](#tab-3-network-graph)
- [Tab 4: Analytics](#tab-4-analytics)
- [Tab 5: Regulatory Feeds](#tab-5-regulatory-feeds)
- [Shared Components](#shared-components)
- [Adding New Pages](#adding-new-pages)

---

## Design System

All design tokens are defined in `client/src/index.css`. Every component uses these variables — never hardcoded colors.

### Color Palette

```css
:root {
  /* Backgrounds */
  --bg-primary:    #0a0e27;              /* Deep navy — main background */
  --bg-secondary:  #0d1230;             /* Slightly lighter — sidebar, card borders */
  --bg-card:       rgba(255,255,255,0.04); /* Glassmorphism card surface */
  --bg-card-hover: rgba(255,255,255,0.07); /* Card hover state */
  
  /* Accent colors */
  --accent-blue:   #00d4ff;             /* Electric blue — primary actions, links */
  --accent-red:    #ff3366;             /* Danger red — critical alerts, FREEZE */
  --accent-amber:  #ffaa00;             /* Warning amber — medium risk, REVIEW */
  --accent-green:  #00ff88;             /* Success green — normal, safe */
  --accent-purple: #a855f7;             /* Purple — ML/AI indicators */
  
  /* Text */
  --text-primary:   #e8eaf6;            /* Primary text */
  --text-secondary: #8892b0;            /* Secondary/muted text */
  --text-accent:    #00d4ff;            /* Highlighted text */
  
  /* Typography */
  --font-main: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Spacing */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  
  /* Glassmorphism */
  --glass-bg:     rgba(255, 255, 255, 0.04);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur:   backdrop-filter: blur(20px);
}
```

### Risk Color Mapping

```css
.risk-low      { color: var(--accent-green); }  /* score 0-40 */
.risk-medium   { color: var(--accent-amber); }  /* score 41-70 */
.risk-high     { color: #ff6b35; }              /* score 71-85 */
.risk-critical { color: var(--accent-red); }    /* score 86-100 */
```

---

## App Shell & State Management

`client/src/App.jsx` is the root component. It manages:

1. **WebSocket connection** — connects to `ws://localhost:3001` on mount, reconnects on close
2. **Global state** — transactions list, alerts, flagged accounts, registry entries
3. **Tab navigation** — which page is currently active
4. **Stats** — the header stats bar (total txns, alerts, etc.)

```jsx
// Simplified App.jsx structure:
function App() {
  const [activeTab, setActiveTab] = useState('livefeed');
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState([]);
  const [registryEntries, setRegistryEntries] = useState([]);
  const [stats, setStats] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  
  useEffect(() => {
    // Fetch initial data from REST APIs
    fetchDashboardStats();
    fetchFlaggedAccounts();
    fetchAlerts();
    fetchRegistryEntries();
    
    // Connect WebSocket for live updates
    connectWebSocket();
  }, []);
  
  return (
    <div className="app">
      <Header stats={stats} wsConnected={wsConnected} alertCount={alerts.filter(a => a.status === 'open').length} />
      <nav className="tabs">
        {tabs.map(tab => <TabButton key={tab.id} ... />)}
      </nav>
      <main>
        {activeTab === 'livefeed'    && <LiveFeed transactions={transactions} />}
        {activeTab === 'flagged'     && <FlaggedAccounts accounts={flaggedAccounts} />}
        {activeTab === 'network'     && <NetworkGraph />}
        {activeTab === 'analytics'   && <Analytics />}
        {activeTab === 'regulatory'  && <RegulatoryFeeds entries={registryEntries} />}
      </main>
    </div>
  );
}
```

---

## Tab 1: Live Feed

**File:** `client/src/pages/LiveFeed.jsx`

Displays a real-time scrolling list of all transactions as they arrive via WebSocket.

### Features
- **Auto-scroll** — new transactions appear at the top
- **Pause on hover** — hovering stops the auto-scroll so you can read entries
- **Risk badge** — color-coded pill next to each transaction
- **Pulse animation** — transactions with risk score ≥ 71 pulse with a red glow
- **Expandable rows** — click a transaction to see all 19 features
- **Max 100 items** — older items are removed to prevent memory growth

### Transaction Row Colors
- ✅ Green border = score 0–40 (normal)
- ⚠️ Amber border = score 41–70 (medium risk)
- 🚨 Red border + pulse = score 71–100 (critical)

### What each row shows
```
[TYPE] [SENDER → RECEIVER] [AMOUNT] [RISK SCORE] [TIME]

UPI   Aarav Sharma → Ravi Dubey   ₹45,000   87 🚨   03:24 AM
NEFT  Priya Mehta → Rajesh Kumar  ₹5,200     8 ✅   03:24 AM
```

---

## Tab 2: Flagged Accounts

**File:** `client/src/pages/FlaggedAccounts.jsx`

Shows all accounts with `risk_score > 0` sorted by risk score descending. Live updates as new accounts are flagged.

### Features
- **Risk score bar** — visual gradient bar (green→red) showing score percentage
- **Status badge** — ACTIVE / UNDER REVIEW / FLAGGED / FROZEN
- **Expandable detail panel** — click any row to expand:
  - AI explanation text
  - All 19 feature values with visual indicators
  - 5 most recent transactions
  - Direct connections (neighbor accounts)
  - Action buttons: **Freeze Account** / **Mark Resolved**
- **Sort** — can sort by risk_score, account_holder, account_age_days
- **Filter** — show only flagged, frozen, under_review

### Feature Display in Expanded Panel

Each feature is shown with:
- Name and current value
- A color indicator (red if suspicious threshold exceeded)
- A short explanation

Example expanded panel for Ravi Dubey:
```
┌─────────────────────────────────────────┐
│  Ravi Dubey — Account 4821763901        │
│  Risk Score: 87.4/100 ██████████░ 87%   │
│  Status: 🔴 FLAGGED                     │
│                                         │
│  AI EXPLANATION:                        │
│  "Account exhibits classic mule         │
│   behavior: 14 unique senders in 47     │
│   minutes, 93% pass-through ratio..."   │
│                                         │
│  ML FEATURES:                           │
│  txn_count_1h:        12  🔴 HIGH       │
│  passthrough_ratio:   93% 🔴 HIGH       │
│  unique_senders_24h:  14  🔴 HIGH       │
│  suspect_registry:    YES 🔴 MATCH      │
│  account_age_days:    23  🟡 NEW        │
│  is_off_hours:        YES 🟡 SUSPICIOUS │
│                                         │
│  [FREEZE ACCOUNT]  [MARK RESOLVED]      │
└─────────────────────────────────────────┘
```

---

## Tab 3: Network Graph

**File:** `client/src/pages/NetworkGraph.jsx`

Interactive force-directed network graph powered by D3.js v7.

### Controls
- **Zoom**: Scroll wheel
- **Pan**: Click and drag on empty space
- **Move nodes**: Click and drag individual nodes
- **Select node**: Single click → opens detail panel on right
- **Reset view**: Double-click on empty space

### Node Visual Encoding
| Color | Meaning |
|-------|---------|
| 🟢 Bright green | Active — normal account |
| 🟡 Amber | Under review |
| 🔴 Pulsing red | Flagged — mule suspected |
| ⬛ Dark gray | Frozen — analyst action taken |

Node **size** scales with `risk_score` — riskier accounts are larger and more visible.

### Edge Visual Encoding
- **Thickness**: proportional to `txn_count` (more transactions = thicker line)
- **Color**: gradient from blue (low amount) to red (high amount)
- **Arrows**: directed → shows money flow direction

### The Mule Pattern Visible in the Graph

When the simulation has been running for a few minutes, you'll see:
- Red/amber nodes (mule accounts) in the center
- Many thin arrows pointing INTO them from green nodes (victims/sources)
- One or two thick arrows pointing OUT from them to other accounts (layering)

This is the classic **fan-in** mule topology — visually obvious to judges.

---

## Tab 4: Analytics

**File:** `client/src/pages/Analytics.jsx`

Recharts-powered dashboard with 4 charts.

### Chart 1: Risk Distribution Histogram
- X-axis: Risk score buckets (0-20, 21-40, 41-60, 61-80, 81-100)
- Y-axis: Number of transactions
- Color: gradient from green (low) to red (high)

### Chart 2: Transaction Volume by Channel
- Pie chart with segments for UPI, NEFT, IMPS, ATM, RTGS
- Both count and volume shown on hover

### Chart 3: Flagged Transactions Over Time
- Line chart, last 24 hours, hourly buckets
- Shows when fraud bursts occurred

### Chart 4: Top 10 Riskiest Accounts
- Horizontal bar chart
- Bars colored by risk level (amber/red)
- Account name on Y-axis, score on X-axis

---

## Tab 5: Regulatory Feeds

**File:** `client/src/pages/RegulatoryFeeds.jsx`

### Feed Status Panel

Shows connection status for all 4 regulatory feeds:

```
┌────────────────────────────────────────────────────────┐
│  REGULATORY FEED STATUS                               │
│                                                        │
│  ● I4C Suspect Registry    CONNECTED  Last: 2min ago  │
│  ● NCRP Complaint Feed     CONNECTED  Last: 8min ago  │
│  ● 1930 Helpline Feed      CONNECTED  Last: 15min ago │
│  ● RBI DPIP                DEGRADED   Last: 3hr ago   │
└────────────────────────────────────────────────────────┘
```

- Green pulsing dot = connected
- Red dot = degraded/offline

### Suspect Registry Table

Sortable table of all entries with:
- `identifier_type`: phone / upi / account
- `identifier_value`: the actual blacklisted value
- `source`: I4C / NCRP / 1930_helpline / RBI_DPIP
- `complaint_ref`: reference number
- `reason`: why they're flagged
- `reported_at`: date

New entries added by the I4C generator slide in from the top with a highlight animation.

---

## Shared Components

### `RiskBadge` — Risk score visual pill

```jsx
// Usage:
<RiskBadge score={87.3} />

// Renders:
// 🔴 87 (pulsing red for critical)
// 🟡 55 (amber for high risk)
// 🟢 12 (green for normal)
```

### `StatCard` — Metric card in the header

```jsx
<StatCard
  label="Flagged Accounts"
  value={3}
  icon={<AlertTriangle />}
  trend="+1 today"
  color="red"
/>
```

### `TransactionRow` — Single transaction in the Live Feed

```jsx
<TransactionRow
  transaction={txn}
  onClick={() => setSelected(txn)}
  expanded={selected?.id === txn.id}
/>
```

---

## Adding New Pages

1. Create `client/src/pages/YourPage.jsx`
2. Add the tab to `App.jsx`:
```jsx
const tabs = [
  { id: 'livefeed', label: 'Live Feed', icon: <Activity /> },
  { id: 'yourpage', label: 'Your Page', icon: <YourIcon /> },  // ← add here
  ...
];
```
3. Render it in the `<main>` section:
```jsx
{activeTab === 'yourpage' && <YourPage />}
```
4. Use the design system variables in your CSS for consistent styling.
# 10 — Transaction & I4C Feed Generators

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Transaction Generator (DataSet Mode)](#transaction-generator-dataset-mode)
- [Simulated UI Metadata](#simulated-ui-metadata)
- [I4C Feed Generator](#i4c-feed-generator)
- [Customizing the Generators](#customizing-the-generators)

---

## Transaction Generator (DataSet Mode)

**File:** `server/generators/transaction-generator.js`

In the initial iteration of the system, this generator built synthetic behaviors (like rapid "fan-in" or "pass-through" sequences) and extracted 19 real-time graph features.

**Currently**, the system is powered entirely by the provided `DataSet.csv` containing over 9000 rows with 18 abstract features (`F115` through `F3894`) and a target variable (`F3924`).

### How It Works

1. **Pre-loading Data**: During Python training (`train_model.py`), a lightweight `dataset_features.json` file is exported.
2. **Booting**: The `transaction-generator.js` loads this JSON file into memory on startup.
3. **Sampling**: Every 2 seconds (configurable), the generator randomly selects a row from the dataset. 
4. **Fraud Probability**: The generator deliberately selects fraud rows (where `F3924 = 1`) ~10% of the time to ensure the dashboard has alerts to display. 

```javascript
// Inside transaction-generator.js
intervalHandle = setInterval(() => {
  // 10% chance of picking a fraud record
  const isFraud = Math.random() < 0.10;
  const transaction = generateTransaction(accounts, isFraud);
  
  if (transaction) {
    onTransaction(transaction);
  }
}, intervalMs);
```

---

## Simulated UI Metadata

Because `DataSet.csv` only contains abstract ML features (like `F2082`), it lacks visual metadata such as Sender Name, Receiver Name, and Amount in Rupees. 

To keep the Anviksha Dashboard visually appealing and realistic, the generator creates **fake UI metadata** for the dashboard, while secretly attaching the **real abstract dataset features** for the backend ML model to score.

### Fake Metadata Generation
```javascript
// Generated strictly for UI visuals
const sender = accounts[Math.floor(Math.random() * accounts.length)];
const receiver = accounts[Math.floor(Math.random() * accounts.length)];

const amount = isFraud 
  ? Math.round((Math.random() * 150000 + 20000) / 1000) * 1000
  : Math.round(Math.random() * 50000 + 100);
  
const type = weightedRandom(['UPI', 'NEFT', 'IMPS'], [0.6, 0.2, 0.2]);
```

### Real Feature Injection
The actual row data from `DataSet.csv` is mapped into a `dataset_features` object and sent to the `feature-extractor.js`.
```javascript
// Injected for the ONNX XGBoost model to score
const dataset_features = {
  F115: Number(record.F115),
  F321: Number(record.F321),
  // ...
  F3889: String(record.F3889), // E.g., 'G365D'
  F3891: String(record.F3891), // E.g., 'salaried'
  F3894: Number(record.F3894)
};
```

### Layer 1 Shield: JA3 TLS Fingerprinting
To simulate real-world botnet attacks, the generator injects a `ja3_fingerprint`. There is a 5% chance of injecting a known malicious fingerprint.
```javascript
  // Simulate JA3 TLS fingerprint
  const isMaliciousBot = Math.random() < 0.05;
  const ja3_fingerprint = isMaliciousBot
    ? MALICIOUS_JA3[Math.floor(Math.random() * MALICIOUS_JA3.length)]
    : NORMAL_JA3[Math.floor(Math.random() * NORMAL_JA3.length)];
```
When the generator POSTs this to the Go Ingestion Service (`http://ingestion-service:8080/api/ingest`), the Go service instantly drops the request (returning 403 Forbidden) before it ever reaches the Redpanda (Kafka) queue.

---

## I4C Feed Generator

**File:** `server/generators/i4c-feed-generator.js`

Simulates periodic updates from I4C (Indian Cyber Crime Coordination Centre) and NCRP (National Cyber Crime Reporting Portal).

### Timing

Fires on a **random interval** averaging 45 seconds to simulate the unpredictable nature of regulatory feed updates:

```javascript
function scheduleNext() {
  const delay = randomBetween(20000, 90000);  // 20-90 seconds
  setTimeout(() => {
    generateFeedEntry();
    scheduleNext();  // Schedule the next one
  }, delay);
}
```

### Generated Entry Types

The generator randomly creates entries of different types and categories:

```javascript
const ENTRY_TYPES = [
  { type: 'phone',   source: 'I4C',          weight: 0.35 },
  { type: 'upi',     source: 'NCRP',         weight: 0.30 },
  { type: 'account', source: '1930_helpline', weight: 0.20 },
  { type: 'device',  source: 'RBI_DPIP',     weight: 0.15 },
];

const FRAUD_CATEGORIES = [
  'Investment fraud — fake trading app',
  'UPI phishing — fake bank SMS',
  'Job scam — advance fee fraud',
  'Loan app fraud — data extortion',
  'Lottery scam — KBC winner fraud',
  'SIM swap — OTP theft',
  'Cyber fraud — fake government officer',
  'Online shopping fraud',
];
```

### Matching Logic

After inserting a new entry, the generator checks if any active account matches. 
*Note: In DataSet mode, the I4C matching is purely for visual dashboard alerts and no longer directly impacts the 18-feature ONNX scoring.*

```javascript
function checkForMatches(newEntry) {
  const accounts = stmts.getAllAccounts.all({ status: 'active' });
  
  accounts.forEach(account => {
    const isMatch = (
      (newEntry.identifier_type === 'phone'   && account.phone === newEntry.identifier_value) ||
      (newEntry.identifier_type === 'upi'     && account.upi_id === newEntry.identifier_value) ||
      (newEntry.identifier_type === 'account' && account.account_number === newEntry.identifier_value)
    );
    
    if (isMatch) {
      console.log(`[I4C] 🚨 REGISTRY MATCH: Account ${account.account_number} (${account.account_holder})`);
    }
  });
}
```

---

## Customizing the Generators

### Change transaction rate

```bash
# In .env:
SIMULATION_INTERVAL=1000   # 1 transaction/second (fast demo)
SIMULATION_INTERVAL=5000   # 1 transaction/5 seconds (slow demo for presentations)
```

### Increase fraud injection rate

In `transaction-generator.js`:
```javascript
// Change 0.10 to inject fraud more frequently:
if (Math.random() < 0.25) {  // 25% chance instead of 10%
```
# 11 — Troubleshooting Guide

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Server Won't Start](#server-wont-start)
- [ML Training Errors](#ml-training-errors)
- [ONNX Loading Errors](#onnx-loading-errors)
- [Database Errors](#database-errors)
- [Frontend Errors](#frontend-errors)
- [WebSocket Issues](#websocket-issues)
- [API Errors](#api-errors)
- [Gemini API Errors](#gemini-api-errors)

---

## Server Won't Start

### Error: `Cannot find package 'dotenv'`
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'dotenv'
```

**Fix:**
```bash
npm install dotenv
```

---

### Error: `Cannot find package 'better-sqlite3'`
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3'
```

**Fix:**
```bash
npm install better-sqlite3
# If it fails with binding errors on Windows:
npm install --build-from-source better-sqlite3
```

---

### Error: Port 3001 already in use
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Fix (Windows):**
```powershell
# Find what's using port 3001:
netstat -ano | findstr :3001
# Kill that process (replace 12345 with the PID):
taskkill /PID 12345 /F
```

**Alternative:** Change the port in `.env`:
```
PORT=3002
```

---

### Error: `data/anviksha.db` not found (database not seeded)
```
SqliteError: no such table: accounts
```

**Fix:**
```bash
npm run seed
```

---

## ML Training Errors

### Error: `ModuleNotFoundError: No module named 'xgboost'`
```
ModuleNotFoundError: No module named 'xgboost'
```

**Fix:**
```bash
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common
```

---

### Error: Wrong `FloatTensorType` import
```
RuntimeError: Operator XGBClassifier (type: XGBClassifier) got an input float_input 
with a wrong type <class 'onnxconverter_common.data_types.FloatTensorType'>.
Only [<class 'onnxmltools.convert.common.data_types.FloatTensorType'>, ...] are allowed
```

**Root cause:** You're importing `FloatTensorType` from the wrong package.

**Fix in `train_model.py`:**
```python
# ❌ Wrong:
from onnxconverter_common import FloatTensorType as OnnxFloatTensorType

# ✅ Correct:
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType
```

---

### Error: Isolation Forest `ai.onnx.ml` version error
```
RuntimeError: The model is using version 4 of domain 'ai.onnx.ml' not supported yet 
by this library. You need to specify target_opset={'ai.onnx.ml': 3}.
```

**Fix in `train_model.py`:**
```python
# ❌ Wrong:
onnx_iso = convert_sklearn(iso_model, initial_types=..., target_opset=12)

# ✅ Correct:
onnx_iso = convert_sklearn(iso_model, initial_types=..., target_opset={'': 12, 'ai.onnx.ml': 3})
```

---

### Warning: `use_label_encoder` (not an error — ignore)
```
Parameters: { "use_label_encoder" } are not used.
```

This is a warning from XGBoost about a deprecated parameter. It doesn't affect training. Ignore it.

---

### Training completes but no `.onnx` files

If the script completes without the ONNX export step, check for errors between `[STEP 3]` and `[STEP 4]`. The training output should show:

```
[STEP 4] Exporting models to ONNX...
[EXPORT] Converting XGBoost to ONNX...
[EXPORT] XGBoost saved to C:\...\server\ml\models\xgboost_fraud.onnx
[EXPORT] Converting Isolation Forest to ONNX...
[EXPORT] Isolation Forest saved to C:\...\server\ml\models\isolation_forest.onnx
```

If you see an error between these lines, see the specific error above.

---

## ONNX Loading Errors

### Server shows `[ML] ⚠️ ONNX model files not found`

The ONNX files don't exist. You need to run the training script first:
```bash
python server/ml/train_model.py
```

---

### Error: `onnxruntime-node` not found
```
Error: Cannot find module 'onnxruntime-node'
```

**Fix:**
```bash
npm install onnxruntime-node
```

---

### Error: `Error: Node.js native addon was not built`
```
Error: The native addon was not built. 
Please try to rebuild onnxruntime-node...
```

**Fix:**
```bash
npm rebuild onnxruntime-node
# Or reinstall:
npm uninstall onnxruntime-node && npm install onnxruntime-node
```

---

### ONNX model loads but scores seem wrong

If the compositeScore is always 0 or always 100, the feature extractor may be sending wrong values.

**Debug:**
```powershell
# Check a specific transaction's features:
Invoke-RestMethod -Uri "http://localhost:3001/api/transactions?limit=1" | ConvertTo-Json -Depth 5
# Look at features_json — all values should be non-negative numbers
```

---

## Database Errors

### `SqliteError: database disk image is malformed`

The SQLite file is corrupted.

**Fix:**
```bash
del data\anviksha.db
npm run seed
```

---

### `SqliteError: UNIQUE constraint failed: transactions.txn_ref`

Duplicate transaction reference being inserted. This can happen if the server is started twice simultaneously.

**Fix:** Stop all server instances, then restart.

---

### Database grows too large during demo

The simulation inserts a transaction every 2 seconds. Over several hours, the DB will grow significantly.

**Fix:**
```bash
npm run seed  # Clears and re-seeds
```

---

## Frontend Errors

### Vite fails to start
```
Error: EADDRINUSE: address already in use :::5173
```

**Fix:**
```powershell
netstat -ano | findstr :5173
taskkill /PID <pid> /F
npm run dev:client
```

---

### Browser shows blank page

Check browser console (F12) for errors:

1. **"Cannot GET /"** — Vite isn't running. Start with `npm run dev:client`
2. **React errors** — Check the console for component errors
3. **CORS errors** — Make sure the backend is running on port 3001

---

### Dashboard not updating (WebSocket issues)

See [WebSocket Issues](#websocket-issues) below.

---

## WebSocket Issues

### Connection shows red dot ("Disconnected")

The WebSocket connection to the backend failed.

**Checks:**
1. Is the backend running? Visit `http://localhost:3001/api/health`
2. Is the backend on port 3001? Check `PORT` in `.env`
3. Check browser console for WebSocket error details

---

### No transactions appearing in Live Feed

Even if connected, no transactions = generator might not be running.

**Check server logs for:**
```
[GENERATOR] Starting transaction generator (interval: 2000ms)
```

If you see this, wait 2 seconds for the first transaction.
If you don't see it, the generator didn't start — restart the server.

---

### WebSocket sends `init` but no `transaction` events

The generator might have thrown an error. Check server logs for:
```
[GENERATOR] Error: ...
```

---

## API Errors

### `404 Not Found` for all routes

Express routes not mounted. Check `server/index.js` for:
```javascript
app.use('/api/transactions', transactionRouter);
app.use('/api/accounts', accountRouter);
// etc.
```

---

### POST /api/transactions returns 500

Usually means the scoring engine threw an error. Check server logs for:
```
[SCORING] Error: ...
```

Common causes:
- Feature extractor couldn't find the account in DB (wrong `account_id`)
- ONNX session is null (models didn't load)

---

## Gemini API Errors

### `Error: API key not valid`
```
GoogleGenerativeAIError: API key not valid
```

**Fix:** Update `GEMINI_API_KEY` in `.env` with a valid key from [ai.google.dev](https://ai.google.dev).

The system automatically falls back to template explanations — functionality is not affected.

---

### `Error: Resource has been exhausted (e.g. check quota)`

You've hit the free tier rate limit (15 req/min or 1500/day).

**Temporary fix:** The system uses template fallback when Gemini fails, so the dashboard continues to work. Wait for the rate limit to reset.

**Permanent fix:** The explainer only calls Gemini for `score >= 65`, which limits calls to high-risk transactions only. If you're hitting limits, raise this threshold in `server/ml/explainer.js`:
```javascript
// Change 65 to 75 to call Gemini less frequently:
if (scoring.compositeScore >= 75) {
  const explanation = await generateExplanation(...);
}
```

---

### Gemini returning empty string

Some prompts may return an empty response from Gemini. The explainer handles this with a fallback:
```javascript
const text = result.response.text();
if (!text || text.trim().length < 10) {
  return generateTemplateExplanation(data);  // Fallback
}
return text;
```
# 12 — Demo Script for Judges

> **Anviksha** | Bank of India Hackathon 2026

---

## Preparation (Before Judges Arrive)

1. Run `npm run seed` to have a clean database with initial data.
2. Ensure you have trained the ML models (`python server/ml/train_model.py`).
3. Start the application: `npm run dev`.
4. Open the dashboard at `http://localhost:5173`.
5. Confirm the header says "ML: XGBoost + Isolation Forest (ONNX)".
6. Confirm the green live indicator in the header is pulsing.
7. Keep the "Live Feed" tab active.

---

## The Pitch (5 Minutes)

### 1. Introduction & The Problem (1 minute)
**Speaker:** "Hello Judges. We built Anviksha, a real-time AI-powered mule account detection platform for Problem 2. Mule accounts are the lifeblood of financial fraud, used to launder money through complex layering networks. Traditional systems rely on static rules, which fraudsters easily evade by structuring transactions. Anviksha solves this by analyzing the entire transaction network in real-time using machine learning and graph theory."

*Action: Point to the Live Feed tab.*
"Here you can see our live transaction stream, simulating UPI, NEFT, IMPS, and ATM transactions flowing in every 2 seconds. Every single transaction is instantly evaluated by our ML pipeline."

### 2. The ML Engine & Features (1 minute)
*Action: Wait for a high-risk transaction (amber or red badge) to appear, or scroll down to find one. Click on it to expand.*

**Speaker:** "Under the hood, we extract 19 distinct behavioral features instantly. This includes velocity, off-hours activity, structuring, but most importantly: graph and regulatory features. 

Our scoring engine runs entirely in Node.js using ONNX inference. We don't just use one model—we use two. An **XGBoost** classifier detects known fraud patterns like structuring, while an **Isolation Forest** anomaly detector catches novel patterns. This combined approach gives us a highly accurate composite score from 0 to 100."

### 3. Mule Patterns & AI Explainer (1 minute)
*Action: Click on the "Flagged Accounts" tab.*

**Speaker:** "This takes us to the analyst view. Here are the accounts our system has flagged. Let's look at the riskiest one."

*Action: Click the top row to expand it.*

**Speaker:** "Instead of just giving analysts a score and making them dig through data, Anviksha uses Generative AI—specifically the Gemini API—to write a plain-language case summary. It tells us exactly *why* this account is suspicious: 'Fan-in pattern of 14 senders, immediate pass-through of 93% of funds.' The system can recommend an automatic freeze or escalate it to compliance."

### 4. Graph Analysis & Regulatory Integration (1 minute)
*Action: Click on the "Network Graph" tab.*

**Speaker:** "One of the key patterns is the 'Fan-In' structure. This D3 visualization is powered by our in-memory graph analyzer. You can clearly see the red flagged nodes acting as central hubs, gathering funds from multiple victims and layering them out."

*Action: Click on the "Regulatory Feeds" tab.*

**Speaker:** "Finally, we integrate directly with external intelligence. We simulate a live feed from the I4C Suspect Registry and NCRP. If an incoming transaction involves a phone number, UPI ID, or account number that appears on these blacklists, the system instantly boosts its regulatory risk score to critical."

### 5. Conclusion (30 seconds)
**Speaker:** "Anviksha is built for scale. By using ONNX, we achieve sub-millisecond inference times directly on the Node server, eliminating the need for complex Python microservices. It's real-time, highly accurate, explainable, and ready to deploy. We'd be happy to answer any questions."

---

## Anticipated Questions & Answers

**Q: How do you handle false positives?**
A: "We use an Exponential Moving Average (EMA) for account scoring. A single weird transaction won't freeze your account. It takes sustained anomalous behavior to reach the 'Flagged' threshold. Additionally, the AI explanation layer ensures human analysts can quickly verify the context before freezing."

**Q: Why use ONNX instead of a Python API?**
A: "Calling a Python API over HTTP for every single transaction introduces latency overhead (often 20-50ms). By compiling XGBoost and Isolation Forest to ONNX, we run them natively inside Node.js memory. Inference takes less than 1 millisecond per transaction, making it extremely scalable."

**Q: What if the Gemini API goes down or rate limits?**
A: "We built the system with graceful degradation. If the Gemini API is unreachable or rate-limited, Anviksha instantly falls back to a deterministic, rule-based template engine that generates explanations based on feature thresholds. The dashboard never breaks."

**Q: How did you train the ML model?**
A: "We generated a synthetic dataset of 20,000 transactions based on mule behavior patterns outlined in the RBIH MuleHunter research paper. This includes fan-in aggregation, high pass-through ratios, and structuring behavior. We trained an XGBoost model to classify these and an Isolation Forest to find outliers, then exported both to ONNX."

**Q: Does it use a graph database?**
A: "To keep the tech stack lean and hackathon-friendly, we built a custom in-memory directed graph engine within Node.js that persists edges to SQLite. In a production environment, this module can be swapped out for Neo4j or Amazon Neptune."
