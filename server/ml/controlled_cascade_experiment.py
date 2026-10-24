"""
controlled_cascade_experiment.py
================================
Controlled benchmark comparing:
1. Single XGBoost (trained on all accounts)
2. Existing Two-Stage Cascade (S1 >= 0.30, Stage 2 trained on S1 >= 0.30 candidates)
3. Two-Stage Cascade with Wider Gate (S1 >= 0.07, Stage 2 retrained on S1 >= 0.07 candidates)
4. Two-Stage Cascade with Wider Gate & Fixed Stage 2 (S1 >= 0.07, evaluated with the fixed S2 from Pipeline 2)

Evaluated under:
- Identical 5-fold Stratified Cross-Validation on Development Set (7,265 accounts, 65 mules)
- Matched alert budgets: Top-20, Top-50, Top-100, Top-200
- Out-of-fold PR-AUC, ROC-AUC
- Untouched Holdout validation (1,817 accounts, 16 mules)
- Explanatory audit of why retrained S2 altered alert counts vs fixed S2
"""

import os, json
import numpy as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    precision_score, recall_score, roc_auc_score,
    average_precision_score, confusion_matrix
)
from xgboost import XGBClassifier

BASE_DIR  = Path(__file__).parent
DATA_PATH = BASE_DIR / "DataSet.csv"
OUT_DIR   = BASE_DIR / "models"
OUT_FILE  = OUT_DIR / "controlled_cascade_experiment.json"

BASE_FEATURES = [
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

    # Ratios and interaction features (labeled neutrally)
    df['F_ratio_3043_2956'] = f3043 / (f2956 + 1e-5)
    df['F_interaction_2082_1692'] = f2082 * f1692
    df['F_mod10k_3836']     = ((f3836 > 0) & (f3836 % 10000 == 0)).astype(np.float32)
    df['F_ratio_321_115']   = f321 / (f115 + 1e-5)

    # Topology indicators
    fan_in = f531
    fan_out = f527
    ratio_flow = f3043 / (f2956 + 1e-5)

    graph_score = np.zeros(len(df), dtype=np.float32)
    graph_score += np.where(fan_in >= 10, 30.0, np.where(fan_in >= 5, 20.0, np.where(fan_in >= 3, 10.0, 0.0)))
    graph_score += np.where(fan_out >= 8, 25.0, np.where(fan_out >= 4, 15.0, np.where(fan_out >= 2, 5.0, 0.0)))
    graph_score += np.where(ratio_flow >= 0.9, 30.0, np.where(ratio_flow >= 0.7, 20.0, np.where(ratio_flow >= 0.5, 10.0, 0.0)))
    graph_score += np.where((fan_in >= 5) & (fan_out >= 3), 15.0, 0.0)

    df['Graph_Topology_Score'] = np.clip(graph_score, 0, 100) / 100.0
    return df

def load_data():
    df_raw = pd.read_csv(DATA_PATH, low_memory=False)
    df_raw = df_raw.loc[:, ~df_raw.columns.str.match(r'^Unnamed')]

    for col in BASE_FEATURES:
        if df_raw[col].dtype == object:
            df_raw[col] = df_raw[col].fillna('UNKNOWN').astype(str)
        else:
            df_raw[col] = pd.to_numeric(df_raw[col], errors='coerce').fillna(0)

    df = engineer_features(df_raw)

    for col in [c for c in BASE_FEATURES if df[c].dtype == object]:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col])

    derived = ['F_ratio_3043_2956', 'F_interaction_2082_1692', 'F_mod10k_3836', 'F_ratio_321_115']
    all_features = BASE_FEATURES + derived
    X = df[all_features].values.astype(np.float32)
    y = df['F3924'].values.astype(int)
    g = df['Graph_Topology_Score'].values.astype(np.float32)
    return X, y, g, all_features, df_raw

def evaluate_ranking(y_true, scores, k_list=[20, 50, 100, 200]):
    total_mules = int(y_true.sum())
    total_legit = len(y_true) - total_mules
    results = {}
    for k in k_list:
        top_k = np.argsort(scores)[::-1][:k]
        tp = int(y_true[top_k].sum())
        fp = k - tp
        prec = (tp / k) * 100.0
        rec = (tp / total_mules) * 100.0
        fp_rate = (fp / total_legit) * 1000.0
        results[k] = {
            'budget_k': k,
            'TP': tp,
            'FP': fp,
            'precision': round(prec, 2),
            'recall': round(rec, 2),
            'fp_per_1k_legit': round(fp_rate, 2)
        }
    return results

def main():
    print("=" * 85)
    print("  CONTROLLED EXPERIMENT: SINGLE XGBOOST vs. TWO-STAGE CASCADE ARCHITECTURES")
    print("  Evaluating under identical folds, matched capacities, and rigorous holdout")
    print("=" * 85)

    X, y, g, feature_names, df_raw = load_data()

    # Split Dev (80%) and Untouched Holdout (20%)
    indices = np.arange(len(y))
    dev_idx, holdout_idx = train_test_split(indices, test_size=0.20, stratify=y, random_state=2026)

    X_dev, y_dev, g_dev = X[dev_idx], y[dev_idx], g[dev_idx]
    X_holdout, y_holdout, g_holdout = X[holdout_idx], y[holdout_idx], g[holdout_idx]

    dev_mules = int(y_dev.sum())
    dev_legit = len(y_dev) - dev_mules
    holdout_mules = int(y_holdout.sum())
    holdout_legit = len(y_holdout) - holdout_mules

    print(f"\n[DATA SPLIT]")
    print(f"  Development Set : {len(y_dev):,} accounts (Mules: {dev_mules}, Legit: {dev_legit})")
    print(f"  Untouched Holdout: {len(y_holdout):,} accounts (Mules: {holdout_mules}, Legit: {holdout_legit})")

    # =========================================================================
    # PART 1: 5-FOLD CROSS-VALIDATION ON DEV SET
    # =========================================================================
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    # Prediction arrays
    oof_single_xgb    = np.zeros(len(y_dev))
    oof_s1_prob       = np.zeros(len(y_dev))

    oof_cascade_p2_score = np.zeros(len(y_dev))  # S1 >= 0.30, S2 retrained on S1>=0.30
    oof_cascade_p3_score = np.zeros(len(y_dev))  # S1 >= 0.07, S2 retrained on S1>=0.07
    oof_cascade_p4_score = np.zeros(len(y_dev))  # S1 >= 0.07, S2 fixed (from P2)

    # Raw S2 probabilities (for threshold audit)
    oof_s2_p2_raw = np.full(len(y_dev), np.nan)
    oof_s2_p3_raw = np.full(len(y_dev), np.nan)
    oof_s2_p4_raw = np.full(len(y_dev), np.nan)

    print("\n[TRAINING 5 FOLDS ON DEVELOPMENT SET]...")

    for fold, (trn, val) in enumerate(skf.split(X_dev, y_dev), 1):
        X_tr, y_tr = X_dev[trn], y_dev[trn]
        X_va, y_va = X_dev[val], y_dev[val]

        tr_mules = max(1, int(y_tr.sum()))
        tr_legit = len(y_tr) - tr_mules

        # 1. Single XGBoost (Pipeline 1)
        m1 = XGBClassifier(
            n_estimators=180, max_depth=4, learning_rate=0.06,
            scale_pos_weight=tr_legit / tr_mules,
            subsample=0.85, colsample_bytree=0.85,
            random_state=100 + fold, eval_metric='logloss', n_jobs=-1
        )
        m1.fit(X_tr, y_tr)
        oof_single_xgb[val] = m1.predict_proba(X_va)[:, 1]

        # 2. Stage 1 Coarse Model (Common to all cascades)
        s1 = XGBClassifier(
            n_estimators=180, max_depth=4, learning_rate=0.06,
            scale_pos_weight=tr_legit / tr_mules,
            subsample=0.85, colsample_bytree=0.85,
            random_state=200 + fold, eval_metric='aucpr', n_jobs=-1
        )
        s1.fit(X_tr, y_tr)
        s1_val_p = s1.predict_proba(X_va)[:, 1]
        oof_s1_prob[val] = s1_val_p

        s1_trn_p = s1.predict_proba(X_tr)[:, 1]

        # Pipeline 2: Stage 1 Gate >= 0.30
        mask_tr_030 = s1_trn_p >= 0.30
        X_tr_s2_030 = X_tr[mask_tr_030]
        y_tr_s2_030 = y_tr[mask_tr_030]
        s2_norm_030 = max(1, int((y_tr_s2_030 == 0).sum()))
        s2_mule_030 = max(1, int((y_tr_s2_030 == 1).sum()))

        s2_p2 = XGBClassifier(
            n_estimators=220, max_depth=5, learning_rate=0.04,
            scale_pos_weight=max(1.0, s2_norm_030 / s2_mule_030),
            subsample=0.8, colsample_bytree=0.8,
            random_state=300 + fold, eval_metric='logloss', n_jobs=-1
        )
        s2_p2.fit(X_tr_s2_030, y_tr_s2_030)

        # Pipeline 3: Stage 1 Gate >= 0.07 (Retrained S2)
        mask_tr_007 = s1_trn_p >= 0.07
        X_tr_s2_007 = X_tr[mask_tr_007]
        y_tr_s2_007 = y_tr[mask_tr_007]
        s2_norm_007 = max(1, int((y_tr_s2_007 == 0).sum()))
        s2_mule_007 = max(1, int((y_tr_s2_007 == 1).sum()))

        s2_p3 = XGBClassifier(
            n_estimators=220, max_depth=5, learning_rate=0.04,
            scale_pos_weight=max(1.0, s2_norm_007 / s2_mule_007),
            subsample=0.8, colsample_bytree=0.8,
            random_state=400 + fold, eval_metric='logloss', n_jobs=-1
        )
        s2_p3.fit(X_tr_s2_007, y_tr_s2_007)

        # Evaluation on val fold
        pass_val_030 = s1_val_p >= 0.30
        pass_val_007 = s1_val_p >= 0.07

        # Scores for Pipeline 2 (S1 >= 0.30):
        if pass_val_030.any():
            p2_preds = s2_p2.predict_proba(X_va[pass_val_030])[:, 1]
            oof_s2_p2_raw[val[pass_val_030]] = p2_preds
            oof_cascade_p2_score[val[pass_val_030]] = p2_preds
        oof_cascade_p2_score[val[~pass_val_030]] = s1_val_p[~pass_val_030] * 0.01

        # Scores for Pipeline 3 (S1 >= 0.07, S2 retrained):
        if pass_val_007.any():
            p3_preds = s2_p3.predict_proba(X_va[pass_val_007])[:, 1]
            oof_s2_p3_raw[val[pass_val_007]] = p3_preds
            oof_cascade_p3_score[val[pass_val_007]] = p3_preds
        oof_cascade_p3_score[val[~pass_val_007]] = s1_val_p[~pass_val_007] * 0.01

        # Scores for Pipeline 4 (S1 >= 0.07, S2 fixed to s2_p2):
        if pass_val_007.any():
            p4_preds = s2_p2.predict_proba(X_va[pass_val_007])[:, 1]
            oof_s2_p4_raw[val[pass_val_007]] = p4_preds
            oof_cascade_p4_score[val[pass_val_007]] = p4_preds
        oof_cascade_p4_score[val[~pass_val_007]] = s1_val_p[~pass_val_007] * 0.01

    print("  Done 5-fold cross-validation.\n")

    # =========================================================================
    # PART 2: INVESTIGATION OF TECHNICAL ISSUE A (Alert Count Anomaly)
    # =========================================================================
    print("=" * 85)
    print("  TECHNICAL ISSUE A: AUDIT OF STAGE 1 GATE vs. STAGE 2 ALERT COUNTS")
    print("=" * 85)

    p2_alerts_050 = (oof_s1_prob >= 0.30) & (oof_s2_p2_raw >= 0.50)
    p3_alerts_050 = (oof_s1_prob >= 0.07) & (oof_s2_p3_raw >= 0.50)
    p4_alerts_050 = (oof_s1_prob >= 0.07) & (oof_s2_p4_raw >= 0.50)

    p2_alerts_040 = (oof_s1_prob >= 0.30) & (oof_s2_p2_raw >= 0.40)
    p3_alerts_040 = (oof_s1_prob >= 0.07) & (oof_s2_p3_raw >= 0.40)
    p4_alerts_040 = (oof_s1_prob >= 0.07) & (oof_s2_p4_raw >= 0.40)

    s1_pass_030_cnt = int((oof_s1_prob >= 0.30).sum())
    s1_pass_007_cnt = int((oof_s1_prob >= 0.07).sum())

    print(f"Stage 1 Screening Gate:")
    print(f"  Gate S1 >= 0.30: Passes {s1_pass_030_cnt} accounts (Dev Mules caught: {int(y_dev[oof_s1_prob >= 0.30].sum())}/{dev_mules})")
    print(f"  Gate S1 >= 0.07: Passes {s1_pass_007_cnt} accounts (Dev Mules caught: {int(y_dev[oof_s1_prob >= 0.07].sum())}/{dev_mules})")
    print("\nAlert Counts at Cutoff S2 >= 0.50:")
    print(f"  1. Pipeline 2 (S1 >= 0.30, S2 retrained): {int(p2_alerts_050.sum())} alerts (TP={int(y_dev[p2_alerts_050].sum())}, FP={int((p2_alerts_050 & (y_dev==0)).sum())})")
    print(f"  2. Pipeline 3 (S1 >= 0.07, S2 retrained): {int(p3_alerts_050.sum())} alerts (TP={int(y_dev[p3_alerts_050].sum())}, FP={int((p3_alerts_050 & (y_dev==0)).sum())})")
    print(f"  3. Pipeline 4 (S1 >= 0.07, S2 FIXED):     {int(p4_alerts_050.sum())} alerts (TP={int(y_dev[p4_alerts_050].sum())}, FP={int((p4_alerts_050 & (y_dev==0)).sum())})")
    print("\nAlert Counts at Cutoff S2 >= 0.40:")
    print(f"  1. Pipeline 2 (S1 >= 0.30, S2 retrained): {int(p2_alerts_040.sum())} alerts (TP={int(y_dev[p2_alerts_040].sum())}, FP={int((p2_alerts_040 & (y_dev==0)).sum())})")
    print(f"  2. Pipeline 3 (S1 >= 0.07, S2 retrained): {int(p3_alerts_040.sum())} alerts (TP={int(y_dev[p3_alerts_040].sum())}, FP={int((p3_alerts_040 & (y_dev==0)).sum())})")
    print(f"  3. Pipeline 4 (S1 >= 0.07, S2 FIXED):     {int(p4_alerts_040.sum())} alerts (TP={int(y_dev[p4_alerts_040].sum())}, FP={int((p4_alerts_040 & (y_dev==0)).sum())})")

    # =========================================================================
    # PART 3: MATCHED-CAPACITY COMPARISON ACROSS DEVELOPMENT SET (Out-of-Fold)
    # =========================================================================
    print("\n" + "=" * 85)
    print("  DEVELOPMENT SET OUT-OF-FOLD: MATCHED ALERT CAPACITY (5-FOLD CV)")
    print("  Total Accounts: 7,265 | Total Confirmed Mules: 65")
    print("=" * 85)

    pipelines_oof = {
        '1. Single XGBoost': oof_single_xgb,
        '2. Baseline Cascade (S1>=0.30)': oof_cascade_p2_score,
        '3. Wide Cascade (S1>=0.07, Retrained S2)': oof_cascade_p3_score,
        '4. Wide Cascade (S1>=0.07, Fixed S2)': oof_cascade_p4_score
    }

    budgets = [20, 50, 100, 200]
    dev_ranking_results = {}

    for b in budgets:
        print(f"\n--- Alert Budget: Top-{b} Alerts ({b} accounts investigated) ---")
        print(f"{'Pipeline Architecture':<42} | {'TP (Caught)':<11} | {'FP (Alarms)':<11} | {'Precision':<10} | {'Recall':<8} | {'FP / 1k Legit':<13}")
        print("-" * 105)
        dev_ranking_results[b] = {}
        for name, sc in pipelines_oof.items():
            top_k = np.argsort(sc)[::-1][:b]
            tp = int(y_dev[top_k].sum())
            fp = b - tp
            prec = (tp / b) * 100.0
            rec = (tp / dev_mules) * 100.0
            fp_rate = (fp / dev_legit) * 1000.0

            dev_ranking_results[b][name] = {
                'TP': tp, 'FP': fp, 'precision': round(prec, 2),
                'recall': round(rec, 2), 'fp_per_1k': round(fp_rate, 2)
            }
            print(f"{name:<42} | {tp:>11} | {fp:>11} | {prec:>9.1f}% | {rec:>7.1f}% | {fp_rate:>13.2f}")

    print("\n" + "-" * 105)
    print("Overall Discrimination (Out-of-Fold AUC):")
    auc_results = {}
    for name, sc in pipelines_oof.items():
        roc = roc_auc_score(y_dev, sc)
        pr = average_precision_score(y_dev, sc)
        auc_results[name] = {'roc_auc': round(roc, 4), 'pr_auc': round(pr, 4)}
        print(f"  {name:<42}: ROC-AUC = {roc:.4f} | PR-AUC = {pr:.4f}")

    # =========================================================================
    # PART 4: EVALUATION ON UNTOUCHED HOLDOUT (1,817 accounts, 16 mules)
    # =========================================================================
    print("\n" + "=" * 85)
    print("  UNTOUCHED HOLDOUT VALIDATION (1,817 Accounts, 16 Mules)")
    print("  All models trained on Dev Set, evaluated zero-leakage on Holdout")
    print("=" * 85)

    m1_full = XGBClassifier(
        n_estimators=180, max_depth=4, learning_rate=0.06,
        scale_pos_weight=dev_legit / dev_mules,
        subsample=0.85, colsample_bytree=0.85,
        random_state=42, eval_metric='logloss', n_jobs=-1
    )
    m1_full.fit(X_dev, y_dev)
    holdout_single_xgb = m1_full.predict_proba(X_holdout)[:, 1]

    s1_full = XGBClassifier(
        n_estimators=180, max_depth=4, learning_rate=0.06,
        scale_pos_weight=dev_legit / dev_mules,
        subsample=0.85, colsample_bytree=0.85,
        random_state=100, eval_metric='aucpr', n_jobs=-1
    )
    s1_full.fit(X_dev, y_dev)
    s1_dev_full_p = s1_full.predict_proba(X_dev)[:, 1]
    s1_holdout_p  = s1_full.predict_proba(X_holdout)[:, 1]

    # Pipeline 2: S1 >= 0.30
    mask_dev_030 = s1_dev_full_p >= 0.30
    s2_full_p2 = XGBClassifier(
        n_estimators=220, max_depth=5, learning_rate=0.04,
        scale_pos_weight=max(1.0, (y_dev[mask_dev_030]==0).sum() / max(1, (y_dev[mask_dev_030]==1).sum())),
        subsample=0.8, colsample_bytree=0.8,
        random_state=200, eval_metric='logloss', n_jobs=-1
    )
    s2_full_p2.fit(X_dev[mask_dev_030], y_dev[mask_dev_030])

    # Pipeline 3: S1 >= 0.07
    mask_dev_007 = s1_dev_full_p >= 0.07
    s2_full_p3 = XGBClassifier(
        n_estimators=220, max_depth=5, learning_rate=0.04,
        scale_pos_weight=max(1.0, (y_dev[mask_dev_007]==0).sum() / max(1, (y_dev[mask_dev_007]==1).sum())),
        subsample=0.8, colsample_bytree=0.8,
        random_state=300, eval_metric='logloss', n_jobs=-1
    )
    s2_full_p3.fit(X_dev[mask_dev_007], y_dev[mask_dev_007])

    holdout_p2_score = np.zeros(len(y_holdout))
    holdout_p3_score = np.zeros(len(y_holdout))
    holdout_p4_score = np.zeros(len(y_holdout))

    pass_holdout_030 = s1_holdout_p >= 0.30
    pass_holdout_007 = s1_holdout_p >= 0.07

    if pass_holdout_030.any():
        holdout_p2_score[pass_holdout_030] = s2_full_p2.predict_proba(X_holdout[pass_holdout_030])[:, 1]
    holdout_p2_score[~pass_holdout_030] = s1_holdout_p[~pass_holdout_030] * 0.01

    if pass_holdout_007.any():
        holdout_p3_score[pass_holdout_007] = s2_full_p3.predict_proba(X_holdout[pass_holdout_007])[:, 1]
    holdout_p3_score[~pass_holdout_007] = s1_holdout_p[~pass_holdout_007] * 0.01

    if pass_holdout_007.any():
        holdout_p4_score[pass_holdout_007] = s2_full_p2.predict_proba(X_holdout[pass_holdout_007])[:, 1]
    holdout_p4_score[~pass_holdout_007] = s1_holdout_p[~pass_holdout_007] * 0.01

    pipelines_holdout = {
        '1. Single XGBoost': holdout_single_xgb,
        '2. Baseline Cascade (S1>=0.30)': holdout_p2_score,
        '3. Wide Cascade (S1>=0.07, Retrained S2)': holdout_p3_score,
        '4. Wide Cascade (S1>=0.07, Fixed S2)': holdout_p4_score
    }

    holdout_ranking_results = {}
    holdout_budgets = [11, 20, 50, 100]

    for b in holdout_budgets:
        print(f"\n--- Holdout Alert Budget: Top-{b} Alerts ({b} accounts investigated) ---")
        print(f"{'Pipeline Architecture':<42} | {'TP (Caught)':<11} | {'FP (Alarms)':<11} | {'Precision':<10} | {'Recall':<8} | {'FP / 1k Legit':<13}")
        print("-" * 105)
        holdout_ranking_results[b] = {}
        for name, sc in pipelines_holdout.items():
            top_k = np.argsort(sc)[::-1][:b]
            tp = int(y_holdout[top_k].sum())
            fp = b - tp
            prec = (tp / b) * 100.0
            rec = (tp / holdout_mules) * 100.0
            fp_rate = (fp / holdout_legit) * 1000.0

            holdout_ranking_results[b][name] = {
                'TP': tp, 'FP': fp, 'precision': round(prec, 2),
                'recall': round(rec, 2), 'fp_per_1k': round(fp_rate, 2)
            }
            print(f"{name:<42} | {tp:>11} | {fp:>11} | {prec:>9.1f}% | {rec:>7.1f}% | {fp_rate:>13.2f}")

    print("\n" + "-" * 105)
    print("Holdout Discrimination (ROC-AUC & PR-AUC):")
    holdout_auc_results = {}
    for name, sc in pipelines_holdout.items():
        roc = roc_auc_score(y_holdout, sc)
        pr = average_precision_score(y_holdout, sc)
        holdout_auc_results[name] = {'roc_auc': round(roc, 4), 'pr_auc': round(pr, 4)}
        print(f"  {name:<42}: ROC-AUC = {roc:.4f} | PR-AUC = {pr:.4f}")

    # =========================================================================
    # PART 5: SAVE STRUCTURED REPORT
    # =========================================================================
    report = {
        'dev_summary': {
            'total_accounts': len(y_dev),
            'mules': dev_mules,
            'legit': dev_legit
        },
        'holdout_summary': {
            'total_accounts': len(y_holdout),
            'mules': holdout_mules,
            'legit': holdout_legit
        },
        'issue_a_threshold_audit': {
            'gate_030_candidate_count': s1_pass_030_cnt,
            'gate_007_candidate_count': s1_pass_007_cnt,
            'p2_retrained_alerts_050': int(p2_alerts_050.sum()),
            'p3_retrained_alerts_050': int(p3_alerts_050.sum()),
            'p4_fixed_alerts_050': int(p4_alerts_050.sum()),
            'p2_retrained_alerts_040': int(p2_alerts_040.sum()),
            'p3_retrained_alerts_040': int(p3_alerts_040.sum()),
            'p4_fixed_alerts_040': int(p4_alerts_040.sum())
        },
        'dev_matched_capacity': dev_ranking_results,
        'dev_auc': auc_results,
        'holdout_matched_capacity': holdout_ranking_results,
        'holdout_auc': holdout_auc_results
    }

    OUT_DIR.mkdir(exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    print(f"\n[REPORT SAVED] Results written to: {OUT_FILE}\n")

if __name__ == '__main__':
    main()
