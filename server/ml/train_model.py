"""
============================================================
Anviksha — ML Model Training Script (DataSet Integration)
============================================================
Trains XGBoost classifier + Isolation Forest using the provided
dataset (DataSet.csv) with 18 specific features.

Usage:
    python server/ml/train_model.py

Requirements:
    pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common

Output:
    server/ml/models/xgboost_fraud.onnx       — Main fraud classifier
    server/ml/models/isolation_forest.onnx     — Anomaly detector
    server/ml/models/feature_config.json       — Feature names + mappings
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
from sklearn.preprocessing import LabelEncoder

# ONNX export
from onnxmltools import convert_xgboost
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType

# ============================================================
# STEP 1: Load and Preprocess Real Dataset
# ============================================================

def load_and_preprocess_data(dataset_path):
    """
    Load DataSet.csv, select the 18 abstract features and target F3924.
    """
    print(f"Loading dataset from: {dataset_path}")
    
    feature_names = [
        'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082', 'F2122', 
        'F2582', 'F2678', 'F2737', 'F2956', 'F3043', 'F3836', 'F3887', 
        'F3889', 'F3891', 'F3894'
    ]
    target_name = 'F3924'
    
    # Read CSV
    df = pd.read_csv(dataset_path, usecols=feature_names + [target_name], low_memory=False)
    
    # Handle Missing Values (Fill numerical with 0, categorical with "UNKNOWN")
    for col in feature_names:
        if df[col].dtype == object:
            df[col] = df[col].fillna('UNKNOWN').astype(str)
        else:
            df[col] = df[col].fillna(0)
    
    # Label encode categorical features (F3889, F3891)
    le_3889 = LabelEncoder()
    df['F3889'] = le_3889.fit_transform(df['F3889'])
    
    le_3891 = LabelEncoder()
    df['F3891'] = le_3891.fit_transform(df['F3891'])
    
    # Extract mappings for Node.js
    mappings = {
        'F3889': {str(c): int(v) for c, v in zip(le_3889.classes_, le_3889.transform(le_3889.classes_))},
        'F3891': {str(c): int(v) for c, v in zip(le_3891.classes_, le_3891.transform(le_3891.classes_))}
    }
    
    X = df[feature_names].values.astype(np.float32)
    y = df[target_name].values.astype(int)
    
    return X, y, feature_names, mappings


# ============================================================
# STEP 2: Train XGBoost Classifier
# ============================================================

def train_xgboost(X_train, X_test, y_train, y_test):
    n_normal = sum(y_train == 0)
    n_fraud = sum(y_train == 1)
    
    # Handle case where there are no normal or fraud samples (should not happen, but safe)
    scale_weight = n_normal / max(1, n_fraud)
    
    print(f"[TRAIN] Class distribution: Normal={n_normal}, Fraud={n_fraud}")
    print(f"[TRAIN] scale_pos_weight = {scale_weight:.2f}")
    
    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        scale_pos_weight=scale_weight,
        eval_metric='auc',
        random_state=42,
        use_label_encoder=False,
        subsample=0.8,
        colsample_bytree=0.8,
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False
    )
    
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    print("\n[EVAL] XGBoost Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Normal', 'Fraud']))
    print(f"[EVAL] ROC AUC Score: {roc_auc_score(y_test, y_prob):.4f}")
    
    importances = model.feature_importances_
    return model, importances


# ============================================================
# STEP 3: Train Isolation Forest (Anomaly Detector)
# ============================================================

def train_isolation_forest(X_train):
    model = IsolationForest(
        n_estimators=150,
        contamination=0.03,  # Adjusted contamination for dataset
        max_samples='auto',
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train)
    
    anomaly_labels = model.predict(X_train)
    n_anomalies = sum(anomaly_labels == -1)
    
    print(f"\n[EVAL] Isolation Forest detected {n_anomalies} anomalies in training data")
    return model


# ============================================================
# STEP 4: Export to ONNX Format
# ============================================================

def export_to_onnx(xgb_model, iso_model, feature_names, importances, mappings, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    n_features = len(feature_names)
    
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
    
    feature_config = {
        'feature_names': feature_names,
        'feature_count': n_features,
        'mappings': mappings,
        'feature_importance': {
            name: float(imp) for name, imp in zip(feature_names, importances)
        },
        'thresholds': {
            'high_risk': 0.75,
            'medium_risk': 0.45,
            'anomaly': -0.05,
        }
    }
    
    config_path = os.path.join(output_dir, 'feature_config.json')
    with open(config_path, 'w') as f:
        json.dump(feature_config, f, indent=2)
    print(f"[EXPORT] Feature config saved to {config_path}")


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    print("=" * 60)
    print("  Anviksha — ML Model Training Pipeline (Real Dataset)")
    print("=" * 60)
    
    script_dir = Path(__file__).parent
    output_dir = script_dir / 'models'
    dataset_path = script_dir.parent.parent / 'dataset' / 'DataSet.csv'
    
    print("\n[STEP 1] Loading and preprocessing real data...")
    X, y, feature_names, mappings = load_and_preprocess_data(dataset_path)
    print(f"[DATA] Loaded {len(y)} samples with {sum(y)} fraud cases")
    print(f"[DATA] Features: {len(feature_names)}")
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"[DATA] Train: {len(y_train)}, Test: {len(y_test)}")
    
    print("\n[STEP 2] Training XGBoost classifier...")
    xgb_model, importances = train_xgboost(X_train, X_test, y_train, y_test)
    
    print("\n[STEP 3] Training Isolation Forest...")
    iso_model = train_isolation_forest(X_train)
    
    print("\n[STEP 4] Exporting models to ONNX...")
    export_to_onnx(xgb_model, iso_model, feature_names, importances, mappings, str(output_dir))
    
    print("\n" + "=" * 60)
    print("  Training complete! Models saved to server/ml/models/")
    print("=" * 60)
