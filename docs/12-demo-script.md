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
