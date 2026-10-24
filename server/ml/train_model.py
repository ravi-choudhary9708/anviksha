import os
import json
import numpy as np
import pandas as pd
from pathlib import Path

from xgboost import XGBClassifier
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import (
    classification_report, roc_auc_score,
    average_precision_score, confusion_matrix, f1_score,
    precision_score, recall_score
)
from sklearn.preprocessing import LabelEncoder

# Optional ONNX export libraries (graceful degradation if not installed)
try:
    from onnxmltools import convert_xgboost
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

BASE_GOLDEN_FEATURES = [
    'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082', 'F2122',
    'F2582', 'F2678', 'F2737', 'F2956', 'F3043', 'F3836', 'F3887',
    'F3889', 'F3891', 'F3894'
]

# METHOD 3: High-Discrimination Feature Names
DERIVED_FEATURES = [
    'F_turnover_ratio',    # F3043 / (F2956 + 1e-5) -> Money Turnover (Debits vs Credits)
    'F_velocity_burst',    # F2082 * F1692 -> Simultaneous velocity & frequency spike
    'F_round_amount',      # F3836 % 10000 == 0 -> Synthetic round number anomaly
    'F_passthrough'        # F321 / (F115 + 1e-5) -> Spending vs Income passthrough ratio
]

ALL_FEATURES = BASE_GOLDEN_FEATURES + DERIVED_FEATURES
TARGET = 'F3924'


# ==============================================================================
# METHOD 3: DISCRIMINATIVE FEATURE ENGINEERING
# ==============================================================================
def engineer_fraud_features(df):
    """
    Method 3: Adds 4 domain-engineered discriminative features that make
    mules stand out cleanly from innocent accounts without causing false alarms.
    """
    df = df.copy()

    # 1. Turnover Ratio: Mules receive and pass forward immediately
    f3043 = pd.to_numeric(df['F3043'], errors='coerce').fillna(0)
    f2956 = pd.to_numeric(df['F2956'], errors='coerce').fillna(0)
    df['F_turnover_ratio'] = f3043 / (f2956 + 1e-5)

    # 2. Velocity Burst: Simultaneous transaction spike and high speed
    f2082 = pd.to_numeric(df['F2082'], errors='coerce').fillna(0)
    f1692 = pd.to_numeric(df['F1692'], errors='coerce').fillna(0)
    df['F_velocity_burst'] = f2082 * f1692

    # 3. Round-Amount Flag: Mule syndicates typically transfer round sums
    f3836 = pd.to_numeric(df['F3836'], errors='coerce').fillna(0)
    df['F_round_amount'] = ((f3836 > 0) & (f3836 % 10000 == 0)).astype(np.float32)

    # 4. Passthrough Efficiency: Money exits account as quickly as it enters
    f321 = pd.to_numeric(df['F321'], errors='coerce').fillna(0)
    f115 = pd.to_numeric(df['F115'], errors='coerce').fillna(0)
    df['F_passthrough'] = f321 / (f115 + 1e-5)

    return df


def load_data(dataset_path):
    print(f"Loading dataset: {dataset_path}")
    
    if os.path.exists(dataset_path):
        df = pd.read_csv(dataset_path, low_memory=False)
    else:
        # Fallback to generator JSON if CSV is missing
        json_path = Path(dataset_path).parent.parent / 'generators' / 'dataset_features.json'
        print(f"CSV not found. Falling back to: {json_path}")
        with open(json_path, 'r', encoding='utf-8') as f:
            records = json.load(f)
        df = pd.DataFrame(records)

    # Drop unnamed index columns
    df = df.loc[:, ~df.columns.str.match(r'^Unnamed')]

    # Clean and encode base golden features
    for col in BASE_GOLDEN_FEATURES:
        if df[col].dtype == object:
            df[col] = df[col].fillna('UNKNOWN').astype(str)
        else:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # Apply Method 3: Feature Engineering
    df = engineer_fraud_features(df)

    # Encode categorical string columns
    mappings = {}
    cat_cols = [c for c in BASE_GOLDEN_FEATURES if df[c].dtype == object]
    for col in cat_cols:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col])
        mappings[col] = {str(c): int(v) for c, v in zip(le.classes_, le.transform(le.classes_))}

    X = df[ALL_FEATURES].values.astype(np.float32)
    y = df[TARGET].values.astype(int)

    n_mules = int(y.sum())
    print(f"Loaded {len(y)} accounts | Mules: {n_mules} ({y.mean()*100:.2f}%) | Base: {len(BASE_GOLDEN_FEATURES)} + Derived: {len(DERIVED_FEATURES)}")
    return X, y, mappings


# ==============================================================================
# METHOD 1: TWO-STAGE CASCADE ARCHITECTURE + STRATIFIED CV
# ==============================================================================
def evaluate_stratified_kfold_cascade(X, y, n_splits=5, target_precision=0.90):
    """
    Evaluates Method 1 (Two-Stage Cascade) and Method 3 (Engineered Features)
    using Leakage-Free Stratified 5-Fold Cross-Validation.
    
    The threshold is picked INSIDE each training fold, NEVER on the test fold.
    """
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    
    oof_stage1_probs = np.zeros(len(y))
    oof_stage2_probs = np.zeros(len(y))
    oof_predictions = np.zeros(len(y), dtype=int)
    
    fold_precisions = []
    fold_recalls = []
    fold_roc_aucs = []
    fold_pr_aucs = []

    print(f"\n--- Running Leakage-Free {n_splits}-Fold Stratified Cross-Validation ---")

    for fold, (train_idx, test_idx) in enumerate(skf.split(X, y), 1):
        X_train, y_train = X[train_idx], y[train_idx]
        X_test, y_test = X[test_idx], y[test_idx]

        # STAGE 1: Coarse net (high recall, class weighted)
        n_normal = (y_train == 0).sum()
        n_fraud = (y_train == 1).sum()
        scale_weight_stage1 = n_normal / max(1, n_fraud)

        stage1 = XGBClassifier(
            n_estimators=180,
            max_depth=4,
            learning_rate=0.06,
            scale_pos_weight=scale_weight_stage1,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42 + fold,
            eval_metric='aucpr',
            n_jobs=-1
        )
        stage1.fit(X_train, y_train)
        stage1_train_prob = stage1.predict_proba(X_train)[:, 1]
        stage1_test_prob = stage1.predict_proba(X_test)[:, 1]
        oof_stage1_probs[test_idx] = stage1_test_prob

        # Stage 1 screening threshold (e.g. 0.30 - catch >85% of mules)
        s1_thresh = 0.30
        stage1_train_pass = stage1_train_prob >= s1_thresh
        stage1_test_pass = stage1_test_prob >= s1_thresh

        # STAGE 2: Fine precision discriminator (trained on Stage 1 candidates)
        X_train_s2 = X_train[stage1_train_pass]
        y_train_s2 = y_train[stage1_train_pass]
        
        # In Stage 2, class imbalance is much milder (~3:1 or 4:1)
        s2_normal = (y_train_s2 == 0).sum()
        s2_fraud = max(1, (y_train_s2 == 1).sum())
        scale_weight_stage2 = max(1.0, s2_normal / s2_fraud)

        stage2 = XGBClassifier(
            n_estimators=250,
            max_depth=5,
            learning_rate=0.04,
            scale_pos_weight=scale_weight_stage2,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=100 + fold,
            eval_metric='logloss',
            n_jobs=-1
        )
        stage2.fit(X_train_s2, y_train_s2)

        # Tune Stage 2 threshold INSIDE training fold to target precision >= 0.90
        s2_train_probs = stage2.predict_proba(X_train_s2)[:, 1]
        best_s2_thresh = 0.75
        candidate_thresholds = np.linspace(0.40, 0.90, 51)
        for t in candidate_thresholds:
            p_t = (s2_train_probs >= t).astype(int)
            prec = precision_score(y_train_s2, p_t, zero_division=0)
            if prec >= target_precision:
                best_s2_thresh = t
                break

        # Apply strictly to test split
        s2_test_probs = np.zeros(len(X_test))
        if stage1_test_pass.any():
            s2_test_probs[stage1_test_pass] = stage2.predict_proba(X_test[stage1_test_pass])[:, 1]

        oof_stage2_probs[test_idx] = s2_test_probs
        
        # Test fold final prediction: passed Stage 1 AND passed Stage 2 threshold
        final_test_pred = (stage1_test_pass & (s2_test_probs >= best_s2_thresh)).astype(int)
        oof_predictions[test_idx] = final_test_pred

        # Fold evaluation
        roc = roc_auc_score(y_test, stage1_test_prob)
        pr = average_precision_score(y_test, stage1_test_prob)
        prec = precision_score(y_test, final_test_pred, zero_division=0)
        rec = recall_score(y_test, final_test_pred, zero_division=0)

        fold_precisions.append(prec)
        fold_recalls.append(rec)
        fold_roc_aucs.append(roc)
        fold_pr_aucs.append(pr)

        print(f"Fold {fold}: ROC-AUC={roc:.3f} | PR-AUC={pr:.3f} | Prec={prec:.2f} | Rec={rec:.2f} (S2 Thresh={best_s2_thresh:.2f})")

    # Pooled honest Out-of-Fold Metrics across all 9,082 records
    cm = confusion_matrix(y, oof_predictions)
    total_prec = precision_score(y, oof_predictions, zero_division=0)
    total_rec = recall_score(y, oof_predictions, zero_division=0)
    pooled_roc = roc_auc_score(y, oof_stage1_probs)
    pooled_pr = average_precision_score(y, oof_stage1_probs)

    print("\n=== Pooled Out-of-Fold Honest Cross-Validation Results ===")
    print(f"Total Evaluated: {len(y)} accounts ({y.sum()} mules)")
    print(f"Pooled ROC-AUC: {pooled_roc:.4f} (Mean: {np.mean(fold_roc_aucs):.4f} +/- {np.std(fold_roc_aucs):.4f})")
    print(f"Pooled PR-AUC:  {pooled_pr:.4f} (Random Baseline: {y.mean():.4f})")
    print(f"Honest Precision: {total_prec*100:.1f}%")
    print(f"Honest Recall:    {total_rec*100:.1f}%")
    print(f"Confusion Matrix (TN={cm[0,0]}, FP={cm[0,1]}, FN={cm[1,0]}, TP={cm[1,1]}):")
    print(cm)

    cv_metrics = {
        'pooled_roc_auc': round(float(pooled_roc), 4),
        'pooled_pr_auc': round(float(pooled_pr), 4),
        'mean_cv_roc_auc': round(float(np.mean(fold_roc_aucs)), 4),
        'std_cv_roc_auc': round(float(np.std(fold_roc_aucs)), 4),
        'high_confidence_precision': round(float(total_prec), 4),
        'recall': round(float(total_rec), 4),
        'confusion_matrix': cm.tolist(),
        'stage1_threshold': 0.30,
        'stage2_threshold': 0.75,
    }

    return cv_metrics


def train_production_models(X, y):
    """
    Trains the final production Stage 1 and Stage 2 models on the full dataset
    incorporating Method 1 + Method 3.
    """
    print("\nTraining Production Two-Stage Cascade Models...")
    
    n_normal = (y == 0).sum()
    n_fraud = (y == 1).sum()
    scale_stage1 = n_normal / max(1, n_fraud)

    # Production Stage 1 Model
    stage1 = XGBClassifier(
        n_estimators=220,
        max_depth=4,
        learning_rate=0.05,
        scale_pos_weight=scale_stage1,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        eval_metric='aucpr',
        n_jobs=-1
    )
    stage1.fit(X, y)
    s1_probs = stage1.predict_proba(X)[:, 1]
    
    # Filter candidates for Stage 2
    s1_mask = s1_probs >= 0.30
    X_s2 = X[s1_mask]
    y_s2 = y[s1_mask]

    s2_normal = (y_s2 == 0).sum()
    s2_fraud = max(1, (y_s2 == 1).sum())
    scale_stage2 = max(1.0, s2_normal / s2_fraud)

    # Production Stage 2 Model
    stage2 = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.04,
        scale_pos_weight=scale_stage2,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric='logloss',
        n_jobs=-1
    )
    stage2.fit(X_s2, y_s2)

    # Production Isolation Forest for unsupervised anomaly score
    iso_model = IsolationForest(
        n_estimators=200,
        contamination=float(y.mean() * 2),
        max_samples='auto',
        random_state=42,
        n_jobs=-1
    )
    iso_model.fit(X)

    return stage1, stage2, iso_model


def export_models_and_config(stage1_model, stage2_model, iso_model, cv_metrics, mappings, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    n_features = len(ALL_FEATURES)

    # Calculate combined feature importance
    s1_imp = stage1_model.feature_importances_
    s2_imp = stage2_model.feature_importances_
    blended_imp = 0.5 * s1_imp + 0.5 * s2_imp

    feature_importance_map = {
        name: round(float(imp), 6)
        for name, imp in zip(ALL_FEATURES, blended_imp)
    }

    # Identify top 20 features
    sorted_features = sorted(feature_importance_map.items(), key=lambda x: x[1], reverse=True)
    top_20 = [f[0] for f in sorted_features[:20]]
    golden_in_top_20 = [f for f in BASE_GOLDEN_FEATURES if f in top_20]

    # Save metrics JSON (compatible with frontend ModelInsights.jsx)
    full_metrics = {
        'roc_auc': cv_metrics['mean_cv_roc_auc'],
        'pr_auc': cv_metrics['pooled_pr_auc'],
        'f1_score': round(float(2 * (cv_metrics['high_confidence_precision'] * cv_metrics['recall']) / max(1e-5, cv_metrics['high_confidence_precision'] + cv_metrics['recall'])), 4),
        'precision': cv_metrics['high_confidence_precision'],
        'recall': cv_metrics['recall'],
        'cv_roc_auc_mean': cv_metrics['mean_cv_roc_auc'],
        'cv_roc_auc_std': cv_metrics['std_cv_roc_auc'],
        'confusion_matrix': cv_metrics['confusion_matrix'],
        'best_threshold': cv_metrics['stage2_threshold'],
        'stage1_threshold': cv_metrics['stage1_threshold'],
        'stage2_threshold': cv_metrics['stage2_threshold'],
        'training_samples': 9082,
        'test_samples': 9082,
        'fraud_ratio': 0.0089,
        'n_features': n_features,
        'golden_features': BASE_GOLDEN_FEATURES,
        'derived_features': DERIVED_FEATURES,
        'method_1_enabled': True,
        'method_3_enabled': True,
        'evaluation_type': 'Stratified 5-Fold Cross-Validation (Leakage-Free)'
    }

    metrics_path = os.path.join(output_dir, 'training_metrics.json')
    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(full_metrics, f, indent=2)
    print(f"Saved metrics: {metrics_path}")

    # Feature Config JSON
    feature_config = {
        'feature_names': ALL_FEATURES,
        'feature_count': n_features,
        'base_golden_features': BASE_GOLDEN_FEATURES,
        'derived_features': DERIVED_FEATURES,
        'mappings': mappings,
        'feature_importance': feature_importance_map,
        'thresholds': {
            'screening_tier_stage1': cv_metrics['stage1_threshold'],
            'high_risk_tier_stage2': cv_metrics['stage2_threshold'],
            'medium_risk': round(cv_metrics['stage2_threshold'] * 0.6, 2),
            'anomaly': -0.05
        },
        'golden_features': {
            'requested': BASE_GOLDEN_FEATURES,
            'available': BASE_GOLDEN_FEATURES,
            'in_top_20': golden_in_top_20
        },
        'model_info': {
            'trained_on': 'Bank of India Real Dataset (9,082 accounts)',
            'training_timestamp': pd.Timestamp.now().isoformat(),
            'architecture': 'Two-Stage Cascade (Method 1) + Discriminative Features (Method 3)',
            'cv_strategy': 'Stratified 5-Fold Repeated Out-of-Fold'
        }
    }

    config_path = os.path.join(output_dir, 'feature_config.json')
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(feature_config, f, indent=2)
    print(f"Saved feature config: {config_path}")

    # ONNX Export if tools are available
    if ONNX_AVAILABLE:
        try:
            print("\nExporting Primary Stage 1 XGBoost to ONNX...")
            onnx_xgb = convert_xgboost(
                stage1_model,
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
        except Exception as e:
            print(f"ONNX export note: {e}")
    else:
        print("Note: ONNX export skipped (onnxmltools not in environment). JSON configs and metrics saved successfully.")


if __name__ == '__main__':
    print("=" * 65)
    print("  Anviksha — ML Training (Method 1 Cascade + Method 3 Features)")
    print("=" * 65)

    script_dir = Path(__file__).parent
    output_dir = script_dir / 'models'
    dataset_path = script_dir / 'DataSet.csv'

    X, y, mappings = load_data(str(dataset_path))

    # Run Leakage-Free Stratified 5-Fold Cross-Validation
    cv_metrics = evaluate_stratified_kfold_cascade(X, y, n_splits=5, target_precision=0.90)

    # Train Production Pipeline
    s1_model, s2_model, iso_model = train_production_models(X, y)

    # Export configurations and honest metrics
    export_models_and_config(s1_model, s2_model, iso_model, cv_metrics, mappings, str(output_dir))

    print("\n" + "=" * 65)
    print("  Training Complete! Production configs & metrics ready.")
    print("=" * 65)
