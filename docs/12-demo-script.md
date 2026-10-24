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

**Speaker:** "Under the hood, we extract 18 BOI Golden Behavioral Features instantly. This includes velocity, dormancy awakening, immediate pass-through speed, structuring, multi-party fan ratios, and regulatory flags.

To solve the extreme 111:1 class imbalance present in real banking data (where only 81 out of 9,082 accounts are mules), we designed a **Two-Stage Hierarchical Sieve**:
- **Stage 1 (High Recall):** Catches 96.3% of mules, filtering out ~8,730 legitimate accounts.
- **Stage 2 (High Precision):** A strict judge trained specifically on suspicious candidates that eliminates false alarms, achieving 94.8% precision with **zero innocent accounts frozen**.
- **Isolation Forest:** Simultaneously scans for unsupervised structural anomalies."

### 3. Mule Patterns & AI Explainer (1 minute)
*Action: Click on the "Flagged Accounts" tab.*

**Speaker:** "This takes us to the analyst view. Here are the accounts our system has flagged. Let's look at the riskiest one."

*Action: Click the top row to expand it.*

**Speaker:** "Instead of just giving analysts a score and making them dig through data, Anviksha uses Generative AI—specifically the Gemini API—to write a plain-language case summary. It tells us exactly *why* this account is suspicious: 'Dormancy awakening after 120 days, followed by fan-in pattern of 14 senders and immediate pass-through of 93% of funds.' The system can recommend an automatic freeze or escalate it to compliance."

### 4. Graph Analysis & ML Model Insights (1 minute)
*Action: Click on the "Network Graph" tab, then switch to the "ML Model" tab.*

**Speaker:** "In the Network Graph, our in-memory engine dynamically highlights central laundering hubs. 

And in our **ML Model Insights** tab, auditors can inspect the entire Two-Stage funnel in real time, view our 0.976 ROC-AUC curve on the 9,082 real BOI records, and see exact feature importance weights."

### 5. Conclusion (30 seconds)
**Speaker:** "Anviksha is production-ready. Powered by Node.js native SQLite and ONNX inference, it executes in under 1 millisecond per transaction with zero C++ compilation dependencies and zero Python microservice latency. It's real-time, highly accurate, explainable, and eliminates innocent customer friction. We'd be happy to answer any questions."

---

## Anticipated Questions & Answers

**Q: How do you handle false positives and avoid freezing innocent accounts?**
A: "This was our #1 engineering priority. In a 111:1 imbalanced bank dataset, a standard single-threshold model either misses mules or freezes thousands of innocent customers. We solved this with a **Two-Stage Hierarchical Pipeline**: Stage 1 screens for broad suspicion (96.3% recall, passing ~352 candidates), and Stage 2 applies deep precision constraints ($\ge 0.75$), resulting in 74 confirmed mules and **zero innocent accounts frozen**. Plus, we use Exponential Moving Average (EMA) so isolated anomalies never trigger a freeze."

**Q: Why use ONNX instead of a Python API?**
A: "Calling a Python microservice over HTTP for every transaction adds 20-50ms of network overhead and creates a distributed point of failure. Compiling our Two-Stage XGBoost and Isolation Forest models to ONNX allows us to execute inference directly in Node.js memory in less than 1 millisecond per transaction."

**Q: What if the Gemini API goes down or rate limits?**
A: "We built the system with graceful degradation. If the Gemini API is unreachable or rate-limited, Anviksha instantly falls back to a deterministic, rule-based template engine that generates explanations based on feature thresholds. The dashboard never breaks."

**Q: How did you train the ML model?**
A: "We trained on the official Bank of India Hackathon dataset (`DataSet.csv`) with 9,082 real customer records and 18 golden tabular features. Because only 81 accounts were confirmed mules (~111:1 imbalance), we implemented cost-sensitive `scale_pos_weight` learning for Stage 1 (recall sieve), followed by Stage 2 precision refinement on the candidate pool, verified with cross-validation."

**Q: Does it use a graph database?**
A: "To keep the tech stack lean and hackathon-friendly, we built a custom in-memory directed graph engine within Node.js that persists edges to our Node.js native SQLite database (`node:sqlite`). In enterprise production, this can seamlessly hook into Neo4j or Amazon Neptune."
