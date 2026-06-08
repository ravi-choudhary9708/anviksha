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
