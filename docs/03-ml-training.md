# 03 — ML Training: Complete Guide

> **Anviksha** | Bank of India Hackathon 2026  
> This is the most critical document. Read it fully before running any Python commands.

---

## Table of Contents
- [Overview: What the ML System Does](#overview-what-the-ml-system-does)
- [What Data the Model Expects](#what-data-the-model-expects)
- [The 19 Features Explained](#the-19-features-explained)
- [Step 1: Install Python Dependencies](#step-1-install-python-dependencies)
- [Step 2: Training Data — How it's Generated](#step-2-training-data--how-its-generated)
- [Step 3: Training XGBoost](#step-3-training-xgboost)
- [Step 4: Training Isolation Forest](#step-4-training-isolation-forest)
- [Step 5: ONNX Export](#step-5-onnx-export)
- [Step 6: Run the Training Script](#step-6-run-the-training-script)
- [Step 7: Verify ONNX Files Were Created](#step-7-verify-onnx-files-were-created)
- [Step 8: Restart the Node Server](#step-8-restart-the-node-server)
- [Step 9: Verify Models Loaded on Dashboard](#step-9-verify-models-loaded-on-dashboard)
- [Using Real Data Instead of Synthetic](#using-real-data-instead-of-synthetic)
- [Retraining with Different Parameters](#retraining-with-different-parameters)
- [Understanding Model Output](#understanding-model-output)
- [Troubleshooting Training Errors](#troubleshooting-training-errors)

---

## Overview: What the ML System Does

The Anviksha ML system uses **two complementary models**:

```
Transaction
    │
    ▼
[Feature Extraction]
 Extract 19 numbers from the transaction + account history
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
[XGBoost Classifier]          [Isolation Forest]
 Supervised learning            Unsupervised anomaly detection
 Trained on labeled data        Trained on ALL data (no labels needed)
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

The model takes **exactly 19 numerical features** as input. They must always be in this exact order and type.

### Input Format

```python
# One sample = one row = one transaction being scored
# Shape: [1, 19] — 1 sample, 19 features
# All values must be float32 (non-negative)

sample = [
    txn_count_1h,          # float: 0 to ~50
    txn_count_24h,         # float: 0 to ~200
    amount_received_1h,    # float: 0 to ~10,000,000 (₹)
    amount_sent_1h,        # float: 0 to ~10,000,000 (₹)
    avg_time_between_txns, # float: 0 to ~86400 (seconds in a day)
    is_off_hours,          # binary: 0.0 or 1.0
    is_round_amount,       # binary: 0.0 or 1.0
    is_near_threshold,     # binary: 0.0 or 1.0
    immediate_passthrough, # binary: 0.0 or 1.0
    cross_channel_mixing,  # binary: 0.0 or 1.0
    account_age_days,      # float: 0 to ~3650 (10 years)
    is_new_account,        # binary: 0.0 or 1.0
    no_prior_history,      # binary: 0.0 or 1.0
    previously_flagged,    # binary: 0.0 or 1.0
    unique_senders_24h,    # float: 0 to ~100
    unique_receivers_24h,  # float: 0 to ~100
    passthrough_ratio,     # float: 0.0 to 1.0+
    suspect_registry_match,# binary: 0.0 or 1.0
    linked_to_flagged,     # binary: 0.0 or 1.0
]
```

### Important Rules for Input Data

| Rule | Explanation |
|------|-------------|
| **All values must be ≥ 0** | The training script clips negative values. Negative inputs will produce incorrect scores. |
| **Binary features must be exactly 0.0 or 1.0** | Features 5-9 and 11-13 and 17-18 are binary flags |
| **No NaN or null values** | Replace missing values with 0 before inference |
| **Amounts are in Indian Rupees (₹)** | Don't normalize — model expects raw ₹ values |
| **Time in seconds** | `avg_time_between_txns` is in seconds, not minutes |
| **Order matters** | Features must be in EXACTLY the order listed above |

---

## The 19 Features Explained

### Feature 0: `txn_count_1h`
**What it is:** Number of transactions where this account was the RECEIVER in the last 60 minutes.

**How it's computed:**
```javascript
// In feature-extractor.js:
const recent1h = stmts.getRecentTransactions.all({
  account_id: accountId,
  hours: 1
});
featureMap.txn_count_1h = recent1h.length;
```

**Normal range:** 0–3 | **Suspicious:** > 8 (mule accounts receive many transfers rapidly)

---

### Feature 1: `txn_count_24h`
**What it is:** Number of transactions in last 24 hours (both sent and received).

**Normal range:** 1–10 | **Suspicious:** > 30

---

### Feature 2: `amount_received_1h`
**What it is:** Total ₹ amount received in last 60 minutes.

**Normal range:** ₹0–₹15,000 | **Suspicious:** > ₹200,000

**Mule signal:** Mules aggregate funds from many senders quickly, so received amount spikes.

---

### Feature 3: `amount_sent_1h`
**What it is:** Total ₹ amount sent in last 60 minutes.

**Normal range:** ₹0–₹12,000 | **Suspicious:** High AND close to `amount_received_1h`

**Mule signal:** If sent ≈ received, the account is acting as a pass-through.

---

### Feature 4: `avg_time_between_txns`
**What it is:** Average time gap (in seconds) between consecutive transactions for this account.

**Computation:** Sort all recent transactions by time, compute pairwise gaps, take mean.

**Normal range:** > 3600 seconds (1+ hour between txns) | **Suspicious:** < 300 seconds (5 min)

---

### Feature 5: `is_off_hours` (binary)
**What it is:** Is this transaction happening between 12:00 AM and 5:00 AM?

```javascript
const hour = new Date(transaction.timestamp).getHours();
featureMap.is_off_hours = (hour >= 0 && hour < 5) ? 1 : 0;
```

**Normal:** 0 (daytime) | **Suspicious:** 1 (mule operations often happen at night)

---

### Feature 6: `is_round_amount` (binary)
**What it is:** Is the transaction amount a round number (divisible by 1000)?

```javascript
featureMap.is_round_amount = (amount % 1000 === 0) ? 1 : 0;
```

**Mule signal:** Fraudsters often use round amounts like ₹10,000, ₹50,000 for easy splitting.

---

### Feature 7: `is_near_threshold` (binary)
**What it is:** Is the amount between ₹45,000 and ₹49,999 (just below the ₹50,000 reporting threshold)?

```javascript
featureMap.is_near_threshold = (amount >= 45000 && amount < 50000) ? 1 : 0;
```

**Mule signal:** This is called **structuring** — deliberately keeping amounts below reporting limits.

---

### Feature 8: `immediate_passthrough` (binary)
**What it is:** Did this account receive money and send money within 5 minutes of each other?

```javascript
// Check if there's a received txn within 5 minutes of a sent txn
const received5min = recentTxns.filter(t => 
  t.receiver_account_id === accountId && 
  Math.abs(new Date(t.timestamp) - now) < 300000  // 5 minutes
);
const sent5min = recentTxns.filter(t =>
  t.sender_account_id === accountId &&
  Math.abs(new Date(t.timestamp) - now) < 300000
);
featureMap.immediate_passthrough = (received5min.length > 0 && sent5min.length > 0) ? 1 : 0;
```

**This is the single strongest mule indicator.** A real person doesn't receive ₹50K and immediately forward it.

---

### Feature 9: `cross_channel_mixing` (binary)
**What it is:** Did the account receive money on one channel and send on a different one in the last hour?

```javascript
const receivedChannels = new Set(recentReceived.map(t => t.type));
const sentChannels = new Set(recentSent.map(t => t.type));
const intersection = [...receivedChannels].filter(c => sentChannels.has(c));
featureMap.cross_channel_mixing = intersection.length === 0 && 
  receivedChannels.size > 0 && sentChannels.size > 0 ? 1 : 0;
```

**Mule signal:** Receiving via UPI (faster, harder to trace), sending via NEFT (direct bank transfer) is a layering technique.

---

### Feature 10: `account_age_days`
**What it is:** How many days since the account was opened.

```javascript
const openDate = new Date(account.opened_date);
const ageDays = (Date.now() - openDate) / (1000 * 60 * 60 * 24);
featureMap.account_age_days = Math.max(0, Math.floor(ageDays));
```

**Normal range:** 365–3650 days | **Suspicious:** < 30 days with high transaction volume

---

### Feature 11: `is_new_account` (binary)
**What it is:** Was this account opened in the last 30 days?

**Normal:** 0 | **Suspicious:** 1 (new accounts are disproportionately used for mule activity)

---

### Feature 12: `no_prior_history` (binary)
**What it is:** Is this the first-ever transaction on this account?

**Mule signal:** An account receiving ₹1L with zero prior history is extremely suspicious.

---

### Feature 13: `previously_flagged` (binary)
**What it is:** Has this account ever been flagged by the ML system before?

```javascript
featureMap.previously_flagged = (account.status === 'flagged' || account.status === 'frozen') ? 1 : 0;
```

**Mule signal:** Repeat offenders should be scored more harshly.

---

### Feature 14: `unique_senders_24h`
**What it is:** How many UNIQUE accounts sent money to this account in the last 24 hours?

```javascript
const uniqueSenders = new Set(last24hReceived.map(t => t.sender_account_id));
featureMap.unique_senders_24h = uniqueSenders.size;
```

**Normal range:** 0–3 (salary, friend transfers) | **Suspicious:** > 10

**This is the fan-in mule pattern.** A mule receives from many different victims.

---

### Feature 15: `unique_receivers_24h`
**What it is:** How many UNIQUE accounts received money FROM this account in 24 hours?

**Normal range:** 0–2 | **Suspicious:** > 5

**Fan-out pattern:** The mule distributes funds to multiple layering accounts.

---

### Feature 16: `passthrough_ratio`
**What it is:** `totalAmountSent_24h / totalAmountReceived_24h`

```javascript
const sent24h = sum of all amounts sent in last 24h
const received24h = sum of all amounts received in last 24h
featureMap.passthrough_ratio = received24h > 0 ? sent24h / received24h : 0;
```

**Normal:** 0.0–0.5 (people spend less than they receive) | **Suspicious:** > 0.85

A ratio of ~1.0 means the account is forwarding almost everything it receives — classic mule behavior.

---

### Feature 17: `suspect_registry_match` (binary)
**What it is:** Does this account's phone number, UPI ID, or account number appear in the I4C/NCRP Suspect Registry?

```javascript
const match = stmts.checkSuspectRegistry.get({
  phone: account.phone,
  upi: account.upi_id,
  account: account.account_number
});
featureMap.suspect_registry_match = match ? 1 : 0;
```

**This is the most powerful single feature.** A registry match alone contributes 60 points to the regulatory sub-score.

---

### Feature 18: `linked_to_flagged` (binary)
**What it is:** Is any account that has transacted with this account in the last 24 hours already flagged?

```javascript
const connectedAccounts = [...senders, ...receivers];
const anyFlagged = connectedAccounts.some(id => {
  const acc = stmts.getAccount.get(id);
  return acc && (acc.status === 'flagged' || acc.status === 'frozen');
});
featureMap.linked_to_flagged = anyFlagged ? 1 : 0;
```

**"Guilt by association"** — if you're transacting with known mules, you're suspicious too.

---

## Step 1: Install Python Dependencies

```bash
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common
```

### What each package does

| Package | Version Tested | Purpose |
|---------|---------------|---------|
| `xgboost` | 3.2.0 | Train the gradient boosting fraud classifier |
| `scikit-learn` | 1.9.0 | Train Isolation Forest + evaluation utilities |
| `numpy` | 2.4.2 | Numerical arrays for data generation |
| `pandas` | 3.0.1 | Data manipulation |
| `onnx` | 1.21.0 | ONNX model format library |
| `skl2onnx` | 1.20.0 | Convert scikit-learn models to ONNX |
| `onnxmltools` | 1.16.0 | Convert XGBoost models to ONNX |
| `onnxconverter-common` | 1.16.0 | Shared utilities for ONNX conversion |

> ⚠️ **Python 3.9 to 3.13 are all supported.** Tested on Python 3.13.5.

---

## Step 2: Training Data — How it's Generated

The training script generates **20,000 synthetic samples** that mimic real mule account behavior patterns derived from the RBIH MuleHunter.AI research paper.

### Normal account patterns (18,400 samples — 92% of data)
```python
# Low transaction velocity
txn_count_1h    = Poisson(λ=1.2)        # Most hours have 0-2 txns
txn_count_24h   = Poisson(λ=5)          # 3-8 txns per day typically
amount_received = Exponential(mean=15000) # Small amounts, salary scale
avg_time        = Exponential(mean=7200)  # Txns hours apart (7200s = 2hrs)

# Rarely suspicious behaviors
is_off_hours    = Binomial(p=0.05)       # Only 5% chance of night txn
is_round_amount = Binomial(p=0.15)       # 15% have round amounts (normal)
is_near_threshold = Binomial(p=0.02)     # 2% near ₹50K (coincidence)
immediate_passthrough = Binomial(p=0.03) # 3% accidental overlap

# Old established accounts
account_age_days = Exponential(mean=800) + 30  # Average 2+ years old
is_new_account   = Binomial(p=0.08)            # 8% are new accounts

# Few network connections
unique_senders   = Poisson(λ=2)          # 0-4 unique senders normally
unique_receivers = Poisson(λ=2)          # 0-4 unique receivers
passthrough_ratio = |Normal(mean=0.4, std=0.3)|  # 40% of received is spent
```

### Mule account patterns (1,600 samples — 8% of data)
```python
# HIGH transaction velocity
txn_count_1h    = Poisson(λ=10) + 3    # 5-20+ txns per hour
txn_count_24h   = Poisson(λ=35) + 10   # 20-80 txns per day
amount_received = Exponential(mean=200000) + 50000  # Lakhs received
avg_time        = Exponential(mean=300) + 60  # Txns minutes apart

# Frequently suspicious behaviors
is_off_hours    = Binomial(p=0.45)     # 45% night transactions
is_round_amount = Binomial(p=0.65)     # 65% round amounts
is_near_threshold = Binomial(p=0.30)   # 30% structuring behavior
immediate_passthrough = Binomial(p=0.70) # 70% pass-through!
cross_channel_mixing = Binomial(p=0.55) # 55% cross-channel

# New accounts
account_age_days = Exponential(mean=30) + 5  # Very new accounts
is_new_account   = Binomial(p=0.60)           # 60% are new accounts

# MANY network connections (fan-in/fan-out)
unique_senders   = Poisson(λ=12) + 4   # 8-25 unique senders
unique_receivers = Poisson(λ=6) + 2    # 4-15 unique receivers
passthrough_ratio = |Normal(mean=0.92, std=0.08)|  # ~92% pass-through

# Regulatory
suspect_registry_match = Binomial(p=0.35)  # 35% in registry
linked_to_flagged      = Binomial(p=0.45)  # 45% connected to flagged
```

### Using Real Data Instead

If you have real banking data, you can replace the synthetic generation. See the [section below](#using-real-data-instead-of-synthetic).

---

## Step 3: Training XGBoost

```python
from xgboost import XGBClassifier

model = XGBClassifier(
    n_estimators=200,           # How many decision trees to build
                                # More = better but slower. 200 is a good balance.
    
    max_depth=6,                # Maximum depth of each tree
                                # Deeper = captures more complex patterns but can overfit
    
    learning_rate=0.1,          # How much each tree corrects the previous
                                # Lower = more conservative, needs more trees
    
    scale_pos_weight=11.5,      # Weight for fraud class (92/8 ≈ 11.5)
                                # Critical for imbalanced datasets!
                                # Without this, model ignores rare fraud cases
    
    eval_metric='auc',          # Optimize for ROC-AUC (area under curve)
                                # Better than accuracy for imbalanced data
    
    random_state=42,            # Reproducibility
    
    subsample=0.8,              # Use 80% of data per tree (prevents overfitting)
    colsample_bytree=0.8,       # Use 80% of features per tree
)

model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],  # Monitor validation AUC during training
    verbose=True                   # Print AUC after each tree
)
```

### Understanding AUC = 1.0 on Synthetic Data

You will see:
```
[0]	validation_0-auc:1.00000
[1]	validation_0-auc:1.00000
...
[199] validation_0-auc:1.00000
```

**Is 1.0 AUC bad?** On synthetic data, no. The patterns are mathematically distinct (mule txn_count = 13+ vs normal = 1-2), so a powerful model can perfectly separate them. On real banking data, expect **0.92–0.97 AUC** which is excellent.

---

## Step 4: Training Isolation Forest

```python
from sklearn.ensemble import IsolationForest

iso_model = IsolationForest(
    n_estimators=150,        # Number of isolation trees
                             # More trees = more stable anomaly scores
    
    contamination=0.08,      # Expected fraction of anomalies in data
                             # Set this to your estimated fraud rate
                             # (0.08 = 8% expected fraud)
    
    max_samples='auto',      # Use min(256, n_samples) samples per tree
    random_state=42,
    n_jobs=-1,               # Use all CPU cores for parallel training
)

iso_model.fit(X_train)       # No labels needed — unsupervised!
```

**How Isolation Forest works:**
- Randomly selects a feature and a random split value
- Repeats until the data point is isolated (alone in a partition)
- Anomalies (mule accounts) get isolated in fewer steps because they're outliers
- Output: `+1` = normal, `-1` = anomaly
- Decision score: more negative = more anomalous

---

## Step 5: ONNX Export

ONNX (Open Neural Network Exchange) converts the Python models into a format that Node.js can run without any Python dependency.

### XGBoost → ONNX

```python
from onnxmltools import convert_xgboost
# ⚠️ CRITICAL: Must use onnxmltools version, NOT onnxconverter_common version
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType

initial_type = [('float_input', OnnxFloatTensorType([None, 19]))]
#                               ↑ Input name    ↑ [batch_size=dynamic, 19 features]

onnx_xgb = convert_xgboost(
    xgb_model,
    initial_types=initial_type,
    target_opset=12         # ONNX opset version 12 (compatible with onnxruntime-node)
)

with open('server/ml/models/xgboost_fraud.onnx', 'wb') as f:
    f.write(onnx_xgb.SerializeToString())
```

### Isolation Forest → ONNX

```python
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

initial_type = [('float_input', FloatTensorType([None, 19]))]

onnx_iso = convert_sklearn(
    iso_model,
    initial_types=initial_type,
    # ⚠️ CRITICAL: Must be a dict, not an integer!
    # Passing target_opset=12 causes: RuntimeError: domain 'ai.onnx.ml' version 4 not supported
    target_opset={'': 12, 'ai.onnx.ml': 3}
)

with open('server/ml/models/isolation_forest.onnx', 'wb') as f:
    f.write(onnx_iso.SerializeToString())
```

---

## Step 6: Run the Training Script

```bash
# From the project root (mule/ directory):
python server/ml/train_model.py
```

### Expected Full Output

```
============================================================
  Anviksha — ML Model Training Pipeline
============================================================

[STEP 1] Generating synthetic training data...
[DATA] Generated 20000 samples with 1600 fraud cases
[DATA] Features: 19
[DATA] Train: 16000, Test: 4000

[STEP 2] Training XGBoost classifier...
[TRAIN] Class distribution: Normal=14720, Fraud=1280
[TRAIN] scale_pos_weight = 11.50
[0]	validation_0-auc:1.00000
[1]	validation_0-auc:1.00000
...
[199] validation_0-auc:1.00000

[EVAL] XGBoost Classification Report:
              precision    recall  f1-score   support
      Normal       1.00      1.00      1.00      3680
       Fraud       1.00      1.00      1.00       320
    accuracy                           1.00      4000

[EVAL] ROC AUC Score: 1.0000

[STEP 3] Training Isolation Forest...
[EVAL] Isolation Forest detected 1280 anomalies in training data
[EVAL] Score range: [-0.1724, 0.2486]

[STEP 4] Exporting models to ONNX...
[EXPORT] Converting XGBoost to ONNX...
[EXPORT] XGBoost saved to C:\...\server\ml\models\xgboost_fraud.onnx
[EXPORT] Converting Isolation Forest to ONNX...
[EXPORT] Isolation Forest saved to C:\...\server\ml\models\isolation_forest.onnx
[EXPORT] Feature config saved to C:\...\server\ml\models\feature_config.json

============================================================
  Training complete! Models saved to server/ml/models/
  You can now run: npm run dev
============================================================
```

**Time estimate:** ~45 seconds total on a modern laptop.

---

## Step 7: Verify ONNX Files Were Created

```bash
# Check the models directory:
dir server\ml\models\

# Expected output:
# xgboost_fraud.onnx       ~50KB
# isolation_forest.onnx    ~200KB
# feature_config.json      ~2KB
```

If any file is missing, check the training script output for errors.

### What's in `feature_config.json`?

```json
{
  "feature_names": ["txn_count_1h", "txn_count_24h", ...],
  "feature_count": 19,
  "feature_importance": {
    "txn_count_1h": 0.142,
    "passthrough_ratio": 0.198,
    "suspect_registry_match": 0.089,
    ...
  },
  "thresholds": {
    "high_risk": 0.75,
    "medium_risk": 0.45,
    "anomaly": -0.1
  },
  "model_info": {
    "xgboost": { "n_estimators": 200, "max_depth": 6, "training_samples": 20000 },
    "isolation_forest": { "n_estimators": 150, "contamination": 0.08 }
  }
}
```

This file is loaded by the Node.js scoring engine for feature validation and logging.

---

## Step 8: Restart the Node Server

The ONNX models are loaded **once at startup** by `server/ml/scoring-engine.js`. You must restart the server after training.

```bash
# If server is already running, stop it first (Ctrl+C)
# Then start again:
npm run dev
```

### What happens during startup (in `scoring-engine.js`)

```javascript
export async function initScoringEngine() {
  // Check if model files exist
  const modelsExist = existsSync(XGB_MODEL_PATH) && existsSync(ISO_MODEL_PATH);
  
  if (modelsExist) {
    // Load onnxruntime-node (dynamic import)
    ort = await import('onnxruntime-node');
    
    // Create inference sessions (loads the .onnx files into memory)
    xgbSession = await ort.InferenceSession.create(XGB_MODEL_PATH);
    // → Logs: [ML] ✅ XGBoost ONNX model loaded
    
    isoSession = await ort.InferenceSession.create(ISO_MODEL_PATH);
    // → Logs: [ML] ✅ Isolation Forest ONNX model loaded
    
    featureConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    // → Logs: [ML] ✅ Feature config loaded
    
    useONNX = true;
    // → Logs: [ML] 🚀 ONNX inference engine ready (real ML models)
  } else {
    // Files don't exist
    useONNX = false;
    // → Logs: [ML] ⚠️ ONNX model files not found
    // → Logs: [ML] 📋 Using rule-based fallback scoring engine
  }
}
```

---

## Step 9: Verify Models Loaded on Dashboard

After restarting, open `http://localhost:5173`.

### In the dashboard header stats bar, you should see:
```
ML: XGBoost + Isolation Forest (ONNX)
```

If it shows `ML: Rule-Based`, the ONNX models didn't load. Check the server console for errors.

### Via API health check:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/health" | ConvertTo-Json
```

Expected response:
```json
{
  "status": "ok",
  "service": "Anviksha Fraud Detection API",
  "mlEngine": "XGBoost + Isolation Forest (ONNX)",
  "usingONNX": true
}
```

### Via Dashboard Stats:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/dashboard/stats" | ConvertTo-Json
```

Look for:
```json
{
  "mlEngine": "XGBoost + Isolation Forest (ONNX)"
}
```

---

## Using Real Data Instead of Synthetic

If you have real banking transaction data, you can train on it instead of synthetic data.

### Required data format

Your real data should be a CSV/DataFrame with these columns:

```
account_id, timestamp, amount, type, channel, 
sender_account_id, receiver_account_id, is_fraud (0 or 1)
```

### Modify `train_model.py` to use real data

Replace the `generate_training_data()` call with:

```python
import pandas as pd

def load_real_data(csv_path):
    """Load real banking data and compute the 19 features."""
    df = pd.read_csv(csv_path)
    
    # You need to pre-compute the 19 features from your raw data
    # This requires computing rolling windows, network stats, etc.
    # See docs/04-features.md for exact feature definitions
    
    feature_names = [
        'txn_count_1h', 'txn_count_24h', 'amount_received_1h',
        'amount_sent_1h', 'avg_time_between_txns', 'is_off_hours',
        'is_round_amount', 'is_near_threshold', 'immediate_passthrough',
        'cross_channel_mixing', 'account_age_days', 'is_new_account',
        'no_prior_history', 'previously_flagged', 'unique_senders_24h',
        'unique_receivers_24h', 'passthrough_ratio',
        'suspect_registry_match', 'linked_to_flagged'
    ]
    
    X = df[feature_names].values.astype(np.float32)
    y = df['is_fraud'].values
    
    X = np.clip(X, 0, None)  # No negative values
    return X, y, feature_names

# In main:
X, y, feature_names = load_real_data('path/to/your/data.csv')
```

### Important considerations for real data

1. **Class imbalance**: Real fraud rates are 0.1%–2%. Adjust `contamination` in Isolation Forest and `scale_pos_weight` in XGBoost accordingly.
2. **Feature computation**: You need to pre-compute rolling window features (txn_count_1h, etc.) from raw transaction logs before training.
3. **Data leakage**: Make sure the train/test split is done by TIME (not random), so the model doesn't see future data during training.

---

## Retraining with Different Parameters

### More conservative model (fewer false positives)
```python
# Increase the threshold for what XGBoost considers fraud
model = XGBClassifier(
    n_estimators=300,     # More trees
    max_depth=4,          # Shallower trees (less overfit)
    learning_rate=0.05,   # Lower learning rate
    scale_pos_weight=20,  # Higher weight for fraud class
)
```

### More aggressive model (catch more fraud, more false positives)
```python
model = XGBClassifier(
    n_estimators=200,
    max_depth=8,          # Deeper trees
    scale_pos_weight=5,   # Lower weight (catches more but more FP)
)
```

### Change contamination rate in Isolation Forest
```python
IsolationForest(
    contamination=0.05,  # If you expect 5% fraud rate
    # or
    contamination=0.15,  # If you expect 15% fraud rate
)
```

---

## Understanding Model Output

### XGBoost ONNX Output

The `xgbSession.run()` returns:
```javascript
{
  label: Tensor([0]),           // Predicted class: 0=normal, 1=fraud
  probabilities: Tensor([      // [P(normal), P(fraud)]
    [0.023, 0.977]             // This means 97.7% fraud probability
  ])
}
```

We use `probabilities[0][1]` (the fraud probability) scaled to 0–100.

### Isolation Forest ONNX Output

```javascript
{
  label: Tensor([−1]),  // -1 = anomaly, +1 = normal
  // (Optional) scores tensor if available
}
```

If label = -1, we add an anomaly boost of up to 20 points to the composite score.

### Composite Score Calculation

```javascript
// From scoring-engine.js:
const xgbScore = fraudProbability * 100;      // e.g. 0.977 * 100 = 97.7
const isoBoost = isoLabel === -1 
  ? Math.min(20, Math.abs(isoScore) * 30)     // Max 20 point boost
  : 0;
const compositeScore = Math.min(100, xgbScore + isoBoost);  // Cap at 100
```

---

## Troubleshooting Training Errors

### Error: `RuntimeError: Operator XGBClassifier got input with wrong type`

```
RuntimeError: Operator XGBClassifier (type: XGBClassifier) got an input float_input 
with a wrong type <class 'onnxconverter_common.data_types.FloatTensorType'>. 
Only [<class 'onnxmltools.convert.common.data_types.FloatTensorType'>, ...] are allowed
```

**Fix:** Import `FloatTensorType` from the correct module:
```python
# ❌ Wrong:
from onnxconverter_common import FloatTensorType as OnnxFloatTensorType

# ✅ Correct:
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType
```

---

### Error: `RuntimeError: model using version 4 of domain 'ai.onnx.ml' not supported`

```
RuntimeError: The model is using version 4 of domain 'ai.onnx.ml' not supported yet 
by this library. You need to specify target_opset={'ai.onnx.ml': 3}.
```

**Fix:** Use a dict for `target_opset` when converting Isolation Forest:
```python
# ❌ Wrong:
onnx_iso = convert_sklearn(iso_model, initial_types=..., target_opset=12)

# ✅ Correct:
onnx_iso = convert_sklearn(iso_model, initial_types=..., target_opset={'': 12, 'ai.onnx.ml': 3})
```

---

### Error: `ModuleNotFoundError: No module named 'onnxmltools'`

```bash
pip install onnxmltools onnxconverter-common
```

---

### Error: `use_label_encoder` warning from XGBoost

```
Parameters: { "use_label_encoder" } are not used.
```

This is just a **warning**, not an error. It can be safely ignored. The model still trains correctly.

---

### Training completes but Node.js shows "rule-based fallback"

1. Check that `server/ml/models/xgboost_fraud.onnx` exists
2. Check that `server/ml/models/isolation_forest.onnx` exists
3. Restart the Node.js server (models are only loaded at startup)
4. Check the server logs for any ONNX loading errors
