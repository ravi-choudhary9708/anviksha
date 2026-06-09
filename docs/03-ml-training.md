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
Transaction
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
