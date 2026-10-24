"""
Anviksha — IEEE-CIS Fraud Detection Pipeline
Trains a high-performance Gradient Boosting Classifier on public/train_transaction.csv,
evaluates validation metrics (ROC-AUC, Precision, Recall, Confusion Matrix),
and generates fraud predictions for public/test_transaction.csv.
"""

import os
import sys
import json
import time
import gc
import numpy as np
import pandas as pd

print("=" * 60)
print("  Anviksha — Processing IEEE-CIS Fraud Dataset (public/)")
print("=" * 60)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

TRAIN_PATH = os.path.join(PUBLIC_DIR, 'train_transaction.csv')
TEST_PATH = os.path.join(PUBLIC_DIR, 'test_transaction.csv')
SUB_SAMPLE_PATH = os.path.join(PUBLIC_DIR, 'sample_submission.csv')
OUTPUT_PRED_PATH = os.path.join(PUBLIC_DIR, 'submission_result.csv')
OUTPUT_METRICS_PATH = os.path.join(PUBLIC_DIR, 'model_results.json')

# Key features selected for high predictive value and memory efficiency
CATEGORICAL_COLS = [
    'ProductCD', 'card4', 'card6', 'P_emaildomain', 'R_emaildomain',
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'
]

NUMERICAL_COLS = [
    'TransactionAmt', 'card1', 'card2', 'card3', 'card5',
    'addr1', 'addr2', 'dist1',
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14',
    'D1', 'D2', 'D3', 'D4', 'D10', 'D11', 'D15',
    'V12', 'V13', 'V29', 'V30', 'V35', 'V36', 'V37', 'V38', 'V44', 'V45',
    'V53', 'V54', 'V75', 'V76', 'V82', 'V83', 'V90', 'V91',
    'V127', 'V128', 'V130', 'V131', 'V279', 'V280', 'V281', 'V282', 'V283',
    'V285', 'V307', 'V308', 'V310', 'V317'
]

ALL_FEATURE_COLS = CATEGORICAL_COLS + NUMERICAL_COLS

def reduce_mem_usage(df):
    """Downcast float64 and int64 to save RAM on large datasets."""
    for col in df.columns:
        col_type = df[col].dtype
        if col_type != object and not pd.api.types.is_categorical_dtype(df[col]):
            c_min = df[col].min()
            c_max = df[col].max()
            if str(col_type)[:3] == 'int':
                if c_min > np.iinfo(np.int16).min and c_max < np.iinfo(np.int16).max:
                    df[col] = df[col].astype(np.int16)
                elif c_min > np.iinfo(np.int32).min and c_max < np.iinfo(np.int32).max:
                    df[col] = df[col].astype(np.int32)
            else:
                if c_min > np.finfo(np.float32).min and c_max < np.finfo(np.float32).max:
                    df[col] = df[col].astype(np.float32)
    return df

def main():
    start_time = time.time()

    print(f"\n[1/5] Loading training data from {TRAIN_PATH}...")
    load_cols = ['TransactionID', 'isFraud'] + ALL_FEATURE_COLS
    
    # Read training dataset
    train_df = pd.read_csv(TRAIN_PATH, usecols=load_cols)
    print(f"       Loaded {len(train_df):,} rows and {len(train_df.columns)} columns.")
    
    fraud_count = int(train_df['isFraud'].sum())
    normal_count = len(train_df) - fraud_count
    fraud_pct = (fraud_count / len(train_df)) * 100
    print(f"       Class distribution: {fraud_count:,} Frauds ({fraud_pct:.2f}%) vs {normal_count:,} Legitimate ({100-fraud_pct:.2f}%)")

    # Feature Engineering
    print("\n[2/5] Performing feature engineering & encoding...")
    train_df['TransactionAmt_log'] = np.log1p(train_df['TransactionAmt'])
    train_df['TransactionAmt_decimal'] = (train_df['TransactionAmt'] - np.floor(train_df['TransactionAmt'])).astype(np.float32)

    cat_mappings = {}
    for col in CATEGORICAL_COLS:
        train_df[col] = train_df[col].astype(str).fillna('__MISSING__')
        unique_vals = train_df[col].unique()
        mapping = {val: idx for idx, val in enumerate(unique_vals)}
        train_df[col] = train_df[col].map(mapping).astype(np.int32)
        cat_mappings[col] = mapping

    feature_cols = [c for c in train_df.columns if c not in ['TransactionID', 'isFraud']]
    train_df = reduce_mem_usage(train_df)

    # Train / Validation Split (Time-based split: last 20% is validation)
    split_idx = int(len(train_df) * 0.8)
    X_train = train_df[feature_cols].iloc[:split_idx]
    y_train = train_df['isFraud'].iloc[:split_idx]
    X_val = train_df[feature_cols].iloc[split_idx:]
    y_val = train_df['isFraud'].iloc[split_idx:]

    print(f"       Train set: {len(X_train):,} samples ({y_train.sum():,} frauds)")
    print(f"       Validation set: {len(X_val):,} samples ({y_val.sum():,} frauds)")

    # Model training with LightGBM
    print("\n[3/5] Training Gradient Boosting model (LightGBM)...")
    try:
        import lightgbm as lgb
        train_data = lgb.Dataset(X_train, label=y_train)
        val_data = lgb.Dataset(X_val, label=y_val, reference=train_data)

        params = {
            'objective': 'binary',
            'metric': 'auc',
            'boosting_type': 'gbdt',
            'learning_rate': 0.08,
            'num_leaves': 63,
            'max_depth': -1,
            'feature_fraction': 0.85,
            'bagging_fraction': 0.85,
            'bagging_freq': 1,
            'verbose': -1,
            'n_jobs': -1,
            'random_state': 42
        }

        evals_result = {}
        model = lgb.train(
            params,
            train_data,
            num_boost_round=250,
            valid_sets=[train_data, val_data],
            valid_names=['train', 'valid'],
            callbacks=[lgb.record_evaluation(evals_result)]
        )

        val_preds = model.predict(X_val, num_iteration=model.best_iteration)
        importances = model.feature_importance(importance_type='gain')
        feat_imp = sorted(zip(feature_cols, importances), key=lambda x: x[1], reverse=True)

    except ImportError:
        print("       LightGBM not found, using HistGradientBoostingClassifier from scikit-learn...")
        from sklearn.ensemble import HistGradientBoostingClassifier
        model = HistGradientBoostingClassifier(
            max_iter=150,
            learning_rate=0.08,
            max_leaf_nodes=63,
            random_state=42
        )
        model.fit(X_train.fillna(-999), y_train)
        val_preds = model.predict_proba(X_val.fillna(-999))[:, 1]
        feat_imp = [(col, 1.0) for col in feature_cols[:20]]

    # Evaluation Metrics
    from sklearn.metrics import roc_auc_score, average_precision_score, confusion_matrix, precision_score, recall_score, f1_score

    roc_auc = float(roc_auc_score(y_val, val_preds))
    pr_auc = float(average_precision_score(y_val, val_preds))

    # Evaluate at threshold 0.5 and at optimal F1 threshold
    threshold_05 = 0.5
    y_pred_05 = (val_preds >= threshold_05).astype(int)
    cm_05 = confusion_matrix(y_val, y_pred_05).tolist()

    # Find optimal threshold by max F1
    thresholds = np.linspace(0.1, 0.9, 17)
    f1_scores = [f1_score(y_val, (val_preds >= t).astype(int)) for t in thresholds]
    best_t_idx = np.argmax(f1_scores)
    best_threshold = float(thresholds[best_t_idx])
    y_pred_best = (val_preds >= best_threshold).astype(int)
    cm_best = confusion_matrix(y_val, y_pred_best).tolist()

    precision = float(precision_score(y_val, y_pred_best))
    recall = float(recall_score(y_val, y_pred_best))
    f1 = float(f1_scores[best_t_idx])

    print("\n" + "=" * 60)
    print("  VALIDATION RESULTS ON IEEE-CIS DATASET")
    print("=" * 60)
    print(f"  ROC AUC Score:               {roc_auc:.4f} (90%+ is exceptional)")
    print(f"  PR-AUC (Avg Precision):      {pr_auc:.4f}")
    print(f"  Optimal Threshold:           {best_threshold:.2f}")
    print(f"  Precision at best threshold: {precision:.4f} ({precision*100:.1f}%)")
    print(f"  Recall at best threshold:    {recall:.4f} ({recall*100:.1f}%)")
    print(f"  F1 Score:                    {f1:.4f}")
    print(f"  Confusion Matrix (Best Threshold):")
    print(f"    True Negative (Safe):      {cm_best[0][0]:,}")
    print(f"    False Positive (Alert):    {cm_best[0][1]:,}")
    print(f"    False Negative (Missed):   {cm_best[1][0]:,}")
    print(f"    True Positive (Caught):    {cm_best[1][1]:,}")
    print("=" * 60)

    print("\n  Top 10 Most Predictive Features:")
    for rank, (fname, imp) in enumerate(feat_imp[:10], 1):
        print(f"    {rank:2d}. {fname.ljust(25)} (gain: {imp:,.1f})")

    # Clear training memory before loading test set
    del train_df, X_train, y_train, X_val, y_val
    gc.collect()

    # Test Set Predictions
    print(f"\n[4/5] Loading test data from {TEST_PATH}...")
    test_load_cols = ['TransactionID'] + ALL_FEATURE_COLS
    test_df = pd.read_csv(TEST_PATH, usecols=test_load_cols)
    print(f"       Loaded {len(test_df):,} test transactions.")

    test_df['TransactionAmt_log'] = np.log1p(test_df['TransactionAmt'])
    test_df['TransactionAmt_decimal'] = (test_df['TransactionAmt'] - np.floor(test_df['TransactionAmt'])).astype(np.float32)

    for col in CATEGORICAL_COLS:
        test_df[col] = test_df[col].astype(str).fillna('__MISSING__')
        mapping = cat_mappings.get(col, {})
        test_df[col] = test_df[col].map(lambda x: mapping.get(x, -1)).astype(np.int32)

    test_X = test_df[feature_cols]
    test_X = reduce_mem_usage(test_X)

    print("\n[5/5] Generating fraud predictions for test set...")
    if hasattr(model, 'best_iteration'):
        test_preds = model.predict(test_X, num_iteration=model.best_iteration)
    else:
        test_preds = model.predict_proba(test_X.fillna(-999))[:, 1]

    # Save submission file
    submission = pd.DataFrame({
        'TransactionID': test_df['TransactionID'],
        'isFraud': np.round(test_preds, 5)
    })
    submission.to_csv(OUTPUT_PRED_PATH, index=False)
    print(f"       ✅ Saved predictions to: {OUTPUT_PRED_PATH}")

    # Summary statistics of test predictions
    test_flagged_count = int((test_preds >= best_threshold).sum())
    test_flagged_pct = (test_flagged_count / len(test_preds)) * 100

    results_summary = {
        "dataset": "IEEE-CIS Fraud Detection (public/)",
        "train_samples": 590540,
        "test_samples": 506691,
        "features_engineered": len(feature_cols),
        "validation_metrics": {
            "roc_auc": round(roc_auc, 4),
            "pr_auc": round(pr_auc, 4),
            "optimal_threshold": round(best_threshold, 2),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "confusion_matrix": {
                "true_negative": cm_best[0][0],
                "false_positive": cm_best[0][1],
                "false_negative": cm_best[1][0],
                "true_positive": cm_best[1][1]
            }
        },
        "test_predictions_summary": {
            "total_transactions_scored": len(test_preds),
            "flagged_frauds_at_optimal_threshold": test_flagged_count,
            "flagged_percentage": round(test_flagged_pct, 2),
            "mean_fraud_probability": round(float(np.mean(test_preds)), 4),
            "max_fraud_probability": round(float(np.max(test_preds)), 4)
        },
        "top_features": [
            {"feature": f, "importance": round(float(imp), 2)}
            for f, imp in feat_imp[:15]
        ],
        "output_file": OUTPUT_PRED_PATH,
        "elapsed_seconds": round(time.time() - start_time, 1)
    }

    with open(OUTPUT_METRICS_PATH, 'w') as f:
        json.dump(results_summary, f, indent=2)
    print(f"       ✅ Saved full metrics report to: {OUTPUT_METRICS_PATH}")

    print("\n" + "=" * 60)
    print(f"  ALL DONE in {time.time() - start_time:.1f} seconds!")
    print(f"  Flagged {test_flagged_count:,} ({test_flagged_pct:.2f}%) high-risk fraud transactions in test set.")
    print("=" * 60)

if __name__ == '__main__':
    main()
