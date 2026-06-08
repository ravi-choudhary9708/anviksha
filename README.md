<div align="center">

![Anviksha Banner](docs/images/banner.png)

# Anviksha — AI-Powered Mule Account Detection

**Real-time fraud detection system for the Bank of India Hackathon 2026**

[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![XGBoost](https://img.shields.io/badge/ML-XGBoost+IsolationForest-FF6600)](https://xgboost.readthedocs.io/)
[![ONNX](https://img.shields.io/badge/Runtime-ONNX-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Gemini](https://img.shields.io/badge/GenAI-Gemini_API-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

</div>

---

## 🎯 What is Anviksha?

**Anviksha** (Sanskrit: "analytical investigation") detects **mule accounts** — bank accounts used as financial intermediaries to launder fraud proceeds — in real time.

It ingests a live stream of UPI, NEFT, IMPS, and ATM transactions, extracts **19 behavioral features** from each transaction, runs them through an **XGBoost + Isolation Forest** model exported to ONNX, and uses the **Gemini API** to generate natural-language case summaries for flagged accounts.

> 🏆 Built for the **Bank of India Hackathon 2026** — Problem 2: Mule Account / Fraud Detection

---



---

## 🏗️ System Architecture

![Architecture Diagram](docs/images/architecture.png)

The system is structured as a monorepo:
- **`/server`** — Node.js + Express backend with WebSocket server
- **`/client`** — React + Vite frontend dashboard
- **`/server/ml`** — Python training + Node.js ONNX inference

---

## 🤖 ML Pipeline

![ML Pipeline](docs/images/ml_pipeline.png)

### Model Performance Insights

![XGBoost Model Performance](docs/images/xgboost_model.png)
![Isolation Forest Anomalies](docs/images/isolation_forest.png)

### How it works

Every transaction goes through a 7-step pipeline:

| Step | What Happens |
|------|-------------|
| 1️⃣ | Raw transaction ingested (UPI/NEFT/IMPS/ATM) |
| 2️⃣ | **19 behavioral features** extracted (velocity, behavioral, graph, regulatory) |
| 3️⃣ | **XGBoost ONNX** → fraud probability 0.0–1.0 |
| 4️⃣ | **Isolation Forest ONNX** → anomaly score (catches novel patterns) |
| 5️⃣ | **Composite score** computed (0–100) |
| 6️⃣ | **Risk decision**: FREEZE 🚨 (71–100) / REVIEW ⚠️ (41–70) / MONITOR ✅ (0–40) |
| 7️⃣ | **Gemini AI** generates natural-language case explanation |

### 19 Behavioral Features

```
Velocity (5):      txn_count_1h, txn_count_24h, amount_received_1h,
                   amount_sent_1h, avg_time_between_txns
Behavioral (5):    is_off_hours, is_round_amount, is_near_threshold,
                   immediate_passthrough, cross_channel_mixing
Account (4):       account_age_days, is_new_account, no_prior_history,
                   previously_flagged
Graph (3):         unique_senders_24h, unique_receivers_24h, passthrough_ratio
Regulatory (2):    suspect_registry_match, linked_to_flagged
```

---

## 🗄️ Database Schema

![Database Schema](docs/images/database_schema.png)

SQLite database with 6 tables — zero install required.

---

## ⚡ Quick Start

### Prerequisites
- Node.js v20+
- Python 3.9+
- npm v10+

### 1. Clone & Install

```bash
git clone <repo-url>
cd mule

# Install all dependencies + seed the database
npm run setup
```

### 2. Environment Setup

```bash
copy .env.example .env
```

Edit `.env`:
```env
PORT=3001
DB_PATH=./data/anviksha.db
SIMULATION_INTERVAL=2000
GEMINI_API_KEY=your_key_here   # Optional — has rule-based fallback
```

### 3. Train ML Models

```bash
# Install Python dependencies
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common

# Train XGBoost + Isolation Forest and export to ONNX
python server/ml/train_model.py
```

Expected output:
```
[STEP 2] Training XGBoost classifier...
[EVAL] ROC AUC Score: 1.0000

[STEP 3] Training Isolation Forest...
[EVAL] Isolation Forest detected 1280 anomalies in training data

[STEP 4] Exporting models to ONNX...
[EXPORT] XGBoost saved to server/ml/models/xgboost_fraud.onnx
[EXPORT] Isolation Forest saved to server/ml/models/isolation_forest.onnx
[EXPORT] Feature config saved to server/ml/models/feature_config.json

============================================================
  Training complete! Models saved to server/ml/models/
  You can now run: npm run dev
============================================================
```

### 4. Start the Application

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| 🖥️ Dashboard | http://localhost:5173 |
| 🔌 API | http://localhost:3001 |
| 🏥 Health | http://localhost:3001/api/health |
| 📡 WebSocket | ws://localhost:3001 |

On startup you should see:
```
[ML] ✅ XGBoost ONNX model loaded
[ML] ✅ Isolation Forest ONNX model loaded
[ML] 🚀 ONNX inference engine ready (real ML models)
[GRAPH] Initialized with 50 nodes and 192 edges
[SERVER] ✅ API running at http://localhost:3001
[SERVER] ✅ WebSocket running at ws://localhost:3001
```

---

## 📁 Project Structure

```
mule/
├── package.json              ← Root scripts + server dependencies
├── .env                      ← Environment variables
├── .env.example              ← Template
│
├── server/
│   ├── index.js              ← Express + WebSocket entry point
│   ├── db/
│   │   ├── index.js          ← SQLite initialization
│   │   └── schema.sql        ← Table definitions
│   ├── generators/
│   │   ├── transaction-generator.js   ← Live UPI/NEFT/IMPS stream
│   │   ├── i4c-feed-generator.js      ← Regulatory feed simulation
│   │   └── seed-data.js               ← Initial data population
│   ├── ml/
│   │   ├── feature-extractor.js      ← 19 behavioral features
│   │   ├── scoring-engine.js         ← XGBoost + IsolationForest ONNX
│   │   ├── graph-analyzer.js         ← Fan-in/fan-out detection
│   │   ├── explainer.js              ← Gemini AI + template fallback
│   │   ├── train_model.py            ← Python training script
│   │   └── models/                   ← ONNX files (after training)
│   └── routes/
│       ├── transactions.js
│       ├── accounts.js
│       ├── alerts.js
│       ├── dashboard.js
│       └── regulatory.js
│
├── client/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                  ← WebSocket + navigation
│       ├── index.css                ← Design system tokens
│       ├── components/
│       │   ├── Header.jsx
│       │   └── ui.jsx               ← RiskBadge, StatCard, TransactionRow
│       └── pages/
│           ├── LiveFeed.jsx         ← Real-time transaction stream
│           ├── FlaggedAccounts.jsx  ← Risk-sorted account table
│           ├── NetworkGraph.jsx     ← D3.js force graph
│           ├── Analytics.jsx        ← Recharts dashboards
│           └── RegulatoryFeeds.jsx  ← I4C/NCRP status
│
├── docs/
│   ├── COMPREHENSIVE_GUIDE.md       ← Full A-to-Z documentation
│   └── images/                      ← Diagrams used in this README
│
└── AI_HANDOVER.md                   ← Guide for AI agents to continue
```

---

## 🔌 API Reference

### Core Endpoints

```http
GET  /api/health                         # Server + ML engine status
GET  /api/dashboard/stats                # Aggregated metrics
GET  /api/dashboard/graph                # Network graph data (D3.js)

GET  /api/transactions?flagged=true      # Flagged transactions
POST /api/transactions                   # Ingest new transaction

GET  /api/accounts?sort=risk_score       # Accounts by risk
POST /api/accounts/:id/freeze            # Freeze an account

GET  /api/alerts?severity=critical       # Critical alerts
PATCH /api/alerts/:id                    # Acknowledge/resolve alert

GET  /api/regulatory/suspect-registry    # I4C blacklist
POST /api/regulatory/suspect-registry    # Add suspect entry
```

### WebSocket Events

Connect to `ws://localhost:3001` to receive:

| Event | When |
|-------|------|
| `init` | On connection — sends current stats |
| `transaction` | Every 2 seconds — new transaction with risk score |
| `alert` | When score ≥ 41 — new fraud alert |
| `suspect_registry` | Every ~45s — I4C regulatory update |

---

## 📊 Risk Scoring

### Composite Score Formula

**With ONNX models (real ML):**
```
Score = XGBoost_probability × 100 + IsolationForest_anomaly_boost
```

**Fallback (rule-based):**
```
Score = 0.25 × VelocityScore
      + 0.20 × BehavioralScore  
      + 0.25 × GraphScore
      + 0.30 × RegulatoryScore
```

### Risk Thresholds

| Score | Level | Action |
|-------|-------|--------|
| 0–40 | ✅ Low | Log and continue |
| 41–70 | ⚠️ High | Add to analyst review queue |
| 71–100 | 🚨 Critical | Auto-flag + Gemini explanation |

---

## 🧪 Available Scripts

```bash
npm run dev          # Start server + client concurrently
npm run dev:server   # Start backend only (port 3001)
npm run dev:client   # Start frontend only (port 5173)
npm run seed         # Re-seed database (clears + repopulates)
npm run setup        # Install all deps + seed (first-time setup)

python server/ml/train_model.py  # Train + export ONNX models
```

---

## 🔧 Troubleshooting

| Error | Fix |
|-------|-----|
| `Cannot find package 'dotenv'` | `npm install dotenv` |
| `ONNX models not found` | Run `python server/ml/train_model.py` |
| `Wrong type OnnxFloatTensorType` | Ensure import is from `onnxmltools.convert.common.data_types` |
| `ai.onnx.ml version 4 not supported` | Use `target_opset={'': 12, 'ai.onnx.ml': 3}` for Isolation Forest |
| Port 3001 in use | `netstat -ano \| findstr :3001` then `taskkill /PID <pid> /F` |
| SQLite corruption | `del data\anviksha.db && npm run seed` |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [COMPREHENSIVE_GUIDE.md](docs/COMPREHENSIVE_GUIDE.md) | Full A-to-Z technical guide: architecture, schema, ML training, ONNX, API, WebSocket, troubleshooting |
| [AI_HANDOVER.md](AI_HANDOVER.md) | Guide for AI agents / developers to continue the project |
| [.env.example](.env.example) | Environment variable template |

---

## 🏦 Fraud Patterns Detected

| Pattern | Detection Method |
|---------|-----------------|
| **Fan-in mule** | 10+ unique senders in 24h (`unique_senders_24h`) |
| **Immediate pass-through** | Receive + send within 5 minutes (`immediate_passthrough`) |
| **Structuring** | Amounts just below ₹50K reporting limit (`is_near_threshold`) |
| **Off-hours activity** | Transactions 12AM–5AM (`is_off_hours`) |
| **Cross-channel layering** | Receive UPI → send NEFT (`cross_channel_mixing`) |
| **Registry match** | Phone/UPI in I4C/NCRP blacklist (`suspect_registry_match`) |
| **New account abuse** | Account < 30 days old with high volume (`is_new_account`) |
| **Guilt by association** | Connected account already flagged (`linked_to_flagged`) |

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js 20 + Express.js 4 |
| Real-time | WebSockets (`ws`) |
| Database | SQLite (`better-sqlite3`) |
| ML Inference | `onnxruntime-node` |
| ML Training | XGBoost + scikit-learn (Python) |
| ONNX Conversion | `onnxmltools` + `skl2onnx` |
| GenAI | Google Gemini API |
| Frontend | React 18 + Vite 6 |
| Charts | Recharts |
| Network Graph | D3.js v7 |
| Icons | Lucide React |
| Styling | Vanilla CSS (glassmorphism) |

---

<div align="center">

**Built with ❤️ by Anviksha Team for BOI Hackathon 2026**

*Real-time fraud detection • XGBoost + Isolation Forest • Gemini AI*

</div>
