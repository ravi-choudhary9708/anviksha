"""
run_rigorous_tests.py
=====================
Three rigorous ML + Graph benchmarks for Anviksha Hackathon Defense:

Test 1: Matched-Capacity Comparison (Fixed Alert Budgets: K = 23, 50, 100, 200)
Test 2: True Graph Ablation (Identical folds, identical thresholds, Cascade with vs without Graph)
Test 3: Untouched Holdout Validation (Strict 80% Dev / 20% Holdout, frozen models & thresholds)
"""

import os, json, sys
import numpy as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    precision_score, recall_score, roc_auc_score,
    average_precision_score, confusion_matrix, f1_score
)
from xgboost import XGBClassifier

BASE_DIR  = Path(__file__).parent
DATA_PATH = BASE_DIR / "DataSet.csv"
OUT_DIR   = BASE_DIR / "models"
OUT_FILE  = OUT_DIR / "rigorous_tests_result.json"

BASE_GOLDEN_FEATURES = [
    'F115','F321','F527','F531','F670','F1692','F2082','F2122',
    'F2582','F2678','F2737','F2956','F3043','F3836','F3887','F3889','F3891','F3894'
]

def engineer_features(df):
    df = df.copy()
    f115  = pd.to_numeric(df['F115'],  errors='coerce').fillna(0)
    f321  = pd.to_numeric(df['F321'],  errors='coerce').fillna(0)
    f527  = pd.to_numeric(df['F527'],  errors='coerce').fillna(0)
    f531  = pd.to_numeric(df['F531'],  errors='coerce').fillna(0)
    f2082 = pd.to_numeric(df['F2082'], errors='coerce').fillna(0)
    f1692 = pd.to_numeric(df['F1692'], errors='coerce').fillna(0)
    f3836 = pd.to_numeric(df['F3836'], errors='coerce').fillna(0)
    f2956 = pd.to_numeric(df['F2956'], errors='coerce').fillna(0)
    f3043 = pd.to_numeric(df['F3043'], errors='coerce').fillna(0)

    # Method 3 features
    df['F_turnover_ratio'] = f3043 / (f2956 + 1e-5)
    df['F_velocity_burst'] = f2082 * f1692
    df['F_round_amount']   = ((f3836 > 0) & (f3836 % 10000 == 0)).astype(np.float32)
    df['F_passthrough']    = f321 / (f115 + 1e-5)

    # Graph Topology indicators
    fan_in = f531
    fan_out = f527
    passthrough = f3043 / (f2956 + 1e-5)

    graph_score = np.zeros(len(df), dtype=np.float32)
    graph_score += np.where(fan_in >= 10, 30.0, np.where(fan_in >= 5, 20.0, np.where(fan_in >= 3, 10.0, 0.0)))
    graph_score += np.where(fan_out >= 8, 25.0, np.where(fan_out >= 4, 15.0, np.where(fan_out >= 2, 5.0, 0.0)))
    graph_score += np.where(passthrough >= 0.9, 30.0, np.where(passthrough >= 0.7, 20.0, np.where(passthrough >= 0.5, 10.0, 0.0)))
    graph_score += np.where((fan_in >= 5) & (fan_out >= 3), 15.0, 0.0)

    df['Graph_Topology_Score'] = np.clip(graph_score, 0, 100) / 100.0
    return df


def load_dataset():
    df = pd.read_csv(DATA_PATH, low_memory=False)
    df = df.loc[:, ~df.columns.str.match(r'^Unnamed')]

    for col in BASE_GOLDEN_FEATURES:
        if df[col].dtype == object:
            df[col] = df[col].fillna('UNKNOWN').astype(str)
        else:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    df = engineer_features(df)

    for col in [c for c in BASE_GOLDEN_FEATURES if df[c].dtype == object]:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col])

    X_base = df[BASE_GOLDEN_FEATURES].values.astype(np.float32)
    derived_cols = ['F_turnover_ratio', 'F_velocity_burst', 'F_round_amount', 'F_passthrough']
    X_method3 = df[BASE_GOLDEN_FEATURES + derived_cols].values.astype(np.float32)
    graph_scores = df['Graph_Topology_Score'].values.astype(np.float32)
    y = df['F3924'].values.astype(int)

    return X_base, X_method3, graph_scores, y


# ==============================================================================
# TEST 1: MATCHED-CAPACITY COMPARISON (Fixed Alert Budgets: K = 23, 50, 100, 200)
# ==============================================================================
def run_matched_capacity(y_true, scores_dict, k_list=[23, 50, 100, 200]):
    print("\n" + "=" * 80)
    print("  TEST 1: MATCHED-CAPACITY COMPARISON AT EXACT ALERT BUDGETS")
    print("  (Standard AML Benchmark: If compliance reviews exactly K alerts, how many mules are caught?)")
    print("=" * 80)

    results = {}
    total_mules = int(y_true.sum())
    total_legit = len(y_true) - total_mules

    for k in k_list:
        results[k] = {}
        print(f"\n--- Alert Budget: Top-{k} Alerts (Operational Capacity = {k}) ---")
        print(f"{'Model Architecture':<36} | {'TP (Caught)':<11} | {'FP (False)':<10} | {'Precision':<10} | {'Recall':<8} | {'FP / 1k Legit':<13}")
        print("-" * 105)

        for name, scores in scores_dict.items():
            # Rank accounts by score descending; take top K
            top_k_indices = np.argsort(scores)[::-1][:k]
            tp = int(y_true[top_k_indices].sum())
            fp = k - tp
            prec = (tp / k) * 100.0
            rec = (tp / total_mules) * 100.0
            fp_per_1k = (fp / total_legit) * 1000.0

            results[k][name] = {
                'capacity_k': k,
                'TP': tp,
                'FP': fp,
                'precision_pct': round(prec, 2),
                'recall_pct': round(rec, 2),
                'fp_per_1000_legit': round(fp_per_1k, 2)
            }

            print(f"{name:<36} | {tp:>11} | {fp:>10} | {prec:>9.1f}% | {rec:>7.1f}% | {fp_per_1k:>13.2f}")

    return results


# ==============================================================================
# TEST 2: TRUE GRAPH ABLATION (Identical Folds, Identical Thresholds)
# ==============================================================================
def run_true_graph_ablation(X_m3, graph_scores, y, n_splits=5):
    print("\n" + "=" * 80)
    print("  TEST 2: TRUE GRAPH ABLATION TEST")
    print("  (Identical Stratified 5-Fold Splits, Identical Models, Identical Thresholds)")
    print("  Comparing: Cascade WITHOUT Graph  vs.  Cascade WITH Graph")
    print("=" * 80)

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    oof_stage1_prob = np.zeros(len(y))
    oof_stage2_prob = np.zeros(len(y))

    # Evaluate models on exact same folds
    for fold, (train_idx, test_idx) in enumerate(skf.split(X_m3, y), 1):
        X_tr, y_tr = X_m3[train_idx], y[train_idx]
        X_te, y_te = X_m3[test_idx],  y[test_idx]

        tr_normal = (y_tr == 0).sum()
        tr_fraud  = max(1, (y_tr == 1).sum())

        # Stage 1 Coarse Model
        s1 = XGBClassifier(
            n_estimators=180, max_depth=4, learning_rate=0.06,
            scale_pos_weight=tr_normal / tr_fraud,
            subsample=0.85, colsample_bytree=0.85,
            random_state=100 + fold, eval_metric='aucpr', n_jobs=-1
        )
        s1.fit(X_tr, y_tr)
        s1_te_prob = s1.predict_proba(X_te)[:, 1]
        oof_stage1_prob[test_idx] = s1_te_prob

        # Stage 2 Precision Sieve on Stage 1 candidates
        s1_tr_pass = s1.predict_proba(X_tr)[:, 1] >= 0.30
        X_tr_s2 = X_tr[s1_tr_pass]
        y_tr_s2 = y_tr[s1_tr_pass]
        s2_normal = max(1, (y_tr_s2 == 0).sum())
        s2_fraud  = max(1, (y_tr_s2 == 1).sum())

        s2 = XGBClassifier(
            n_estimators=220, max_depth=5, learning_rate=0.04,
            scale_pos_weight=max(1.0, s2_normal / s2_fraud),
            subsample=0.8, colsample_bytree=0.8,
            random_state=200 + fold, eval_metric='logloss', n_jobs=-1
        )
        s2.fit(X_tr_s2, y_tr_s2)

        s2_te_prob = np.zeros(len(test_idx))
        s1_te_pass = s1_te_prob >= 0.30
        if s1_te_pass.any():
            s2_te_prob[s1_te_pass] = s2.predict_proba(X_te[s1_te_pass])[:, 1]
        oof_stage2_prob[test_idx] = s2_te_prob

    # ABLATION A: Cascade WITHOUT Graph (ML Alone)
    # Thresholds: S1 >= 0.30, S2 >= 0.50
    pred_no_graph = ((oof_stage1_prob >= 0.30) & (oof_stage2_prob >= 0.50)).astype(int)
    cm_no_graph = confusion_matrix(y, pred_no_graph)
    TN_a, FP_a, FN_a, TP_a = cm_no_graph.ravel()
    prec_a = (TP_a / max(1, TP_a + FP_a)) * 100.0
    rec_a  = (TP_a / max(1, TP_a + FN_a)) * 100.0
    fp_rate_a = (FP_a / max(1, TN_a + FP_a)) * 1000.0

    # ABLATION B: Cascade WITH Graph (Exact Same ML Predictions + Graph Network Filter)
    # Fused Score = 0.60 * Stage2 + 0.40 * Graph
    fused_score = np.where(graph_scores > 0, (oof_stage2_prob * 0.60) + (graph_scores * 0.40), oof_stage2_prob)
    pred_with_graph = ((oof_stage1_prob >= 0.30) & (fused_score >= 0.50)).astype(int)
    cm_with_graph = confusion_matrix(y, pred_with_graph)
    TN_b, FP_b, FN_b, TP_b = cm_with_graph.ravel()
    prec_b = (TP_b / max(1, TP_b + FP_b)) * 100.0
    rec_b  = (TP_b / max(1, TP_b + FN_b)) * 100.0
    fp_rate_b = (FP_b / max(1, TN_b + FP_b)) * 1000.0

    delta_prec = prec_b - prec_a
    delta_fp = FP_b - FP_a
    delta_tp = TP_b - TP_a

    print(f"\n{'Metric':<32} | {'Cascade WITHOUT Graph':<22} | {'Cascade WITH Graph':<22} | {'Ablation Delta (Impact)':<22}")
    print("-" * 105)
    print(f"{'True Positives (Caught Mules)':<32} | {TP_a:<22} | {TP_b:<22} | {f'{delta_tp:+d} mules':<22}")
    print(f"{'False Positives (False Alarms)':<32} | {FP_a:<22} | {FP_b:<22} | {f'{delta_fp:+d} alarms':<22}")
    print(f"{'Precision (%)':<32} | {f'{prec_a:.2f}%':<22} | {f'{prec_b:.2f}%':<22} | {f'{delta_prec:+.2f}%':<22}")
    print(f"{'Recall (%)':<32} | {f'{rec_a:.2f}%':<22} | {f'{rec_b:.2f}%':<22} | {f'{rec_b - rec_a:+.2f}%':<22}")
    print(f"{'FP per 1,000 Legitimate':<32} | {f'{fp_rate_a:.2f}':<22} | {f'{fp_rate_b:.2f}':<22} | {f'{fp_rate_b - fp_rate_a:+.2f}':<22}")
    print(f"{'Innocent Customers Protected':<32} | {TN_a:<22} | {TN_b:<22} | {f'{TN_b - TN_a:+d} saved':<22}")
    print("-" * 105)

    ablation_res = {
        'without_graph': {
            'TP': int(TP_a), 'FP': int(FP_a), 'TN': int(TN_a), 'FN': int(FN_a),
            'precision_pct': round(prec_a, 2), 'recall_pct': round(rec_a, 2), 'fp_per_1000': round(fp_rate_a, 2)
        },
        'with_graph': {
            'TP': int(TP_b), 'FP': int(FP_b), 'TN': int(TN_b), 'FN': int(FN_b),
            'precision_pct': round(prec_b, 2), 'recall_pct': round(rec_b, 2), 'fp_per_1000': round(fp_rate_b, 2)
        },
        'delta': {
            'delta_precision_pct': round(delta_prec, 2),
            'delta_false_positives': int(delta_fp),
            'delta_true_positives': int(delta_tp)
        }
    }
    return ablation_res, oof_stage1_prob, oof_stage2_prob, fused_score


# ==============================================================================
# TEST 3: UNTOUCHED HOLDOUT VALIDATION (Strict 80% Dev / 20% Holdout Split)
# ==============================================================================
def run_untouched_holdout(X_base, X_m3, graph_scores, y):
    print("\n" + "=" * 80)
    print("  TEST 3: UNTOUCHED HOLDOUT VALIDATION (ZERO-LEAKAGE)")
    print("  (Split 80% Dev / 20% Holdout. All models, rules & thresholds frozen on Dev,")
    print("   then evaluated on virgin accounts that played NO role in training or discovery)")
    print("=" * 80)

    # 80/20 Stratified Split
    indices = np.arange(len(y))
    dev_idx, holdout_idx = train_test_split(
        indices, test_size=0.20, stratify=y, random_state=2026
    )

    X_dev_m3, X_holdout_m3 = X_m3[dev_idx], X_m3[holdout_idx]
    X_dev_base, X_holdout_base = X_base[dev_idx], X_base[holdout_idx]
    g_dev, g_holdout = graph_scores[dev_idx], graph_scores[holdout_idx]
    y_dev, y_holdout = y[dev_idx], y[holdout_idx]

    dev_mules = int(y_dev.sum())
    holdout_mules = int(y_holdout.sum())
    dev_legit = len(y_dev) - dev_mules
    holdout_legit = len(y_holdout) - holdout_mules

    print(f"\n[SPLIT] Development Set: {len(y_dev):,} accounts ({dev_mules} mules, {dev_legit} legit)")
    print(f"[SPLIT] Untouched Holdout: {len(y_holdout):,} accounts ({holdout_mules} mules, {holdout_legit} legit)")

    # 1. Train Baseline XGBoost strictly on Dev
    base_xgb = XGBClassifier(
        n_estimators=150, max_depth=4, learning_rate=0.08,
        scale_pos_weight=dev_legit / max(1, dev_mules),
        random_state=42, eval_metric='logloss', n_jobs=-1
    )
    base_xgb.fit(X_dev_base, y_dev)
    base_holdout_prob = base_xgb.predict_proba(X_holdout_base)[:, 1]

    # 2. Train Two-Stage Cascade strictly on Dev
    # Stage 1
    s1 = XGBClassifier(
        n_estimators=180, max_depth=4, learning_rate=0.06,
        scale_pos_weight=dev_legit / max(1, dev_mules),
        subsample=0.85, colsample_bytree=0.85,
        random_state=100, eval_metric='aucpr', n_jobs=-1
    )
    s1.fit(X_dev_m3, y_dev)
    s1_dev_prob = s1.predict_proba(X_dev_m3)[:, 1]
    s1_holdout_prob = s1.predict_proba(X_holdout_m3)[:, 1]

    # Stage 2 on Stage 1 dev pass
    s1_dev_pass = s1_dev_prob >= 0.30
    X_dev_s2 = X_dev_m3[s1_dev_pass]
    y_dev_s2 = y_dev[s1_dev_pass]
    s2_normal = max(1, (y_dev_s2 == 0).sum())
    s2_fraud  = max(1, (y_dev_s2 == 1).sum())

    s2 = XGBClassifier(
        n_estimators=220, max_depth=5, learning_rate=0.04,
        scale_pos_weight=max(1.0, s2_normal / s2_fraud),
        subsample=0.8, colsample_bytree=0.8,
        random_state=200, eval_metric='logloss', n_jobs=-1
    )
    s2.fit(X_dev_s2, y_dev_s2)

    # Freeze threshold discovery on Dev set only
    s2_dev_prob = s2.predict_proba(X_dev_s2)[:, 1]
    frozen_s2_thresh = 0.65
    for t in np.linspace(0.40, 0.85, 46):
        p_t = (s2_dev_prob >= t).astype(int)
        if precision_score(y_dev_s2, p_t, zero_division=0) >= 0.85:
            frozen_s2_thresh = t
            break

    print(f"[FREEZE] Discovered Stage 2 Threshold on Dev: {frozen_s2_thresh:.2f} (targeting >=85% precision)")

    # Evaluate frozen models on untouched holdout
    s1_holdout_pass = s1_holdout_prob >= 0.30
    s2_holdout_prob = np.zeros(len(y_holdout))
    if s1_holdout_pass.any():
        s2_holdout_prob[s1_holdout_pass] = s2.predict_proba(X_holdout_m3[s1_holdout_pass])[:, 1]

    # Fused ML + Graph on holdout
    fused_holdout = np.where(g_holdout > 0, (s1_holdout_prob * 0.60) + (g_holdout * 0.40), s1_holdout_prob)

    # 1. Baseline Model on Holdout (at standard 0.50 threshold)
    pred_base = (base_holdout_prob >= 0.50).astype(int)
    cm_base = confusion_matrix(y_holdout, pred_base)
    TN1, FP1, FN1, TP1 = cm_base.ravel()

    # 2. Frozen Cascade on Holdout (at frozen threshold)
    pred_cascade = (s1_holdout_pass & (s2_holdout_prob >= frozen_s2_thresh)).astype(int)
    cm_cascade = confusion_matrix(y_holdout, pred_cascade)
    TN2, FP2, FN2, TP2 = cm_cascade.ravel()

    # 3. Fused ML + Graph on Holdout (at standard action threshold 0.70)
    pred_graph = (fused_holdout >= 0.70).astype(int)
    cm_graph = confusion_matrix(y_holdout, pred_graph)
    TN3, FP3, FN3, TP3 = cm_graph.ravel()

    holdout_results = [
        {
            'name': '1. Baseline XGBoost (Holdout)',
            'TP': int(TP1), 'FP': int(FP1), 'TN': int(TN1), 'FN': int(FN1),
            'precision': round((TP1 / max(1, TP1 + FP1)) * 100, 2),
            'recall': round((TP1 / holdout_mules) * 100, 2),
            'fp_per_1k': round((FP1 / holdout_legit) * 1000, 2),
            'roc_auc': round(roc_auc_score(y_holdout, base_holdout_prob), 4),
            'pr_auc': round(average_precision_score(y_holdout, base_holdout_prob), 4)
        },
        {
            'name': '2. Frozen Two-Stage Cascade',
            'TP': int(TP2), 'FP': int(FP2), 'TN': int(TN2), 'FN': int(FN2),
            'precision': round((TP2 / max(1, TP2 + FP2)) * 100, 2),
            'recall': round((TP2 / holdout_mules) * 100, 2),
            'fp_per_1k': round((FP2 / holdout_legit) * 1000, 2),
            'roc_auc': round(roc_auc_score(y_holdout, s1_holdout_prob), 4),
            'pr_auc': round(average_precision_score(y_holdout, s1_holdout_prob), 4)
        },
        {
            'name': '3. Fused ML + Graph (Holdout)',
            'TP': int(TP3), 'FP': int(FP3), 'TN': int(TN3), 'FN': int(FN3),
            'precision': round((TP3 / max(1, TP3 + FP3)) * 100, 2),
            'recall': round((TP3 / holdout_mules) * 100, 2),
            'fp_per_1k': round((FP3 / holdout_legit) * 1000, 2),
            'roc_auc': round(roc_auc_score(y_holdout, fused_holdout), 4),
            'pr_auc': round(average_precision_score(y_holdout, fused_holdout), 4)
        }
    ]

    print(f"\n{'Architecture (Untouched Holdout)':<32} | {'TP':<4} | {'FP':<5} | {'TN':<5} | {'FN':<4} | {'Precision':<10} | {'Recall':<8} | {'FP / 1k Legit':<13} | {'ROC-AUC':<8} | {'PR-AUC'}")
    print("-" * 115)
    for hr in holdout_results:
        print(f"{hr['name']:<32} | {hr['TP']:>4} | {hr['FP']:>5} | {hr['TN']:>5} | {hr['FN']:>4} | {hr['precision']:>9.1f}% | {hr['recall']:>7.1f}% | {hr['fp_per_1k']:>13.2f} | {hr['roc_auc']:>8.4f} | {hr['pr_auc']:.4f}")

    return holdout_results


def main():
    X_base, X_m3, graph_scores, y = load_dataset()

    # 1. Run Test 2 to get OOF probabilities for all 9,082 accounts
    ablation_res, oof_s1, oof_s2, oof_fused = run_true_graph_ablation(X_m3, graph_scores, y)

    # 2. Run Test 1 (Matched-Capacity comparison at Top-23, Top-50, Top-100, Top-200)
    # Baseline out-of-fold probability
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_base = np.zeros(len(y))
    for fold, (train_idx, test_idx) in enumerate(skf.split(X_base, y), 1):
        tr_normal = (y[train_idx] == 0).sum()
        tr_fraud  = max(1, (y[train_idx] == 1).sum())
        bx = XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.08, scale_pos_weight=tr_normal/tr_fraud, random_state=42+fold, eval_metric='logloss', n_jobs=-1)
        bx.fit(X_base[train_idx], y[train_idx])
        oof_base[test_idx] = bx.predict_proba(X_base[test_idx])[:, 1]

    scores_dict = {
        '1. Baseline XGBoost': oof_base,
        '2. Fused ML + Graph': oof_fused,
        '3. Cascade + Graph Synergy': (oof_s2 * 0.60) + (graph_scores * 0.40)
    }
    matched_capacity_res = run_matched_capacity(y, scores_dict, [23, 50, 100, 200])

    # 3. Run Test 3 (Untouched Holdout Validation)
    holdout_res = run_untouched_holdout(X_base, X_m3, graph_scores, y)

    # Serialize complete payload
    final_output = {
        'test_1_matched_capacity': matched_capacity_res,
        'test_2_graph_ablation': ablation_res,
        'test_3_untouched_holdout': holdout_res
    }

    OUT_DIR.mkdir(exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_output, f, indent=2)

    print("\n" + "=" * 80)
    print(f"  All 3 Tests Completed Successfully!")
    print(f"  Results saved to: {OUT_FILE}")
    print("=" * 80 + "\n")


if __name__ == '__main__':
    main()
