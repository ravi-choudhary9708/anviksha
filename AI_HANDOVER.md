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

The system is structured as a monorepo containing a Node.js backend and a Vite+React frontend:

### Backend (`/server`)
*   **Framework:** Express.js + WebSockets (`ws` package) for real-time dashboard updates.
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

Ensure you have Node.js installed. Follow these commands:

### Step A: Install Dependencies
Run from the root directory:
```bash
npm run setup
```
*(This installs root and client packages, and initializes the SQLite database with seed data).*

### Step B: Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
DB_PATH=./data/anviksha.db
SIMULATION_INTERVAL=2000
```

### Step C: Start the Development Server
Start the frontend and backend concurrently:
```bash
npm run dev
```
*   Backend runs at: `http://localhost:3001`
*   Frontend runs at: `http://localhost:5173`

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
    *This script loads `DataSet.csv`, balances the classes using XGBoost, performs 5-fold cross-validation, tunes the threshold to 0.80 for 100% precision, trains the models, and writes the following files:*
    *   `server/ml/models/xgboost_fraud.onnx`
    *   `server/ml/models/isolation_forest.onnx`
    *   `server/ml/models/feature_config.json`
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
*   **ML Pipeline:** 18 golden features from `DataSet.csv` are properly mapped and scored via ONNX. Threshold tuned to 0.80 yielding 100% precision and 0.41 PR-AUC.
*   **WebSockets:** Broadcasts transaction logs, new alerts, and regulatory registry changes in real time.
*   **GenAI Explainer:** Structured prompt setup for Gemini with generalized risk explanations.
*   **React Dashboard:** Completed pages for Live Feed, Flagged Accounts, Network Graph (react-force-graph), Analytics (Recharts), and Regulatory Feeds.
