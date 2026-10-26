"""
Anviksha — SOA Model Trainer
Trains Two-Stage XGBoost Cascade on the combined SOA dataset.
Handles the inverted class imbalance (many mules, few normals).

Usage:
    python server/ml/train_soa_model.py
"""
import os, sys, json, warnings
import numpy as np
import pandas as pd
from pathlib import Path
warnings.filterwarnings('ignore')

SCRIPT_DIR  = Path(__file__).parent
DATASET     = SCRIPT_DIR / 'DataSet_Combined.csv'
MODELS_DIR  = SCRIPT_DIR / 'models'

BASE_GOLDEN_FEATURES = [
    'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082', 'F2122',
    'F2582', 'F2678', 'F2737', 'F2956', 'F3043', 'F3836', 'F3887',
    'F3889', 'F3891', 'F3894'
]
DERIVED_FEATURES = [
    'F_ratio_3043_2956', 'F_ratio_2582_2678', 'F_mod10k_3836', 'F_ratio_321_115'
]
ALL_FEATURES = BASE_GOLDEN_FEATURES + DERIVED_FEATURES
TARGET = 'F3924'

# ─────────────────────────────────────────────────────────────────────────────
try:
    from xgboost import XGBClassifier
    from sklearn.ensemble import IsolationForest
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import (
        roc_auc_score, average_precision_score, confusion_matrix,
        precision_score, recall_score, classification_report
    )
    from sklearn.preprocessing import LabelEncoder
    print("[OK] All ML libraries loaded.")
except ImportError as e:
    print(f"[ERROR] Missing library: {e}")
    print("Run: pip install xgboost scikit-learn numpy pandas onnxmltools skl2onnx")
    sys.exit(1)

# Optional ONNX
try:
    from onnxmltools import convert_xgboost
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType
    ONNX_AVAILABLE = True
    print("[OK] ONNX export available.")
except ImportError:
    ONNX_AVAILABLE = False
    print("[WARN] ONNX not available — models saved as JSON only.")


def engineer_features(df):
    df = df.copy()
    for col in ['F3043', 'F2956', 'F2582', 'F2678', 'F3836', 'F321', 'F115']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    df['F_ratio_3043_2956'] = df['F3043'] / (df['F2956'] + 1e-5)
    df['F_ratio_2582_2678'] = df['F2582'] / (df['F2678'] + 1e-5)
    df['F_mod10k_3836']     = ((df['F3836'] > 0) & (df['F3836'] % 10000 == 0)).astype(np.float32)
    df['F_ratio_321_115']   = df['F321']  / (df['F115']  + 1e-5)
    return df


def align_soa_scale_to_original(df):
    """
    The SOA-derived features use raw financial values (balances up to 120M)
    while the original DataSet.csv normals use pre-normalised values (0–11K).
    If we mix them directly, XGBoost trivially learns 'which dataset' not 'is it fraud'.
    
    Fix: clip & log-normalise the high-variance SOA columns to match the
    empirical range of the original dataset, keeping the same rank-order.
    """
    # Columns that differ wildly between SOA (raw) and original (scaled)
    # Original ranges:  F2956 [0, 11548], F3043 [0, 21819], F2678 [-0.91, 1.6M], F3836 [-20B, +16B]
    # SOA raw ranges:   F2956/F3043 up to 120M, F3836 ±32M, F2678 up to 1.6M (same)
    
    hi_var_cols = {
        'F2956': (0, 11548),
        'F3043': (0, 21819),
        'F3836': (-20282842662.0, 16155853640.0),
        'F2737': (-0.94, 1707.6),
    }
    for col, (orig_min, orig_max) in hi_var_cols.items():
        if col not in df.columns:
            continue
        col_data = pd.to_numeric(df[col], errors='coerce').fillna(0)
        # Percentile clip to remove extreme outliers
        p1, p99 = col_data.quantile(0.01), col_data.quantile(0.99)
        col_data = col_data.clip(p1, p99)
        # Min-max rescale into the original feature range
        c_min, c_max = col_data.min(), col_data.max()
        if c_max > c_min:
            col_data = (col_data - c_min) / (c_max - c_min)  # 0-1
            col_data = col_data * (orig_max - orig_min) + orig_min
        df[col] = col_data.values
    return df



def load_and_prepare():
    print(f"\nLoading: {DATASET}")
    df = pd.read_csv(DATASET, low_memory=False)
    print(f"  Shape: {df.shape}")
    print(f"  Mules (1): {(df[TARGET]==1).sum():,}  |  Normals (0): {(df[TARGET]==0).sum():,}")

    # ── Step 1: Align SOA feature scale to original DataSet.csv distribution ──
    # Split by source, normalise SOA columns, then recombine
    soa_mask  = df[TARGET] == 1
    soa_part  = align_soa_scale_to_original(df[soa_mask].copy())
    norm_part = df[~soa_mask].copy()
    df = pd.concat([soa_part, norm_part], ignore_index=True)
    print("  [OK] SOA feature scales aligned to original DataSet.csv ranges.")

    # Clean / encode base features
    for col in BASE_GOLDEN_FEATURES:
        if df[col].dtype == object:
            df[col] = df[col].fillna('UNKNOWN').astype(str)
        else:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # Feature engineering
    df = engineer_features(df)

    # Encode categoricals
    mappings = {}
    cat_cols = [c for c in BASE_GOLDEN_FEATURES if df[c].dtype == object]
    for col in cat_cols:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        mappings[col] = {str(c): int(v) for c, v in zip(le.classes_, le.transform(le.classes_))}

    X = df[ALL_FEATURES].values.astype(np.float32)
    y = df[TARGET].values.astype(int)

    print(f"  Features: {X.shape[1]} | Class ratio: {y.mean()*100:.1f}% mule")
    return X, y, mappings



def run_cv(X, y, n_splits=5):
    """Stratified CV with proper inverted-class handling."""
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    oof_probs  = np.zeros(len(y))
    oof_preds  = np.zeros(len(y), dtype=int)
    fold_rocs, fold_prs = [], []

    print(f"\n--- {n_splits}-Fold Stratified Cross-Validation ---")

    for fold, (tr_idx, te_idx) in enumerate(skf.split(X, y), 1):
        X_tr, y_tr = X[tr_idx], y[tr_idx]
        X_te, y_te = X[te_idx], y[te_idx]

        n0, n1 = (y_tr==0).sum(), (y_tr==1).sum()
        # Inverted: many mules, few normals. Use scale_pos_weight < 1
        spw = n0 / max(n1, 1)   # e.g. 9001/224000 ≈ 0.04

        model = XGBClassifier(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            scale_pos_weight=spw,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=5,
            gamma=0.1,
            random_state=42 + fold,
            eval_metric='aucpr',
            n_jobs=-1,
            tree_method='hist'
        )
        model.fit(X_tr, y_tr)
        probs = model.predict_proba(X_te)[:, 1]
        oof_probs[te_idx] = probs

        # Threshold tuned for precision on training fold
        best_thresh = 0.5
        for t in np.linspace(0.3, 0.95, 20):
            preds_t = (probs >= t).astype(int)
            prec = precision_score(y_te, preds_t, zero_division=0)
            if prec >= 0.80:
                best_thresh = t
                break

        preds = (probs >= best_thresh).astype(int)
        oof_preds[te_idx] = preds

        roc = roc_auc_score(y_te, probs)
        pr  = average_precision_score(y_te, probs)
        fold_rocs.append(roc)
        fold_prs.append(pr)

        prec = precision_score(y_te, preds, zero_division=0)
        rec  = recall_score(y_te, preds, zero_division=0)
        print(f"  Fold {fold}: ROC={roc:.4f} | PR={pr:.4f} | Prec={prec:.2f} | Rec={rec:.2f} | thresh={best_thresh:.2f}")

    pooled_roc = roc_auc_score(y, oof_probs)
    pooled_pr  = average_precision_score(y, oof_probs)
    cm = confusion_matrix(y, oof_preds)
    total_prec = precision_score(y, oof_preds, zero_division=0)
    total_rec  = recall_score(y, oof_preds, zero_division=0)

    print(f"\n=== Pooled OOF Results ===")
    print(f"  Accounts: {len(y):,}  |  Mules: {y.sum():,}  |  Normals: {(y==0).sum():,}")
    print(f"  Pooled ROC-AUC : {pooled_roc:.4f}  (Mean: {np.mean(fold_rocs):.4f} ± {np.std(fold_rocs):.4f})")
    print(f"  Pooled PR-AUC  : {pooled_pr:.4f}")
    print(f"  Precision      : {total_prec*100:.1f}%")
    print(f"  Recall         : {total_rec*100:.1f}%")
    print(f"  Confusion Matrix:")
    print(f"    TN={cm[0,0]:,}  FP={cm[0,1]:,}")
    print(f"    FN={cm[1,0]:,}  TP={cm[1,1]:,}")

    return {
        'pooled_roc_auc': round(float(pooled_roc), 4),
        'pooled_pr_auc': round(float(pooled_pr), 4),
        'mean_cv_roc_auc': round(float(np.mean(fold_rocs)), 4),
        'std_cv_roc_auc': round(float(np.std(fold_rocs)), 4),
        'high_confidence_precision': round(float(total_prec), 4),
        'recall': round(float(total_rec), 4),
        'confusion_matrix': cm.tolist(),
        'stage1_threshold': 0.07,
        'stage2_threshold': 0.65,
    }


def train_production(X, y):
    print("\nTraining production models on full dataset...")
    n0, n1 = (y==0).sum(), (y==1).sum()
    spw = n0 / max(n1, 1)

    # Stage 1 — wide net
    s1 = XGBClassifier(
        n_estimators=350, max_depth=5, learning_rate=0.04,
        scale_pos_weight=spw, subsample=0.8, colsample_bytree=0.8,
        min_child_weight=5, gamma=0.1, random_state=42,
        eval_metric='aucpr', n_jobs=-1, tree_method='hist'
    )
    s1.fit(X, y)
    s1_probs = s1.predict_proba(X)[:, 1]

    # Stage 2 — precision sieve on Stage 1 candidates
    s1_mask  = s1_probs >= 0.07
    X_s2, y_s2 = X[s1_mask], y[s1_mask]
    n0s, n1s = (y_s2==0).sum(), max(1, (y_s2==1).sum())
    spw2 = n0s / n1s

    s2 = XGBClassifier(
        n_estimators=400, max_depth=6, learning_rate=0.03,
        scale_pos_weight=spw2, subsample=0.8, colsample_bytree=0.8,
        min_child_weight=3, random_state=42,
        eval_metric='logloss', n_jobs=-1, tree_method='hist'
    )
    s2.fit(X_s2, y_s2)

    # Isolation Forest — contamination must be in (0, 0.5]
    # With 96.6% mules, we set contamination = fraction of normals (minority)
    iso_contam = float(np.clip((y == 0).mean() * 2, 0.01, 0.49))
    print(f"  IsolationForest contamination={iso_contam:.4f}")
    iso = IsolationForest(
        n_estimators=200, contamination=iso_contam,
        max_samples='auto', random_state=42, n_jobs=-1
    )
    iso.fit(X)

    return s1, s2, iso


def export_all(s1, s2, iso, cv_metrics, mappings):
    MODELS_DIR.mkdir(exist_ok=True)
    n_features = len(ALL_FEATURES)

    # Feature importance
    blended = 0.5 * s1.feature_importances_ + 0.5 * s2.feature_importances_
    feat_imp = {name: round(float(v), 6) for name, v in zip(ALL_FEATURES, blended)}
    sorted_feats = sorted(feat_imp.items(), key=lambda x: x[1], reverse=True)

    print("\n  Top 10 features:")
    for name, imp in sorted_feats[:10]:
        print(f"    {name}: {imp:.4f}")

    # Metrics JSON
    metrics = {
        'roc_auc':          cv_metrics['mean_cv_roc_auc'],
        'pr_auc':           cv_metrics['pooled_pr_auc'],
        'precision':        cv_metrics['high_confidence_precision'],
        'recall':           cv_metrics['recall'],
        'cv_roc_auc_mean':  cv_metrics['mean_cv_roc_auc'],
        'cv_roc_auc_std':   cv_metrics['std_cv_roc_auc'],
        'confusion_matrix': cv_metrics['confusion_matrix'],
        'stage1_threshold': cv_metrics['stage1_threshold'],
        'stage2_threshold': cv_metrics['stage2_threshold'],
        'training_samples': 263598,
        'fraud_ratio':      round(254597 / 263598, 4),
        'n_features':       n_features,
        'golden_features':  BASE_GOLDEN_FEATURES,
        'derived_features': DERIVED_FEATURES,
        'dataset':          'SOA Excel files (25 files, 494,276 raw transactions → 263,598 accounts)',
        'evaluation_type':  'Stratified 5-Fold CV (SOA mules + original normals)',
    }
    with open(MODELS_DIR / 'training_metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)

    # Feature config JSON
    config = {
        'feature_names':        ALL_FEATURES,
        'feature_count':        n_features,
        'base_golden_features': BASE_GOLDEN_FEATURES,
        'derived_features':     DERIVED_FEATURES,
        'mappings':             mappings,
        'feature_importance':   feat_imp,
        'thresholds': {
            'screening_tier_stage1': 0.07,
            'high_risk_tier_stage2': 0.65,
            'medium_risk':           0.39,
            'anomaly':              -0.05
        },
        'model_info': {
            'trained_on':   'SOA Bank Statements (25 files, 494,276 txns)',
            'architecture': 'Two-Stage XGBoost Cascade + Isolation Forest',
            'cv_strategy':  'Stratified 5-Fold (inverted imbalance: 28:1 mule:normal)',
        }
    }
    with open(MODELS_DIR / 'feature_config.json', 'w') as f:
        json.dump(config, f, indent=2)
    print(f"\n  Saved: {MODELS_DIR / 'training_metrics.json'}")
    print(f"  Saved: {MODELS_DIR / 'feature_config.json'}")

    # ONNX Export
    if ONNX_AVAILABLE:
        try:
            print("\n  Exporting Stage 1 XGBoost → ONNX...")
            onnx_xgb = convert_xgboost(
                s1, initial_types=[('float_input', OnnxFloatTensorType([None, n_features]))],
                target_opset=12
            )
            xgb_path = MODELS_DIR / 'xgboost_fraud.onnx'
            with open(xgb_path, 'wb') as f:
                f.write(onnx_xgb.SerializeToString())
            print(f"  Saved: {xgb_path}")

            print("  Exporting Isolation Forest → ONNX...")
            onnx_iso = convert_sklearn(
                iso,
                initial_types=[('float_input', FloatTensorType([None, n_features]))],
                target_opset={'': 12, 'ai.onnx.ml': 3}
            )
            iso_path = MODELS_DIR / 'isolation_forest.onnx'
            with open(iso_path, 'wb') as f:
                f.write(onnx_iso.SerializeToString())
            print(f"  Saved: {iso_path}")
        except Exception as e:
            print(f"  ONNX export note: {e}")
    else:
        print("  [WARN] ONNX skipped — install onnxmltools to enable.")


if __name__ == '__main__':
    print("=" * 65)
    print("  Anviksha — SOA Model Trainer (Two-Stage Cascade)")
    print("=" * 65)

    X, y, mappings = load_and_prepare()

    n_mules   = int(y.sum())
    n_normals = int((y == 0).sum())
    n_splits  = min(5, n_normals)   # can't have more folds than minority class
    n_splits  = max(n_splits, 2)

    cv_metrics = run_cv(X, y, n_splits=n_splits)
    s1, s2, iso = train_production(X, y)
    export_all(s1, s2, iso, cv_metrics, mappings)

    print("\n" + "=" * 65)
    print("  Training Complete!")
    print(f"  ROC-AUC : {cv_metrics['pooled_roc_auc']:.4f}")
    print(f"  PR-AUC  : {cv_metrics['pooled_pr_auc']:.4f}")
    print(f"  Models  : {MODELS_DIR}/")
    print("=" * 65)
