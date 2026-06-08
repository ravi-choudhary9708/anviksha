# Anviksha — Comprehensive Technical Guide
## AI-Powered Mule Account & Fraud Detection System

> **Version:** 1.0.0 | **Hackathon:** Bank of India 2026 | **Stack:** Node.js + React + Python + ONNX

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [File Structure](#3-file-structure)
4. [Environment Setup](#4-environment-setup)
5. [Database: Schema & Seeding](#5-database-schema--seeding)
6. [Mock Data Generators](#6-mock-data-generators)
7. [ML Pipeline: Features](#7-ml-pipeline-features)
8. [ML Pipeline: Training the Models](#8-ml-pipeline-training-the-models)
9. [ML Pipeline: ONNX Conversion](#9-ml-pipeline-onnx-conversion)
10. [ML Pipeline: Node.js Inference](#10-ml-pipeline-nodejs-inference)
11. [Graph Analysis Engine](#11-graph-analysis-engine)
12. [GenAI Explanation Layer](#12-genai-explanation-layer)
13. [API Routes Reference](#13-api-routes-reference)
14. [WebSocket Events Reference](#14-websocket-events-reference)
15. [React Dashboard](#15-react-dashboard)
16. [Running the Project](#16-running-the-project)
17. [Full Startup Sequence (A→Z)](#17-full-startup-sequence-az)
18. [Demo Script for Judges](#18-demo-script-for-judges)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Project Overview

**Anviksha** (Sanskrit: "investigation", "inquiry") is a real-time mule account detection platform built to solve the problem of financial mule networks — accounts used as intermediaries to launder fraud proceeds.

### What it does

| Feature | Description |
|---------|-------------|
| **Real-time ingestion** | Consumes UPI, NEFT, IMPS, ATM transactions every 2 seconds |
| **ML Scoring** | XGBoost + Isolation Forest (ONNX) scores each transaction 0–100 |
| **19 Behavioral Features** | Velocity, behavioral, account, graph, and regulatory signals |
| **Graph Analysis** | Fan-in/fan-out detection, layering chains, clustering coefficients |
| **GenAI Explanations** | Gemini API generates case summaries for flagged accounts |
| **Regulatory Integration** | Simulates I4C/NCRP/1930 suspect registry feeds |
| **Live Dashboard** | React app with WebSocket-driven real-time updates |
| **Zero Config DB** | SQLite — no PostgreSQL install required |

### Design Principles
- **Hackathon-first**: Runs with `npm run dev` + `python train_model.py`, no Docker/Kafka/Redis required
- **Graceful degradation**: Falls back to rule-based scoring if ONNX models not found; falls back to template explanations if Gemini key not set
- **Transparent ML**: Sub-scores (velocity, behavioral, graph, regulatory) are always computed and shown alongside ONNX output

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION LAYER                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Transaction Gen  │  │  I4C Feed Gen    │  │  Bank TMS Alerts     │ │
│  │ (UPI/NEFT/IMPS)  │  │  (NCRP/1930)    │  │  (Internal Flags)    │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬────────────┘ │
└───────────┼─────────────────────┼────────────────────────┼─────────────┘
            │                     │                         │
            ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS.JS BACKEND                               │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    processTransaction()                           │  │
│  │  1. Extract Features (19 behavioral signals)                      │  │
│  │  2. ONNX Inference (XGBoost → fraud prob + Isolation Forest)     │  │
│  │  3. Compute Composite Score (weighted formula)                    │  │
│  │  4. Update Graph (fan-in/fan-out analysis)                        │  │
│  │  5. Generate Alert (if score ≥ 41)                                │  │
│  │  6. GenAI Explanation (if score ≥ 65)                             │  │
│  │  7. Broadcast via WebSocket                                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  REST API Routes:        WebSocket Events:                              │
│  /api/transactions       transaction (live feed)                        │
│  /api/accounts           alert (new flag)                               │
│  /api/alerts             suspect_registry (I4C update)                  │
│  /api/dashboard          init (connection established)                  │
│  /api/regulatory                                                        │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌──────────────────────┐    ┌─────────────────────────────────────────────┐
│   SQLite Database    │    │           REACT DASHBOARD                   │
│                      │    │                                             │
│  accounts            │    │  Tab 1: Live Feed (WebSocket stream)        │
│  transactions        │    │  Tab 2: Flagged Accounts (risk table)       │
│  alerts              │    │  Tab 3: Network Graph (D3.js force graph)   │
│  suspect_registry    │    │  Tab 4: Analytics (Recharts charts)         │
│  risk_scores         │    │  Tab 5: Regulatory Feeds (I4C status)       │
│  account_connections │    │                                             │
└──────────────────────┘    └─────────────────────────────────────────────┘
```

### Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend runtime | Node.js (v20+) | Async I/O for real-time streaming |
| API framework | Express.js 4 | Mature, simple, hackathon-friendly |
| WebSockets | `ws` package | Lightweight, works on same HTTP port |
| Database | SQLite via `better-sqlite3` | Zero install, synchronous, fast |
| ML inference | `onnxruntime-node` | Run Python-trained models in Node.js |
| ML training | XGBoost + scikit-learn (Python) | Industry-standard fraud detection |
| GenAI | Google Gemini API | Natural language case explanations |
| Frontend | React 18 + Vite 6 | Fast HMR, minimal config |
| Charts | Recharts | React-native charting |
| Graph viz | D3.js v7 | Force-directed network graphs |
| Icons | Lucide React | Consistent icon set |
| Styling | Vanilla CSS | Full control, no Tailwind overhead |

---

## 3. File Structure

```
mule/                                   ← Project root
├── package.json                        ← Root package (server deps + scripts)
├── .env                                ← Environment variables (create this)
├── .env.example                        ← Template for .env
├── .gitignore
├── AI_HANDOVER.md                      ← AI agent handover guide
├── README.md                           ← Quick start README
├── docs/
│   ├── COMPREHENSIVE_GUIDE.md          ← This file
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
│   └── routes/
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

## 4. Environment Setup

### Prerequisites

| Tool | Version | Required? |
|------|---------|-----------|
| Node.js | v20+ | ✅ Required |
| npm | v10+ | ✅ Required |
| Python | v3.9+ | ✅ Required (for ML training) |
| pip | any | ✅ Required (for Python deps) |
| Gemini API Key | — | ⚠️ Optional (has fallback) |

### Environment Variables

Create a `.env` file in the project root:

```env
# Server port
PORT=3001

# SQLite database path (auto-created)
DB_PATH=./data/anviksha.db

# Transaction simulation interval in milliseconds
# 2000 = one transaction every 2 seconds
SIMULATION_INTERVAL=2000

# Google Gemini API key (OPTIONAL)
# If not set, the system uses rule-based explanations
# Get one free at: https://ai.google.dev/
GEMINI_API_KEY=your_key_here
```

---

## 5. Database: Schema & Seeding

### Schema Overview

The database is SQLite, auto-created at `data/anviksha.db` on first startup.

#### Table: `accounts`
Stores bank accounts monitored by the system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `account_number` | TEXT | 10-digit account number |
| `account_holder` | TEXT | Full name |
| `ifsc_code` | TEXT | Branch IFSC code |
| `bank_name` | TEXT | Bank name |
| `upi_id` | TEXT | UPI identifier |
| `phone` | TEXT | Mobile number (used for registry check) |
| `account_type` | TEXT | savings / current / salary |
| `kyc_status` | TEXT | verified / pending / failed |
| `opened_date` | TEXT | ISO datetime |
| `risk_score` | REAL | Current risk score (0–100), updated via EMA |
| `status` | TEXT | active / under_review / flagged / frozen |
| `is_mule` | INTEGER | 0/1 ground truth label (not shown in UI) |
| `created_at` | TEXT | Record creation timestamp |

#### Table: `transactions`
Every financial transaction ingested.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `txn_ref` | TEXT | Bank transaction reference number |
| `type` | TEXT | UPI / NEFT / IMPS / ATM / RTGS |
| `amount` | REAL | Amount in ₹ |
| `sender_account_id` | TEXT | FK → accounts.id |
| `receiver_account_id` | TEXT | FK → accounts.id |
| `channel` | TEXT | digital / branch / atm |
| `description` | TEXT | Payment description |
| `timestamp` | TEXT | Transaction datetime |
| `risk_score` | REAL | ML-computed risk score for this txn |
| `is_flagged` | INTEGER | 0/1 — flagged if score ≥ 41 |
| `features_json` | TEXT | JSON of all 19 extracted features |
| `ml_scores_json` | TEXT | JSON of sub-scores (velocity/behavioral/graph/regulatory) |

#### Table: `alerts`
Generated when a transaction or account hits a risk threshold.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `alert_type` | TEXT | ml_flag / regulatory / analyst |
| `severity` | TEXT | medium / high / critical |
| `account_id` | TEXT | FK → accounts.id |
| `txn_id` | TEXT | FK → transactions.id (nullable) |
| `title` | TEXT | Short alert headline |
| `description` | TEXT | Detailed description |
| `ai_explanation` | TEXT | Gemini-generated or template explanation |
| `status` | TEXT | open / acknowledged / resolved |
| `created_at` | TEXT | Alert creation time |

#### Table: `suspect_registry`
Blacklist entries from I4C / NCRP / 1930 helpline.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `identifier_type` | TEXT | phone / upi / account / device |
| `identifier_value` | TEXT | The actual identifier (e.g. +91987…) |
| `source` | TEXT | I4C / NCRP / 1930_helpline / RBI_DPIP |
| `complaint_ref` | TEXT | Reference number (e.g. NCRP/2026/100001) |
| `reason` | TEXT | Why flagged (investment fraud, phishing, etc.) |
| `reported_at` | TEXT | Date of report |
| `status` | TEXT | active / resolved |

#### Table: `risk_scores`
Audit trail of every ML scoring event.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key |
| `account_id` | TEXT | FK → accounts.id |
| `txn_id` | TEXT | FK → transactions.id |
| `composite_score` | REAL | Final composite score (0–100) |
| `velocity_score` | REAL | Velocity sub-score |
| `behavioral_score` | REAL | Behavioral sub-score |
| `graph_score` | REAL | Graph/network sub-score |
| `regulatory_score` | REAL | Regulatory sub-score |
| `anomaly_score` | REAL | Isolation Forest anomaly boost |
| `model_type` | TEXT | xgboost+isolation_forest / rule_based |
| `features_json` | TEXT | All 19 feature values at scoring time |
| `scored_at` | TEXT | Timestamp |

#### Table: `account_connections`
Pre-aggregated graph edges (for graph analysis and D3 visualization).

| Column | Type | Description |
|--------|------|-------------|
| `source_account_id` | TEXT | Sender account |
| `dest_account_id` | TEXT | Receiver account |
| `txn_count` | INTEGER | Number of transactions between them |
| `total_amount` | REAL | Total ₹ transferred |
| `first_txn_at` | TEXT | First transaction datetime |
| `last_txn_at` | TEXT | Most recent transaction datetime |

### Seeding the Database

The seed script creates initial data for demo purposes.

```bash
npm run seed
```

**What it creates:**
- **50 accounts**: 45 normal accounts (established, KYC verified) + 5 mule accounts (new, suspicious patterns)
- **200 transactions**: 150 normal (grocery, bills, salary) + 50 suspicious (round amounts, mule patterns)
- **11 suspect registry entries**: 3 mule phones/UPIs + 5 random external suspects (investment fraud, phishing, etc.)
- **3 initial alerts**: Pre-seeded alerts on the 3 mule accounts

**To reset/re-seed (clears all data first):**
```bash
npm run seed   # Always clears + re-seeds fresh
```

**Seeding logic for mule accounts:**
```javascript
// Mule accounts have these properties:
{
  kyc_status: Math.random() < 0.3 ? 'pending' : 'verified',  // 30% pending KYC
  opened_date: randomDate(60),  // Only 0-60 days old
  risk_score: 30 + Math.random() * 30,  // Starting risk already elevated
  is_mule: 1  // Ground truth (hidden from UI)
}
```

---

## 6. Mock Data Generators

### Transaction Generator (`server/generators/transaction-generator.js`)

Runs continuously on a configurable interval (default: 2s). Generates realistic Indian banking transactions with two modes:

**Normal transaction pattern:**
- Small UPI payments (₹100–₹5,000) — grocery, bills, peer
- Moderate NEFT transfers (₹5,000–₹50,000) — salary, EMI
- Random sender/receiver from the normal account pool
- Timestamp in normal business hours

**Fraud patterns injected (every ~10 transactions):**

| Pattern | Description | Features triggered |
|---------|-------------|-------------------|
| Fan-in burst | 4–7 different accounts all send to the same mule in rapid succession | `unique_senders_24h` ↑, `txn_count_1h` ↑ |
| Immediate pass-through | Mule receives ₹X, then immediately sends ~₹X within 3 minutes | `immediate_passthrough = 1` |
| Structuring | Round amounts just below ₹50,000 (e.g. ₹49,000, ₹48,500) | `is_near_threshold = 1` |
| Off-hours activity | Transactions at 1AM–4AM | `is_off_hours = 1` |
| Cross-channel mixing | Receive via UPI, send via NEFT | `cross_channel_mixing = 1` |

**Starting the generator:**
```javascript
// Called automatically in server/index.js
startTransactionGenerator(processTransaction, SIMULATION_INTERVAL);
```

### I4C Feed Generator (`server/generators/i4c-feed-generator.js`)

Simulates regulatory blacklist updates on a random interval averaging 45 seconds.

**What it generates:**
- New suspect registry entries (phone, UPI, account numbers)
- Sources: I4C, NCRP, 1930 helpline, RBI DPIP
- Categories: Investment fraud, job scam, loan app fraud, SIM swap, lottery scam

**When a match is found:**
The feature extractor checks every incoming transaction's sender/receiver phone, UPI, and account number against the suspect registry. A match sets `suspect_registry_match = 1`, which contributes 60 points to the regulatory sub-score (highest single-feature weight in the system).

---

## 7. ML Pipeline: Features

The feature extractor (`server/ml/feature-extractor.js`) computes **19 behavioral features** for each transaction, organized into 5 categories. These features are used both for ONNX inference and for the rule-based fallback.

### Category 1: Velocity Features (5 features)

These measure how fast transactions are flowing through an account.

| # | Feature | Description | Mule Signal |
|---|---------|-------------|------------|
| 1 | `txn_count_1h` | Number of transactions in last 1 hour | >8 = highly suspicious |
| 2 | `txn_count_24h` | Transactions in last 24 hours | >30 = suspicious |
| 3 | `amount_received_1h` | Total ₹ received in last 60 minutes | >₹2L = suspicious |
| 4 | `amount_sent_1h` | Total ₹ sent in last 60 minutes | High + near received = pass-through |
| 5 | `avg_time_between_txns` | Average gap between transactions (seconds) | <300s = rapid fire |

### Category 2: Behavioral Features (5 features)

Pattern-based binary indicators.

| # | Feature | Description | Mule Signal |
|---|---------|-------------|------------|
| 6 | `is_off_hours` | Is transaction between 12AM–5AM? | 1 = suspicious |
| 7 | `is_round_amount` | Is amount a round number (₹10K, ₹50K)? | 1 = slightly suspicious |
| 8 | `is_near_threshold` | Is amount just below ₹50K reporting limit? | 1 = structuring attempt |
| 9 | `immediate_passthrough` | Money received and sent within 5 minutes? | 1 = strong mule signal |
| 10 | `cross_channel_mixing` | Receive on UPI, send on NEFT (or vice versa)? | 1 = layering behavior |

### Category 3: Account Features (4 features)

Account-level characteristics.

| # | Feature | Description | Mule Signal |
|---|---------|-------------|------------|
| 11 | `account_age_days` | How many days since account was opened | <30 days = new account risk |
| 12 | `is_new_account` | Opened in last 30 days? | 1 = higher risk |
| 13 | `no_prior_history` | Is this the account's first transaction ever? | 1 = suspicious with high volume |
| 14 | `previously_flagged` | Has this account been flagged before? | 1 = recidivist risk |

### Category 4: Graph/Network Features (3 features)

Transaction network topology signals.

| # | Feature | Description | Mule Signal |
|---|---------|-------------|------------|
| 15 | `unique_senders_24h` | How many unique accounts sent money to this account in 24h | >10 = fan-in mule pattern |
| 16 | `unique_receivers_24h` | How many unique accounts received money from this account | >5 = fan-out layering |
| 17 | `passthrough_ratio` | (Amount sent) / (Amount received) — close to 1.0 means almost everything received was forwarded | >0.85 = strong mule signal |

### Category 5: Regulatory Features (2 features)

Cross-reference with external blacklists.

| # | Feature | Description | Mule Signal |
|---|---------|-------------|------------|
| 18 | `suspect_registry_match` | Is the account's phone, UPI, or account number in the I4C/NCRP suspect registry? | 1 = confirmed suspect (60 pts regulatory) |
| 19 | `linked_to_flagged` | Is any directly connected account (sender/receiver in last 24h) already flagged? | 1 = guilt by association |

---

## 8. ML Pipeline: Training the Models

### Why XGBoost + Isolation Forest?

**XGBoost** is a supervised gradient boosting classifier — the industry standard for tabular fraud detection. It learns from labeled training data (fraud vs normal) and produces a probability.

**Isolation Forest** is an unsupervised anomaly detector — it doesn't need labels. It finds transactions that are "isolated" quickly from the majority, catching new fraud patterns that XGBoost hasn't seen in training.

Using both together gives:
- XGBoost: High precision on known fraud patterns
- Isolation Forest: Catch novel/emerging mule behaviors

### Step 1: Install Python Dependencies

```bash
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common
```

| Package | Purpose |
|---------|---------|
| `xgboost` | Train the XGBoost fraud classifier |
| `scikit-learn` | Train the Isolation Forest + utilities |
| `numpy` / `pandas` | Data generation and manipulation |
| `onnx` | ONNX model format support |
| `skl2onnx` | Convert scikit-learn models → ONNX |
| `onnxmltools` | Convert XGBoost → ONNX |
| `onnxconverter-common` | Shared ONNX conversion utilities |

### Step 2: Run the Training Script

```bash
python server/ml/train_model.py
```

**What the script does (4 steps):**

#### Step 1: Generate Synthetic Training Data

```python
generate_training_data(n_samples=20000, fraud_ratio=0.08)
```

Generates 20,000 samples: 18,400 normal + 1,600 fraud. Each row has all 19 features. Normal accounts have realistic banking distributions; mule accounts have artificially high velocity, passthrough ratios, off-hours activity, etc.

#### Step 2: Train XGBoost Classifier

```python
XGBClassifier(
    n_estimators=200,         # 200 decision trees
    max_depth=6,              # Each tree up to 6 levels deep
    learning_rate=0.1,        # Gradient descent step size
    scale_pos_weight=11.5,    # Compensate for class imbalance (92% normal, 8% fraud)
    eval_metric='auc',        # Optimize for ROC-AUC
    subsample=0.8,            # Use 80% of data per tree (prevents overfitting)
    colsample_bytree=0.8,     # Use 80% of features per tree
)
```

Expected output:
```
[EVAL] XGBoost Classification Report:
              precision    recall  f1-score
      Normal       1.00      1.00      1.00
       Fraud       1.00      1.00      1.00
[EVAL] ROC AUC Score: 1.0000
```
> Note: 1.0 AUC is expected on synthetic data since the patterns are clearly defined. Real-world data would yield ~0.92–0.96 AUC.

#### Step 3: Train Isolation Forest

```python
IsolationForest(
    n_estimators=150,        # 150 isolation trees
    contamination=0.08,      # Expected 8% anomaly rate
    random_state=42,
    n_jobs=-1,               # Use all CPU cores
)
```

Expected output:
```
[EVAL] Isolation Forest detected 1280 anomalies in training data
[EVAL] Score range: [-0.1724, 0.2486]
```

#### Step 4: Export to ONNX

Models are converted to ONNX format so they can be run in Node.js without Python at runtime.

**Output files created:**
```
server/ml/models/
├── xgboost_fraud.onnx       ← XGBoost classifier (fraud probability 0.0–1.0)
├── isolation_forest.onnx    ← Anomaly detector (label: 1=normal, -1=anomaly)
└── feature_config.json      ← Feature names, importance scores, thresholds
```

---

## 9. ML Pipeline: ONNX Conversion

ONNX (Open Neural Network Exchange) is a universal model format that lets Python-trained models run in any language.

### Why ONNX?

```
Python Training → ONNX File → Node.js Runtime
     (once)         (static)    (every request)
```

No Python needed at inference time. The Node.js server loads the `.onnx` files once at startup and runs inference via `onnxruntime-node`.

### XGBoost → ONNX Conversion

```python
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType

initial_type = [('float_input', OnnxFloatTensorType([None, 19]))]
onnx_xgb = convert_xgboost(
    xgb_model,
    initial_types=initial_type,
    target_opset=12
)
```

> ⚠️ **Important**: Must use `onnxmltools.convert.common.data_types.FloatTensorType`, NOT `onnxconverter_common.FloatTensorType`. They are different classes and onnxmltools will reject the wrong one.

### Isolation Forest → ONNX Conversion

```python
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

initial_type = [('float_input', FloatTensorType([None, 19]))]
onnx_iso = convert_sklearn(
    iso_model,
    initial_types=initial_type,
    target_opset={'': 12, 'ai.onnx.ml': 3}   # ← Critical: must specify ai.onnx.ml: 3
)
```

> ⚠️ **Important**: `target_opset` must be a **dict** specifying `'ai.onnx.ml': 3`. Passing `target_opset=12` (integer) causes `RuntimeError: The model is using version 4 of domain 'ai.onnx.ml' not supported`.

### ONNX Input/Output Format

**XGBoost ONNX:**
- Input: `float_input` — shape `[1, 19]` (1 sample × 19 features)
- Output 1: `label` — predicted class (0=normal, 1=fraud)
- Output 2: `probabilities` — class probabilities (we use index [1] = fraud probability)

**Isolation Forest ONNX:**
- Input: `float_input` — shape `[1, 19]`
- Output: `label` — 1=normal, -1=anomaly
- (Optional) `scores` — decision function value (more negative = more anomalous)

---

## 10. ML Pipeline: Node.js Inference

### Initialization (`server/ml/scoring-engine.js`)

```javascript
// Called once at server startup
await initScoringEngine();
```

The engine:
1. Checks if `server/ml/models/xgboost_fraud.onnx` and `isolation_forest.onnx` exist
2. If yes → loads both via `onnxruntime-node`, sets `useONNX = true`
3. If no → logs warning, sets `useONNX = false` (rule-based fallback active)
4. Logs what mode it's in:
   ```
   [ML] ✅ XGBoost ONNX model loaded
   [ML] ✅ Isolation Forest ONNX model loaded
   [ML] 🚀 ONNX inference engine ready (real ML models)
   ```

### Scoring a Transaction

```javascript
const scoring = await scoreTransaction(transaction, accountId);
// Returns:
{
  compositeScore: 87.3,          // Final score 0-100
  velocityScore: 95,             // Velocity sub-score
  behavioralScore: 80,           // Behavioral sub-score
  graphScore: 90,                // Graph sub-score
  regulatoryScore: 60,           // Regulatory sub-score
  anomalyScore: 15,              // Isolation Forest boost
  modelType: 'xgboost+isolation_forest',
  riskLevel: 'critical',         // low / medium / high / critical
  action: 'freeze_and_alert',    // log / monitor / review_queue / freeze_and_alert
  featureMap: { txn_count_1h: 12, ... },  // All 19 features
  features: [12, 35, 280000, ...],         // Float array for ONNX
}
```

### Composite Score Formula

**When using ONNX:**
```
compositeScore = min(100, XGBoost_probability × 100 + IsolationForest_boost)
```
Where `IsolationForest_boost = min(20, |anomaly_score| × 30)` if the sample is flagged as anomaly (-1).

**When using rule-based fallback:**
```
compositeScore = 0.25 × velocityScore
              + 0.20 × behavioralScore
              + 0.25 × graphScore
              + 0.30 × regulatoryScore
```

### Risk Thresholds and Actions

| Score Range | Risk Level | Action |
|-------------|-----------|--------|
| 0–20 | Low | Log only, no alert |
| 21–40 | Medium | Monitor |
| 41–70 | High | Add to analyst review queue, generate alert |
| 71–100 | Critical | Auto-freeze consideration, alert, Gemini explanation |

### Account Risk Update (EMA)

Account risk scores are updated using an **Exponential Moving Average** to smooth out noise:

```javascript
const newScore = 0.3 × currentTransactionScore + 0.7 × previousAccountScore;
```

This means a single high-risk transaction raises the account score but doesn't immediately max it out. Sustained high-risk transactions will progressively push the account score up.

**Status transitions:**
- `newScore >= 71` → status = `flagged`
- `newScore >= 41` (if was `active`) → status = `under_review`
- Manual analyst action → `frozen`

---

## 11. Graph Analysis Engine

`server/ml/graph-analyzer.js` maintains an **in-memory directed graph** where:
- **Nodes** = accounts
- **Edges** = transaction relationships (with count and amount)

### Initialization

On server startup, the graph is loaded from the `account_connections` table:

```javascript
initGraph();
// Logs: [GRAPH] Initialized with 50 nodes and 192 edges
```

### Updates

Every new transaction updates the graph:

```javascript
updateGraph(transaction);
// Updates:
// - adjacency list (neighbor nodes)
// - edge weights (txn count + total amount)
// - per-account stats (unique senders, receivers, passthrough ratio)
```

### Key Computed Metrics

| Metric | Formula | Mule Indicator |
|--------|---------|----------------|
| `inDegree` | Count of unique senders in 24h | >10 = fan-in pattern |
| `outDegree` | Count of unique receivers in 24h | >5 = fan-out pattern |
| `passthrough_ratio` | totalSent / totalReceived | >0.85 = pass-through mule |
| `clustering_coefficient` | How tightly connected neighbors are | Low = isolated hub (mule) |

### Layering Chain Detection

The engine also detects **layering chains**: A → B → C → D within a short time window (indicative of money moving through multiple mule accounts quickly).

---

## 12. GenAI Explanation Layer

`server/ml/explainer.js` generates natural-language case summaries for high-risk accounts.

### When is it called?

Only for transactions with `compositeScore >= 65` to avoid excessive API calls.

### With Gemini API (GEMINI_API_KEY set)

```javascript
const prompt = `
You are a financial fraud analyst at Bank of India.

FLAGGED ACCOUNT: ${account.account_holder} (${account.account_number})
TRANSACTION: ₹${amount} via ${type} 
RISK SCORE: ${compositeScore}/100
MODEL: ${modelType}

KEY BEHAVIORAL SIGNALS:
- Transactions in last hour: ${features.txn_count_1h}
- Unique senders in 24h (fan-in): ${features.unique_senders_24h}
- Immediate pass-through detected: ${features.immediate_passthrough ? 'YES' : 'NO'}
- Suspect registry match: ${features.suspect_registry_match ? 'YES' : 'NO'}
...

Write a 3-4 sentence case summary explaining why this account is flagged.
End with: "Recommended Action: [FREEZE / REVIEW / MONITOR]"
`;
```

**Example output:**
> "Account ACC-4821 (Ravi Dubey) received ₹3.2L from 14 different accounts in 47 minutes, immediately forwarding to 3 new accounts in a clear fan-in/fan-out pattern. The account was opened only 23 days ago and the associated phone number matches Suspect Registry entry NCRP/2026/100001 filed for UPI phishing. Transaction activity peaks between 2AM–4AM with 65% round amounts. Risk Score: 94/100. Recommended Action: FREEZE"

### Without Gemini API (fallback)

A deterministic template engine generates explanation text based on which features are elevated:

```
Rule: if suspect_registry_match → "Account identifier matches I4C Suspect Registry..."
Rule: if passthrough_ratio > 0.8 → "Immediate pass-through pattern detected..."
Rule: if unique_senders_24h > 10 → "Fan-in pattern: N unique senders in 24 hours..."
...
```

---

## 13. API Routes Reference

Base URL: `http://localhost:3001`

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/transactions` | Ingest a new transaction (runs full ML pipeline) |
| `GET` | `/api/transactions` | List transactions (query: `?flagged=true&account_id=...&limit=50`) |
| `GET` | `/api/transactions/:id` | Single transaction with full feature breakdown |

**POST /api/transactions body:**
```json
{
  "type": "UPI",
  "amount": 45000,
  "sender_account_id": "uuid-here",
  "receiver_account_id": "uuid-here",
  "channel": "digital",
  "description": "Payment"
}
```

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts` | All accounts (query: `?status=flagged&sort=risk_score`) |
| `GET` | `/api/accounts/:id` | Account profile with history, connections, risk timeline |
| `POST` | `/api/accounts/:id/freeze` | Freeze an account (sets status = frozen) |
| `POST` | `/api/accounts/:id/unfreeze` | Unfreeze an account |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/alerts` | All alerts (query: `?status=open&severity=critical`) |
| `PATCH` | `/api/alerts/:id` | Update alert status (acknowledge/resolve) |
| `GET` | `/api/alerts/stats` | Alert summary counts by severity/status |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard/stats` | Aggregated metrics: total txns, flagged count, volume, risk distribution |
| `GET` | `/api/dashboard/graph` | Network graph data for D3.js (nodes + links) |
| `GET` | `/api/dashboard/timeline` | Risk score timeline for charts |

**GET /api/dashboard/stats response:**
```json
{
  "total_accounts": 50,
  "flagged_accounts": 3,
  "total_transactions": 301,
  "flagged_transactions": 19,
  "total_volume": 8780108,
  "open_alerts": 3,
  "avg_risk_score": 5.58,
  "txnByType": [{"type": "UPI", "count": 151, "volume": 2027783}, ...],
  "riskDistribution": [{"bucket": "0-20", "count": 251}, ...],
  "mlEngine": "XGBoost + Isolation Forest (ONNX)"
}
```

### Regulatory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/regulatory/suspect-registry` | All suspect registry entries |
| `POST` | `/api/regulatory/suspect-registry` | Add new suspect entry (simulates I4C feed) |
| `GET` | `/api/regulatory/feed-status` | Status of all regulatory feeds |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health: status, ML engine, WS clients, timestamp |

---

## 14. WebSocket Events Reference

Connect to `ws://localhost:3001` to receive real-time events.

### Incoming Events (server → client)

#### `init`
Sent immediately on connection with current dashboard stats.
```json
{
  "type": "init",
  "data": { "total_accounts": 50, "open_alerts": 3, ... }
}
```

#### `transaction`
Emitted for every new transaction processed.
```json
{
  "type": "transaction",
  "data": {
    "transaction": {
      "id": "uuid",
      "type": "UPI",
      "amount": 45000,
      "risk_score": 87.3,
      "is_flagged": 1,
      "sender": { "id": "...", "name": "Aarav Sharma", "account_number": "..." },
      "receiver": { "id": "...", "name": "Ravi Dubey", "account_number": "..." }
    },
    "scoring": { "compositeScore": 87.3, "riskLevel": "critical", ... }
  },
  "timestamp": "2026-06-08T05:44:32.571Z"
}
```

#### `alert`
Emitted when a new alert is created (score >= 41).
```json
{
  "type": "alert",
  "data": {
    "alert": { "severity": "critical", "title": "🚨 CRITICAL: Mule account pattern...", ... },
    "account": { "account_holder": "Ravi Dubey", ... },
    "scoring": { "compositeScore": 87.3, ... }
  }
}
```

#### `suspect_registry`
Emitted when a new I4C entry arrives.
```json
{
  "type": "suspect_registry",
  "data": {
    "entry": {
      "identifier_type": "phone",
      "identifier_value": "+919876543210",
      "source": "I4C",
      "reason": "UPI phishing scheme"
    }
  }
}
```

---

## 15. React Dashboard

### Design System

All CSS tokens defined in `client/src/index.css`:

```css
:root {
  --bg-primary: #0a0e27;      /* Deep navy */
  --bg-secondary: #0d1230;    /* Slightly lighter */
  --bg-card: rgba(255,255,255,0.04);  /* Glassmorphism */
  --accent-blue: #00d4ff;     /* Electric blue */
  --accent-red: #ff3366;      /* Danger red */
  --accent-amber: #ffaa00;    /* Warning amber */
  --accent-green: #00ff88;    /* Success green */
  --text-primary: #e8eaf6;
  --font-main: 'Inter', sans-serif;
}
```

### Tab 1: Live Feed (`pages/LiveFeed.jsx`)

- **WebSocket subscriber** — receives `transaction` events in real-time
- **Auto-scroll** — new transactions appear at top with slide-in animation
- **Risk badge** — color-coded pill (green/amber/red) based on score
- **Pulse animation** — high-risk transactions (score >= 71) pulse red
- **Pause on hover** — stops scrolling when user hovers over the feed

### Tab 2: Flagged Accounts (`pages/FlaggedAccounts.jsx`)

- **Sorted table** — accounts ordered by risk score descending
- **Risk bar** — visual bar showing score level
- **Expandable rows** — click to see:
  - Full ML feature breakdown (all 19 features)
  - AI explanation text (from Gemini or template)
  - Recent transaction history
  - Connected accounts
- **Action buttons**: Freeze / Investigate
- **Live updates** — list refreshes as new accounts get flagged

### Tab 3: Network Graph (`pages/NetworkGraph.jsx`)

- **D3.js force-directed graph**
- **Nodes**: Each account is a circle
  - Size = risk score (larger = riskier)
  - Color = status (green=active, amber=under_review, red=flagged/frozen)
- **Edges**: Transaction connections
  - Thickness = transaction volume (thicker = more money)
- **Click a node** → shows account details panel
- **Zoom/pan** supported
- **Highlights mule pattern**: Fan-in nodes have many incoming edges

### Tab 4: Analytics (`pages/Analytics.jsx`)

- **Risk distribution histogram** — bar chart (0–20 / 21–40 / 41–60 / 61–80 / 81–100)
- **Flagged transactions over time** — line chart (last 24 hours)
- **Transaction channel breakdown** — pie chart (UPI / NEFT / IMPS / ATM / RTGS)
- **Top 10 riskiest accounts** — horizontal bar chart leaderboard

### Tab 5: Regulatory Feeds (`pages/RegulatoryFeeds.jsx`)

- **Suspect registry table** — all entries with source, type, complaint ref
- **Feed health status** — pulsing green/red dots for each feed
  - I4C Suspect Registry
  - NCRP Complaint Feed
  - 1930 Helpline
  - RBI DPIP
- **Last update timestamp** for each feed
- **Live updates** via WebSocket `suspect_registry` events

---

## 16. Running the Project

### One-Command Setup (First Time)

```bash
# From the project root
npm run setup
```

This runs: `npm install && cd client && npm install && cd .. && npm run seed`

### Start Development Servers

```bash
npm run dev
```

This starts:
- `[0]` Backend server at `http://localhost:3001` (with `--watch` for auto-reload)
- `[1]` Vite dev server at `http://localhost:5173` (with HMR)

### Individual Start Commands

```bash
npm run dev:server     # Start backend only
npm run dev:client     # Start frontend only
npm run seed           # Re-seed the database (clears existing data)
```

### Training ML Models (Required for real ONNX inference)

```bash
# Step 1: Install Python dependencies (once)
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common

# Step 2: Train and export
python server/ml/train_model.py

# Step 3: Restart server — it will auto-detect the .onnx files
```

After training, you should see on next server startup:
```
[ML] ✅ XGBoost ONNX model loaded
[ML] ✅ Isolation Forest ONNX model loaded
[ML] ✅ Feature config loaded
[ML] 🚀 ONNX inference engine ready (real ML models)
```

---

## 17. Full Startup Sequence (A→Z)

Here is the complete step-by-step sequence from a fresh clone:

```bash
# 1. Navigate to project
cd mule

# 2. Create environment file
copy .env.example .env
# Edit .env and optionally add GEMINI_API_KEY

# 3. Install all dependencies
npm run setup
# (This installs Node deps, React deps, and seeds the DB)

# 4. Install Python dependencies for ML
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common

# 5. Train ML models and export to ONNX
python server/ml/train_model.py
# Takes ~45 seconds. Creates server/ml/models/*.onnx

# 6. Start the full stack
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:5173

# 7. Open the dashboard
# Navigate to http://localhost:5173 in your browser
```

### What happens on `npm run dev`

```
Server startup sequence:
  1. dotenv loads .env
  2. Express app + HTTP server created
  3. WebSocket server attached to same HTTP server
  4. initScoringEngine() → loads ONNX models (or logs fallback warning)
  5. initGraph() → loads account_connections from DB into memory
  6. HTTP server starts listening on port 3001
  7. startTransactionGenerator() → starts emitting transactions every 2s
  8. startI4CFeedGenerator() → starts random regulatory feed updates
  9. Logs: "[SERVER] 🚀 All systems running. Dashboard: http://localhost:5173"

Client startup sequence:
  1. Vite starts dev server on port 5173
  2. React app boots, App.jsx mounts
  3. WebSocket connection established to ws://localhost:3001
  4. Server sends "init" event with current stats
  5. Dashboard populates with seeded data
  6. Real-time transaction events start populating the live feed
```

---

## 18. Demo Script for Judges

**Duration: ~5 minutes**

1. **Open the dashboard** → Show the Live Feed tab with transactions flowing in every 2 seconds. Point out the risk badges — most are green, some amber.

2. **Watch a high-risk transaction appear** → A critical (red) transaction will appear within 20–30 seconds. Show the risk score of 70–95.

3. **Click Flagged Accounts tab** → Show the mule accounts sorted by risk score. Explain the 5 behavioral sub-scores.

4. **Click on a flagged account** → Expand it. Show:
   - The 19 features extracted
   - The AI explanation (Gemini or template)
   - "Fan-in pattern: 12 unique senders in 24 hours"

5. **Click Network Graph tab** → Show the force-directed graph. Point out the red nodes (flagged accounts) with many connections flowing into them — the classic mule fan-in shape.

6. **Click Regulatory Feeds tab** → Show the I4C suspect registry. Explain how a match here instantly raises the regulatory sub-score by 60 points.

7. **Freeze an account** → Go back to Flagged Accounts, click Freeze on the riskiest account. Show the status change propagate in real-time.

8. **Show the ML engine** → Mention "XGBoost + Isolation Forest ONNX" (visible in dashboard header). Explain: XGBoost catches known patterns, Isolation Forest catches novel ones.

---

## 19. Troubleshooting

### `Cannot find package 'dotenv'`
```bash
# dotenv not in root dependencies
npm install dotenv
```

### `ONNX models not found` (server falls back to rule-based)
```bash
# Run the Python training script first
python server/ml/train_model.py
```

### `RuntimeError: Operator XGBClassifier got an input with wrong type`
```python
# In train_model.py, ensure OnnxFloatTensorType is imported from onnxmltools:
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType
# NOT from onnxconverter_common
```

### `RuntimeError: model using version 4 of domain 'ai.onnx.ml' not supported`
```python
# In train_model.py, use dict opset for Isolation Forest:
target_opset={'': 12, 'ai.onnx.ml': 3}
# NOT: target_opset=12
```

### `ERR_MODULE_NOT_FOUND` for any server import
```bash
# Make sure you ran npm install in the ROOT directory (not just client/)
npm install
```

### Port 3001 already in use
```bash
# Windows: kill the process using port 3001
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

### WebSocket not connecting
- Ensure the backend is running on port 3001 before opening the frontend
- Check the browser console for WebSocket errors
- The frontend reconnects automatically after 3 seconds if connection drops

### SQLite DB corruption
```bash
# Delete the DB and re-seed
del data\anviksha.db
npm run seed
```
