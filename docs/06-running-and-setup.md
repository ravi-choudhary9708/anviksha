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
