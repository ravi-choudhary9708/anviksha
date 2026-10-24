# Anviksha — AI-Powered Mule Account & Fraud Detection System
## Handover & Continuation Guide for AI Models

Welcome! This document provides all the context, architecture, status, and instructions needed for another AI agent or developer to take over, run, verify, and extend **Anviksha** (an AI-powered mule account and real-time fraud detection system built for the Bank of India Hackathon 2026).

---

## 1. Project Overview & Name

*   **Project Name:** `Anviksha` (meaning "investigation", "inquiry", or "analytical study" in Sanskrit).
*   **Target Problem:** Real-time ingestion of transaction feeds, cross-referencing with regulatory blacklists (like I4C/NCRP/1930 feeds), extracting behavioral features, scoring risk using ML models, and generating AI-based explanations for flagged accounts.
*   **Key Design Constraint:** Low friction, high reliability, runs locally without massive external dependencies like PostgreSQL or Redis for hackathon simplicity (uses SQLite via `better-sqlite3` and event-driven in-memory processing).

---

## 2. Architecture & Tech Stack

The system has evolved into an event-driven microservices architecture:

### Event Broker & Orchestration
*   **Message Broker:** Redpanda (Kafka API compatible) for high-throughput transaction streaming.
*   **Caching/State:** Redis (currently provisioned via Docker for future scaling).
*   **Orchestration:** Docker Compose binds the microservices together.

### Ingestion Service (`/ingestion-service`)
*   **Language:** Go (Golang)
*   **Role:** Acts as a "Layer 1 Shield". It receives raw transactions, checks for malicious JA3 TLS fingerprints, instantly drops automated botnet traffic (returning HTTP 403), and pushes valid transactions to the `raw_transactions` Kafka topic.

### Backend (`/server`)
*   **Framework:** Node.js + Express.js + WebSockets (`ws`) for real-time dashboard updates.
*   **Kafka Consumer:** Listens to the Redpanda `raw_transactions` topic and pipes messages into the ML scoring engine.
*   **Database:** SQLite (`better-sqlite3` for zero-configuration, synchronous, high-performance database access).
*   **ML Engine (`/server/ml`):**
    *   **Feature Extractor:** Extracts **18 abstract golden features** directly mapped from the BOI `DataSet.csv`.
    *   **Scoring Engine:** Runs ONNX inference using `onnxruntime-node` for two models:
        1.  **XGBoost Classifier:** Fraud/mule probability classifier.
        2.  **Isolation Forest:** Unsupervised anomaly detector (provides risk boosts for unexpected patterns).
        *   *Fallback:* Automatically falls back to dataset simulation if ONNX models are not compiled or available.
    *   **Graph Analyzer:** Builds an in-memory transactional connection graph (detecting fan-in, fan-out, clustering coefficients, and pass-through ratios) to identify mule networks.
    *   **GenAI Explainer:** Integrates with the Gemini API to write natural-language threat explanations. If `GEMINI_API_KEY` is not present, it falls back to a rule-based template engine.
*   **Generators (`/server/generators`):**
    *   `transaction-generator.js`: Simulates active transactions by drawing real rows from `DataSet.csv` ensuring valid ML scoring, wrapped in UI metadata.
    *   `i4c-feed-generator.js`: Simulates periodic government regulatory blacklist updates.
    *   `seed-data.js`: Populates the database with default accounts, history, and connections.

### Frontend (`/client`)
*   **Framework:** React + Vite, styled using Vanilla CSS.
*   **Design System:** Glassmorphism dark-mode fintech aesthetic.
*   **Key Views:**
    1.  **Live Feed:** Real-time transaction list streaming via WebSockets with pulse animations on high-risk flags.
    2.  **Flagged Accounts:** List of accounts sorted by risk score. Expandable rows show details, a **Threat Escalation Curve** (Recharts) proving Pre-Crime detection, and an **Auto-STR Generation** button for FIU compliance, along with network connections and AI explanations.
    3.  **Network Graph:** Interactive force-directed 2D/3D graph visualizing account transaction connections using `react-force-graph`. Mastermind mule accounts (`fanIn >= 8` & `riskScore >= 50`) can be visualized and tagged as orchestrators.
    4.  **Analytics:** Recharts diagrams of risk distributions, channels, and flagged metrics.
    5.  **Regulatory Feeds:** View of I4C/NCRP suspect registry and connection status.

---

## 3. Database Schema

All database transactions are logged in SQLite (`data/anviksha.db`). The tables (defined in `server/db/schema.sql`) are:
1.  `accounts`: Customer details, status (`active`, `under_review`, `flagged`, `frozen`), KYC status, and composite risk score.
2.  `transactions`: Financial transfers with risk flags, amount, channel, and features JSON.
3.  `alerts`: Escalated incidents (severity: `medium`, `high`, `critical`) with Gemini or template-based descriptions.
4.  `suspect_registry`: Scraped/fed blacklist indicators (phone, UPI, account, device) from NCRP/I4C.
5.  `risk_scores`: History of risk score evaluations for auditing and line charts.
6.  `account_connections`: Pre-aggregated graph edges tracking sender-receiver relationships.

---

## 4. How to Set Up & Run the Project

The system is now designed to run via Docker Compose, which spins up Go, Redpanda, Redis, Node, and React simultaneously.

### Step A: Clone & Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
DB_PATH=./data/anviksha.db
SIMULATION_INTERVAL=2000
```

### Step B: Start via Docker (Recommended)
Run from the root directory:
```bash
docker-compose up --build
```
*   Go Ingestion Service runs at: `http://localhost:8080`
*   Node Backend runs at: `http://localhost:3001`
*   React Frontend runs at: `http://localhost:5173`

*(Note: The Node.js container automatically seeds the SQLite database on startup).*

### Alternative: Standalone Node Mode
If Docker is unavailable, the Node server gracefully falls back to standalone mode (bypassing Go/Kafka).
```bash
npm run setup
npm run dev
```

---

## 5. Machine Learning Model Training (ONNX)

To activate the real ML models (XGBoost + Isolation Forest) instead of the rule-based fallback, the models must be trained and exported to ONNX:

1.  **Install Python requirements:**
    ```bash
    pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common
    ```
2.  **Run the training script:**
    ```bash
    python server/ml/train_model.py
    ```
    *This script loads `DataSet.csv` (or `dataset_features.json`), applies Method 3 feature engineering, trains a Method 1 Two-Stage Cascade (XGBoost + Isolation Forest), performs leakage-free 5-fold cross-validation, and writes the following files:*
    *   `server/ml/models/xgboost_fraud.onnx`
    *   `server/ml/models/isolation_forest.onnx`
    *   `server/ml/models/feature_config.json`
    *   `server/ml/models/training_metrics.json`
3.  **Verify Loading:** Restart the Node backend. You should see:
    ```
    [ML] ✅ XGBoost ONNX model loaded
    [ML] ✅ Isolation Forest ONNX model loaded
    [ML] ✅ Feature config loaded
    [ML] 🚀 ONNX inference engine ready (real ML models)
    ```

---

## 6. Current Implementation Status

All core parts of the system have been successfully implemented:
*   **Backend framework & routers:** Fully functional.
*   **SQLite database setup:** Schema created and seeded correctly.
*   **ML Pipeline:** Method 1 Two-Stage Cascade + Method 3 Feature Engineering on 9,082 records (81 mules, 111:1 ratio). Leakage-free 5-fold cross-validation yields 0.864 ROC-AUC, 0.388 PR-AUC, and 91.3% precision in the high-confidence priority tier (21 TP vs 2 FP), with remaining suspicious transactions handled by Network Graph and Go Edge Shield.
*   **WebSockets:** Broadcasts transaction logs, new alerts, and regulatory registry changes in real time.
*   **GenAI Explainer:** Structured prompt setup for Gemini with generalized risk explanations.
*   **React Dashboard:** Completed pages for Live Feed, Flagged Accounts, Network Graph (react-force-graph), Analytics (Recharts), and Regulatory Feeds.
