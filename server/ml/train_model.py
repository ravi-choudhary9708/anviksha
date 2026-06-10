import os
import json
import numpy as np
import pandas as pd
from pathlib import Path

from xgboost import XGBClassifier
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    classification_report, roc_auc_score,
    average_precision_score, confusion_matrix, f1_score,
    precision_score, recall_score
)
from sklearn.preprocessing import LabelEncoder

from onnxmltools import convert_xgboost
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType

GOLDEN_FEATURES = [
    'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082', 'F2122',
    'F2582', 'F2678', 'F2737', 'F2956', 'F3043', 'F3836', 'F3887',
    'F3889', 'F3891', 'F3894'
]
TARGET = 'F3924'

def load_data(dataset_path):
    print(f"Loading: {dataset_path}")
    df = pd.read_csv(dataset_path, usecols=GOLDEN_FEATURES + [TARGET], low_memory=False)

    # Drop unnamed index columns
    df = df.loc[:, ~df.columns.str.match(r'^Unnamed')]

    for col in GOLDEN_FEATURES:
        if df[col].dtype == object:
            df[col] = df[col].fillna('UNKNOWN').astype(str)
        else:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # Encode categorical string columns
    mappings = {}
    cat_cols = [c for c in GOLDEN_FEATURES if df[c].dtype == object]
    encoders = {}
    for col in cat_cols:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col])
        encoders[col] = le
        mappings[col] = {str(c): int(v) for c, v in zip(le.classes_, le.transform(le.classes_))}

    X = df[GOLDEN_FEATURES].values.astype(np.float32)
    y = df[TARGET].values.astype(int)

    print(f"Loaded {len(y)} rows | Fraud: {y.sum()} ({y.mean()*100:.2f}%) | Features: {len(GOLDEN_FEATURES)}")
    return X, y, mappings


def train_xgboost(X_train, X_test, y_train, y_test):
    n_normal = (y_train == 0).sum()
    n_fraud = (y_train == 1).sum()
    scale_weight = n_normal / max(1, n_fraud)
    print(f"scale_pos_weight = {scale_weight:.1f}")

    model = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_weight,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        eval_metric='aucpr',
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = model.predict(X_test)

    # Tune threshold for better precision/recall balance
    thresholds = np.arange(0.1, 0.9, 0.05)
    best_f1, best_thresh = 0, 0.5
    for t in thresholds:
        pred_t = (y_prob >= t).astype(int)
        f = f1_score(y_test, pred_t, zero_division=0)
        if f > best_f1:
            best_f1, best_thresh = f, t

    y_pred_tuned = (y_prob >= best_thresh).astype(int)
    cm = confusion_matrix(y_test, y_pred_tuned)

    print("\n=== XGBoost Results ===")
    print(classification_report(y_test, y_pred_tuned, target_names=['Normal', 'Fraud']))

    roc = roc_auc_score(y_test, y_prob)
    pr  = average_precision_score(y_test, y_prob)
    f1  = f1_score(y_test, y_pred_tuned, zero_division=0)
    prec = precision_score(y_test, y_pred_tuned, zero_division=0)
    rec  = recall_score(y_test, y_pred_tuned, zero_division=0)

    print(f"ROC-AUC: {roc:.4f} | PR-AUC: {pr:.4f} | F1: {f1:.4f}")
    print(f"Best threshold: {best_thresh:.2f}")

    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='roc_auc', n_jobs=-1)
    print(f"CV ROC-AUC: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

    metrics = {
        'roc_auc': round(float(roc), 4),
        'pr_auc': round(float(pr), 4),
        'f1_score': round(float(f1), 4),
        'precision': round(float(prec), 4),
        'recall': round(float(rec), 4),
        'cv_roc_auc_mean': round(float(cv_scores.mean()), 4),
        'cv_roc_auc_std': round(float(cv_scores.std()), 4),
        'confusion_matrix': cm.tolist(),
        'best_threshold': round(float(best_thresh), 2),
        'training_samples': int(len(y_train)),
        'test_samples': int(len(y_test)),
        'fraud_ratio': round(float(y_train.mean()), 4),
        'n_features': len(GOLDEN_FEATURES),
        'golden_features': GOLDEN_FEATURES,
    }

    return model, metrics


def train_isolation_forest(X_train, y_train):
    fraud_ratio = y_train.mean()
    model = IsolationForest(
        n_estimators=200,
        contamination=float(fraud_ratio * 2),
        max_samples='auto',
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train)
    n_anomalies = (model.predict(X_train) == -1).sum()
    print(f"Isolation Forest: {n_anomalies} anomalies detected in training data")
    return model


def export_models(xgb_model, iso_model, metrics, mappings, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    n_features = len(GOLDEN_FEATURES)

    print("\nExporting XGBoost to ONNX...")
    onnx_xgb = convert_xgboost(
        xgb_model,
        initial_types=[('float_input', OnnxFloatTensorType([None, n_features]))],
        target_opset=12
    )
    xgb_path = os.path.join(output_dir, 'xgboost_fraud.onnx')
    with open(xgb_path, 'wb') as f:
        f.write(onnx_xgb.SerializeToString())
    print(f"Saved: {xgb_path}")

    print("Exporting Isolation Forest to ONNX...")
    onnx_iso = convert_sklearn(
        iso_model,
        initial_types=[('float_input', FloatTensorType([None, n_features]))],
        target_opset={'': 12, 'ai.onnx.ml': 3}
    )
    iso_path = os.path.join(output_dir, 'isolation_forest.onnx')
    with open(iso_path, 'wb') as f:
        f.write(onnx_iso.SerializeToString())
    print(f"Saved: {iso_path}")

    feature_config = {
        'feature_names': GOLDEN_FEATURES,
        'feature_count': n_features,
        'mappings': mappings,
        'feature_importance': {
            name: round(float(imp), 6)
            for name, imp in zip(GOLDEN_FEATURES, xgb_model.feature_importances_)
        },
        'thresholds': {
            'high_risk': metrics['best_threshold'],
            'medium_risk': round(metrics['best_threshold'] * 0.6, 2),
            'anomaly': -0.05,
        },
        'top_50_features': GOLDEN_FEATURES,
    }

    config_path = os.path.join(output_dir, 'feature_config.json')
    with open(config_path, 'w') as f:
        json.dump(feature_config, f, indent=2)

    metrics_path = os.path.join(output_dir, 'training_metrics.json')
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f"\nAll files saved to: {output_dir}")


if __name__ == '__main__':
    print("=" * 55)
    print("  Anviksha — XGBoost Training (18 BOI Golden Features)")
    print("=" * 55)

    script_dir = Path(__file__).parent
    output_dir = script_dir / 'models'
    dataset_path = script_dir / 'DataSet.csv'

    X, y, mappings = load_data(str(dataset_path))

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Train: {len(y_train)} | Test: {len(y_test)}")

    print("\nTraining XGBoost...")
    xgb_model, metrics = train_xgboost(X_train, X_test, y_train, y_test)

    print("\nTraining Isolation Forest...")
    iso_model = train_isolation_forest(X_train, y_train)

    print("\nExporting models...")
    export_models(xgb_model, iso_model, metrics, mappings, str(output_dir))

    print("\n" + "=" * 55)
    print("  Done! Restart the server to use the new models.")
    print("=" * 55)
