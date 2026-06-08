"""
============================================================
Anviksha — ML Model Training Script
============================================================
Trains XGBoost classifier + Isolation Forest for mule account
/ fraud detection. Exports models to ONNX format for use in
Node.js inference via onnxruntime-node.

Usage:
    python server/ml/train_model.py

Requirements:
    pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common

Output:
    server/ml/models/xgboost_fraud.onnx       — Main fraud classifier
    server/ml/models/isolation_forest.onnx     — Anomaly detector
    server/ml/models/feature_config.json       — Feature names + thresholds
============================================================
"""

import os
import json
import numpy as np
import pandas as pd
from pathlib import Path

# ML libraries
from xgboost import XGBClassifier
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.preprocessing import StandardScaler

# ONNX export
import onnx
from onnxmltools import convert_xgboost
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType

# ============================================================
# STEP 1: Generate Synthetic Training Data
# ============================================================
# We generate realistic mule-account behavior data based on
# the 19 MuleHunter.AI behavioral features identified by RBIH.
# This avoids needing the PaySim dataset download.

def generate_training_data(n_samples=20000, fraud_ratio=0.08):
    """
    Generate synthetic transaction data with 19 features.
    
    Normal accounts: regular banking patterns
    Mule accounts: high velocity, fan-in/fan-out, pass-through,
                   off-hours activity, round amounts, etc.
    """
    np.random.seed(42)
    
    n_fraud = int(n_samples * fraud_ratio)
    n_normal = n_samples - n_fraud
    
    # --- Feature definitions (matching feature-extractor.js) ---
    # Each row = one transaction scoring event with extracted features
    feature_names = [
        'txn_count_1h',           # 0: Transactions in last 1 hour
        'txn_count_24h',          # 1: Transactions in last 24 hours
        'amount_received_1h',     # 2: Total INR received in last hour
        'amount_sent_1h',         # 3: Total INR sent in last hour
        'avg_time_between_txns',  # 4: Average gap between txns (seconds)
        'is_off_hours',           # 5: Is 12AM-5AM? (binary)
        'is_round_amount',        # 6: Round number? (binary)
        'is_near_threshold',      # 7: Just below 50K threshold? (binary)
        'immediate_passthrough',  # 8: Receive+send within 5 min? (binary)
        'cross_channel_mixing',   # 9: Different channels in/out? (binary)
        'account_age_days',       # 10: How old is the account
        'is_new_account',         # 11: Opened in last 30 days? (binary)
        'no_prior_history',       # 12: First transaction? (binary)
        'previously_flagged',     # 13: Been flagged before? (binary)
        'unique_senders_24h',     # 14: Fan-in count
        'unique_receivers_24h',   # 15: Fan-out count
        'passthrough_ratio',      # 16: Received/sent ratio (near 1 = mule)
        'suspect_registry_match', # 17: In I4C registry? (binary)
        'linked_to_flagged',      # 18: Connected to flagged account? (binary)
    ]
    
    # ---- Generate NORMAL transaction features ----
    normal_data = np.zeros((n_normal, len(feature_names)))
    
    # Velocity: normal people do 0-3 txns/hour, 1-15/day
    normal_data[:, 0] = np.random.poisson(1.2, n_normal)              # txn_count_1h
    normal_data[:, 1] = np.random.poisson(5, n_normal)                # txn_count_24h
    normal_data[:, 2] = np.random.exponential(15000, n_normal)        # amount_received_1h
    normal_data[:, 3] = np.random.exponential(12000, n_normal)        # amount_sent_1h
    normal_data[:, 4] = np.random.exponential(7200, n_normal)         # avg_time_between (2hrs avg)
    normal_data[:, 5] = np.random.binomial(1, 0.05, n_normal)         # off_hours (5% chance)
    normal_data[:, 6] = np.random.binomial(1, 0.15, n_normal)         # round_amount (15% normal)
    normal_data[:, 7] = np.random.binomial(1, 0.02, n_normal)         # near_threshold (2% normal)
    normal_data[:, 8] = np.random.binomial(1, 0.03, n_normal)         # passthrough (3%)
    normal_data[:, 9] = np.random.binomial(1, 0.1, n_normal)          # cross_channel (10%)
    normal_data[:, 10] = np.random.exponential(800, n_normal) + 30    # account_age (old accounts)
    normal_data[:, 11] = np.random.binomial(1, 0.08, n_normal)        # new_account (8%)
    normal_data[:, 12] = np.random.binomial(1, 0.02, n_normal)        # no_prior_history (2%)
    normal_data[:, 13] = np.random.binomial(1, 0.01, n_normal)        # previously_flagged (1%)
    normal_data[:, 14] = np.random.poisson(2, n_normal)               # unique_senders (low)
    normal_data[:, 15] = np.random.poisson(2, n_normal)               # unique_receivers (low)
    normal_data[:, 16] = np.abs(np.random.normal(0.4, 0.3, n_normal)) # passthrough_ratio (not 1:1)
    normal_data[:, 17] = np.random.binomial(1, 0.005, n_normal)       # suspect_match (0.5%)
    normal_data[:, 18] = np.random.binomial(1, 0.01, n_normal)        # linked_to_flagged (1%)
    
    # ---- Generate MULE/FRAUD transaction features ----
    fraud_data = np.zeros((n_fraud, len(feature_names)))
    
    # Mules have HIGH velocity: 5-20 txns/hour, 20-80/day
    fraud_data[:, 0] = np.random.poisson(10, n_fraud) + 3             # txn_count_1h (high)
    fraud_data[:, 1] = np.random.poisson(35, n_fraud) + 10            # txn_count_24h (high)
    fraud_data[:, 2] = np.random.exponential(200000, n_fraud) + 50000 # amount_received (high)
    fraud_data[:, 3] = np.random.exponential(180000, n_fraud) + 40000 # amount_sent (high, pass-through)
    fraud_data[:, 4] = np.random.exponential(300, n_fraud) + 60       # avg_time_between (very short)
    fraud_data[:, 5] = np.random.binomial(1, 0.45, n_fraud)           # off_hours (45% — much higher)
    fraud_data[:, 6] = np.random.binomial(1, 0.65, n_fraud)           # round_amount (65% — suspicious)
    fraud_data[:, 7] = np.random.binomial(1, 0.3, n_fraud)            # near_threshold (30% — structuring)
    fraud_data[:, 8] = np.random.binomial(1, 0.7, n_fraud)            # passthrough (70% — key indicator)
    fraud_data[:, 9] = np.random.binomial(1, 0.55, n_fraud)           # cross_channel (55%)
    fraud_data[:, 10] = np.random.exponential(30, n_fraud) + 5        # account_age (new accounts)
    fraud_data[:, 11] = np.random.binomial(1, 0.6, n_fraud)           # new_account (60%)
    fraud_data[:, 12] = np.random.binomial(1, 0.35, n_fraud)          # no_prior_history (35%)
    fraud_data[:, 13] = np.random.binomial(1, 0.25, n_fraud)          # previously_flagged (25%)
    fraud_data[:, 14] = np.random.poisson(12, n_fraud) + 4            # unique_senders (high fan-in)
    fraud_data[:, 15] = np.random.poisson(6, n_fraud) + 2             # unique_receivers (fan-out)
    fraud_data[:, 16] = np.abs(np.random.normal(0.92, 0.08, n_fraud)) # passthrough_ratio (~1.0)
    fraud_data[:, 17] = np.random.binomial(1, 0.35, n_fraud)          # suspect_match (35%)
    fraud_data[:, 18] = np.random.binomial(1, 0.45, n_fraud)          # linked_to_flagged (45%)
    
    # Combine datasets
    X = np.vstack([normal_data, fraud_data])
    y = np.array([0] * n_normal + [1] * n_fraud)
    
    # Shuffle
    shuffle_idx = np.random.permutation(len(y))
    X = X[shuffle_idx]
    y = y[shuffle_idx]
    
    # Clip negative values (can happen with exponential distributions)
    X = np.clip(X, 0, None)
    
    # Ensure binary features stay binary
    for col in [5, 6, 7, 8, 9, 11, 12, 13, 17, 18]:
        X[:, col] = np.clip(X[:, col], 0, 1).round()
    
    return X, y, feature_names


# ============================================================
# STEP 2: Train XGBoost Classifier
# ============================================================

def train_xgboost(X_train, X_test, y_train, y_test):
    """
    Train XGBoost gradient boosting classifier for fraud detection.
    
    XGBoost works by building an ensemble of decision trees, where each
    new tree corrects errors from previous trees. It's the industry
    standard for tabular fraud detection because:
    - Handles mixed feature types (binary + continuous)
    - Fast training and inference
    - Built-in handling of class imbalance via scale_pos_weight
    - Highly interpretable via feature importance
    """
    # Calculate class weight to handle imbalanced data
    # (way more normal txns than fraud — we need the model to pay 
    #  extra attention to the rare fraud cases)
    n_normal = sum(y_train == 0)
    n_fraud = sum(y_train == 1)
    scale_weight = n_normal / n_fraud  # e.g., if 92% normal, 8% fraud → weight ≈ 11.5
    
    print(f"[TRAIN] Class distribution: Normal={n_normal}, Fraud={n_fraud}")
    print(f"[TRAIN] scale_pos_weight = {scale_weight:.2f}")
    
    model = XGBClassifier(
        n_estimators=200,          # 200 decision trees in the ensemble
        max_depth=6,               # Each tree can be up to 6 levels deep
        learning_rate=0.1,         # Step size for gradient descent
        scale_pos_weight=scale_weight,  # Compensate for class imbalance
        eval_metric='auc',         # Optimize for Area Under ROC Curve
        random_state=42,
        use_label_encoder=False,
        subsample=0.8,             # Use 80% of data per tree (prevents overfitting)
        colsample_bytree=0.8,     # Use 80% of features per tree
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=True
    )
    
    # Evaluate
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    print("\n[EVAL] XGBoost Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Normal', 'Fraud']))
    print(f"[EVAL] ROC AUC Score: {roc_auc_score(y_test, y_prob):.4f}")
    
    # Feature importance
    importances = model.feature_importances_
    return model, importances


# ============================================================
# STEP 3: Train Isolation Forest (Anomaly Detector)
# ============================================================

def train_isolation_forest(X_train):
    """
    Train Isolation Forest for unsupervised anomaly detection.
    
    How it works (simple):
    - Imagine plotting all transactions in 19-dimensional space
    - Normal transactions cluster together tightly
    - Fraud/mule transactions are far away from the cluster
    - Isolation Forest randomly picks a feature and a split value
    - Anomalies get "isolated" (separated) very quickly with few splits
    - Normal points take many splits to isolate
    - Fewer splits to isolate = more anomalous = higher anomaly score
    
    This catches NEW fraud patterns that XGBoost hasn't seen during training.
    """
    model = IsolationForest(
        n_estimators=150,          # 150 isolation trees
        contamination=0.08,        # Expected fraction of anomalies (~8%)
        max_samples='auto',        # Use min(256, n_samples) per tree
        random_state=42,
        n_jobs=-1,                 # Use all CPU cores
    )
    
    model.fit(X_train)
    
    # Score the training data to verify
    scores = model.decision_function(X_train)
    anomaly_labels = model.predict(X_train)
    n_anomalies = sum(anomaly_labels == -1)
    
    print(f"\n[EVAL] Isolation Forest detected {n_anomalies} anomalies in training data")
    print(f"[EVAL] Score range: [{scores.min():.4f}, {scores.max():.4f}]")
    
    return model


# ============================================================
# STEP 4: Export to ONNX Format
# ============================================================

def export_to_onnx(xgb_model, iso_model, feature_names, importances, output_dir):
    """
    Export both models to ONNX format so they can be loaded in Node.js
    via onnxruntime-node without needing Python at runtime.
    
    ONNX (Open Neural Network Exchange) is a universal model format
    supported by Microsoft, Google, Facebook, etc.
    """
    os.makedirs(output_dir, exist_ok=True)
    n_features = len(feature_names)
    
    # --- Export XGBoost to ONNX ---
    print("\n[EXPORT] Converting XGBoost to ONNX...")
    initial_type = [('float_input', OnnxFloatTensorType([None, n_features]))]
    onnx_xgb = convert_xgboost(
        xgb_model, 
        initial_types=initial_type,
        target_opset=12
    )
    xgb_path = os.path.join(output_dir, 'xgboost_fraud.onnx')
    with open(xgb_path, 'wb') as f:
        f.write(onnx_xgb.SerializeToString())
    print(f"[EXPORT] XGBoost saved to {xgb_path}")
    
    # --- Export Isolation Forest to ONNX ---
    print("[EXPORT] Converting Isolation Forest to ONNX...")
    initial_type_sklearn = [('float_input', FloatTensorType([None, n_features]))]
    onnx_iso = convert_sklearn(
        iso_model,
        initial_types=initial_type_sklearn,
        target_opset={'': 12, 'ai.onnx.ml': 3}
    )
    iso_path = os.path.join(output_dir, 'isolation_forest.onnx')
    with open(iso_path, 'wb') as f:
        f.write(onnx_iso.SerializeToString())
    print(f"[EXPORT] Isolation Forest saved to {iso_path}")
    
    # --- Save feature config (names, importance, thresholds) ---
    feature_config = {
        'feature_names': feature_names,
        'feature_count': n_features,
        'feature_importance': {
            name: float(imp) for name, imp in zip(feature_names, importances)
        },
        'thresholds': {
            'high_risk': 0.75,    # XGBoost probability > 75% = high risk
            'medium_risk': 0.45,  # 45-75% = medium risk
            'anomaly': -0.1,      # Isolation Forest score < -0.1 = anomaly
        },
        'model_info': {
            'xgboost': {
                'n_estimators': 200,
                'max_depth': 6,
                'training_samples': 20000,
                'fraud_ratio': 0.08,
            },
            'isolation_forest': {
                'n_estimators': 150,
                'contamination': 0.08,
            }
        }
    }
    
    config_path = os.path.join(output_dir, 'feature_config.json')
    with open(config_path, 'w') as f:
        json.dump(feature_config, f, indent=2)
    print(f"[EXPORT] Feature config saved to {config_path}")
    
    return xgb_path, iso_path, config_path


# ============================================================
# MAIN — Run the full training pipeline
# ============================================================

if __name__ == '__main__':
    print("=" * 60)
    print("  Anviksha — ML Model Training Pipeline")
    print("=" * 60)
    
    # Resolve output directory relative to this script
    script_dir = Path(__file__).parent
    output_dir = script_dir / 'models'
    
    # Step 1: Generate synthetic training data
    print("\n[STEP 1] Generating synthetic training data...")
    X, y, feature_names = generate_training_data(n_samples=20000, fraud_ratio=0.08)
    print(f"[DATA] Generated {len(y)} samples with {sum(y)} fraud cases")
    print(f"[DATA] Features: {len(feature_names)}")
    
    # Step 2: Split into train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"[DATA] Train: {len(y_train)}, Test: {len(y_test)}")
    
    # Step 3: Train XGBoost
    print("\n[STEP 2] Training XGBoost classifier...")
    xgb_model, importances = train_xgboost(X_train, X_test, y_train, y_test)
    
    # Step 4: Train Isolation Forest
    print("\n[STEP 3] Training Isolation Forest...")
    iso_model = train_isolation_forest(X_train)
    
    # Step 5: Export to ONNX
    print("\n[STEP 4] Exporting models to ONNX...")
    export_to_onnx(xgb_model, iso_model, feature_names, importances, str(output_dir))
    
    print("\n" + "=" * 60)
    print("  Training complete! Models saved to server/ml/models/")
    print("  You can now run: npm run dev")
    print("=" * 60)
