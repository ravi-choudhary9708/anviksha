"""
Anviksha — SOA-Native Fraud Scorer
====================================
Trains entirely on the 25 SOA Excel files.
No external labels, no old DataSet.csv.

Approach: Unsupervised Anomaly Detection
  - Reads raw transactions from all SOA files
  - Engineers 20 behavioural features that capture mule patterns
    (passthrough, structuring, fan-in, velocity, round-amounts, etc.)
  - Trains Isolation Forest to score each account by suspiciousness
  - Optionally trains XGBoost using Isolation Forest pseudo-labels
  - Exports ONNX model + feature_config.json + ranked results CSV

Usage:
    pip install xgboost scikit-learn pandas numpy openpyxl xlrd python-calamine
    python server/ml/soa_native_train.py

Outputs:
    server/ml/models/isolation_forest.onnx
    server/ml/models/xgboost_fraud.onnx   (pseudo-labelled)
    server/ml/models/feature_config.json
    server/ml/models/training_metrics.json
    server/ml/DataSet_SOA.csv             (engineered features)
    public/soa_fraud_scores.csv           (ranked account scores)
"""

import os, sys, json, warnings, time
import numpy as np
import pandas as pd
from pathlib import Path

warnings.filterwarnings('ignore')

SCRIPT_DIR  = Path(__file__).parent
ROOT_DIR    = SCRIPT_DIR.parent.parent
PUBLIC_DIR  = ROOT_DIR / 'public'
MODELS_DIR  = SCRIPT_DIR / 'models'
DATASET_OUT = SCRIPT_DIR / 'DataSet_SOA.csv'
SCORES_OUT  = PUBLIC_DIR / 'soa_fraud_scores.csv'


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: LOAD RAW SOA TRANSACTIONS
# ══════════════════════════════════════════════════════════════════════════════

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Detect schema variant and map to canonical column names."""
    cols = set(df.columns)

    def pick(candidates):
        for c in candidates:
            if c in cols:
                return df[c].copy()
        return pd.Series([np.nan] * len(df), dtype=object)

    out = pd.DataFrame()

    # account_id
    if 'Ac_No' in cols:
        out['account_id'] = pick(['Ac_No'])
    elif 'Account No' in cols:
        out['account_id'] = pick(['Account No'])
    elif 'Account_Number' in cols:
        out['account_id'] = pick(['Account_Number'])
    elif 'ACCOUNT NO' in cols:
        out['account_id'] = pick(['ACCOUNT NO'])
    else:
        out['account_id'] = 'UNKNOWN'

    out['account_name'] = pick(['AC_Name', 'Account Name', 'Customer_Name', 'CUSTOMER NAME'])

    # transaction date
    out['txn_date'] = pick([
        'Tran_Date', 'TXN DATE', 'Date_of_transaction',
        'TRANSACTION DATE', 'value_dt', 'pstd_dt'
    ])

    # debit / credit amounts
    if 'Dr_Amt' in cols:
        out['debit']  = pd.to_numeric(pick(['Dr_Amt']),  errors='coerce').fillna(0)
        out['credit'] = pd.to_numeric(pick(['Cr_Amt']),  errors='coerce').fillna(0)
    elif 'Debit_amount' in cols:
        out['debit']  = pd.to_numeric(pick(['Debit_amount']),  errors='coerce').fillna(0)
        out['credit'] = pd.to_numeric(pick(['Credit_Amount']), errors='coerce').fillna(0)
    elif 'DEBIT AMOUNT' in cols:
        out['debit']  = pd.to_numeric(pick(['DEBIT AMOUNT']),  errors='coerce').fillna(0)
        out['credit'] = pd.to_numeric(pick(['CREDIT AMOUNT']), errors='coerce').fillna(0)
    elif 'AMOUNT' in cols:
        amount = pd.to_numeric(pick(['AMOUNT']), errors='coerce').fillna(0)
        dr_cr  = pick(['Dr Cr', 'Ankit Pandey']).astype(str).str.strip().str.upper()
        out['debit']  = np.where(dr_cr == 'D', amount, 0.0)
        out['credit'] = np.where(dr_cr == 'C', amount, 0.0)
    else:
        out['debit'] = out['credit'] = 0.0

    out['balance']  = pd.to_numeric(
        pick(['Balance', 'EOD Balance', 'Available Balance', 'Line_Balance']),
        errors='coerce'
    ).fillna(0)
    out['narration']    = pick(['Narration', 'TXN PARTICULARS', 'TXN REMARKS',
                                 'Rmks', 'NARRATION']).fillna('').astype(str)
    out['txn_type']     = pick(['Tran_Type', 'TXN TYP', 'Transaction_type',
                                 'TXN SUB TYP']).fillna('').astype(str)
    out['open_date']    = pick(['A/c Open Date'])
    out['acct_status']  = pick(['A/C Status']).fillna('').astype(str)
    out['source_file']  = ''
    return out


def parse_txn_date(series: pd.Series) -> pd.Series:
    """Parse heterogeneous date column to datetime, vectorised."""
    result = pd.to_datetime(series, errors='coerce', dayfirst=True)

    # Fix Excel serial numbers (e.g. 44624)
    numeric_mask = result.isna() & series.astype(str).str.match(r'^\d{5,6}$')
    if numeric_mask.any():
        serial = pd.to_numeric(series[numeric_mask], errors='coerce')
        result[numeric_mask] = pd.Timestamp('1899-12-30') + pd.to_timedelta(serial, unit='D')

    # Fix DDMMMYYYY:HH:MM:SS strings (e.g. "27AUG2020:13:42:17")
    str_mask = result.isna() & series.astype(str).str.match(r'^\d{2}[A-Z]{3}\d{4}')
    if str_mask.any():
        result[str_mask] = pd.to_datetime(
            series[str_mask].astype(str).str[:9], format='%d%b%Y', errors='coerce'
        )
    return result


def load_all_soa_files() -> pd.DataFrame:
    files = sorted([
        f for f in PUBLIC_DIR.iterdir()
        if f.suffix.lower() in ('.xls', '.xlsx') and not f.name.startswith('~')
    ])
    print(f"[1/4] Found {len(files)} SOA files in public/")

    chunks = []
    for fpath in files:
        engine = 'openpyxl' if fpath.suffix.lower() == '.xlsx' else 'calamine'
        try:
            raw = pd.read_excel(fpath, engine=engine)
        except Exception:
            try:
                raw = pd.read_excel(fpath)
            except Exception as e:
                print(f"  SKIP {fpath.name}: {e}")
                continue

        df = normalize_columns(raw)
        df['source_file'] = fpath.name
        print(f"  {fpath.name}: {len(df):,} rows")
        chunks.append(df)

    combined = pd.concat(chunks, ignore_index=True)

    # Clean account IDs
    combined['account_id'] = combined['account_id'].astype(str).str.strip()
    combined = combined[~combined['account_id'].isin(['nan', '', 'UNKNOWN', 'NaN'])].copy()

    # Numeric enforcement
    for col in ['debit', 'credit', 'balance']:
        combined[col] = pd.to_numeric(combined[col], errors='coerce').fillna(0).clip(lower=0)

    # Parse dates
    combined['txn_date'] = parse_txn_date(combined['txn_date'])

    print(f"\n  Total transactions: {len(combined):,}")
    print(f"  Unique accounts  : {combined['account_id'].nunique():,}")
    return combined


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: ENGINEER BEHAVIOURAL FEATURES (20 mule-signal features)
# ══════════════════════════════════════════════════════════════════════════════

def engineer_features(txns: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate raw transactions per account into 20 behavioural fraud features.
    All features are designed to capture known mule-account patterns:
      - Passthrough (rapid receive → send)
      - Round-amount structuring
      - Fan-in (many sources, few destinations)
      - Velocity bursts
      - Balance volatility
      - Account dormancy patterns
    """
    print("[2/4] Engineering 20 behavioural features per account...")
    t0 = time.time()

    g = txns.groupby('account_id')

    # ── Core stats ─────────────────────────────────────────────────────────
    base = g.agg(
        txn_count       = ('credit',    'count'),
        total_credit    = ('credit',    'sum'),
        total_debit     = ('debit',     'sum'),
        max_credit      = ('credit',    'max'),
        max_debit       = ('debit',     'max'),
        mean_balance    = ('balance',   'mean'),
        std_balance     = ('balance',   'std'),
        min_balance     = ('balance',   'min'),
        max_balance     = ('balance',   'max'),
        unique_narr     = ('narration', 'nunique'),
    ).reset_index()
    base['std_balance'] = base['std_balance'].fillna(0)

    # ── Credit / debit counts ──────────────────────────────────────────────
    cr_counts = g['credit'].apply(lambda s: (s > 0).sum()).reset_index()
    cr_counts.columns = ['account_id', 'cr_count']
    dr_counts = g['debit'].apply(lambda s: (s > 0).sum()).reset_index()
    dr_counts.columns = ['account_id', 'dr_count']
    base = base.merge(cr_counts, on='account_id').merge(dr_counts, on='account_id')

    # ── Date range & velocity ──────────────────────────────────────────────
    date_stats = g['txn_date'].agg(['min', 'max']).reset_index()
    date_stats.columns = ['account_id', 'first_txn', 'last_txn']
    date_stats['date_range_days'] = (
        (date_stats['last_txn'] - date_stats['first_txn']).dt.days.fillna(0).clip(lower=1)
    )
    base = base.merge(date_stats[['account_id', 'date_range_days']], on='account_id')
    base['txns_per_day'] = base['txn_count'] / base['date_range_days']

    # ── Round-amount structuring ratio ────────────────────────────────────
    def round_amt_ratio(grp):
        amounts = grp['credit'] + grp['debit']
        n = len(amounts)
        if n == 0:
            return 0.0
        rounds = ((amounts > 0) & (amounts % 1000 < 1)).sum()
        return float(rounds / n)

    round_ratios = g.apply(round_amt_ratio).reset_index()
    round_ratios.columns = ['account_id', 'round_amt_ratio']
    base = base.merge(round_ratios, on='account_id')

    # ── Passthrough score: debits relative to credits ─────────────────────
    base['passthrough_score'] = (
        base['total_debit'] / (base['total_credit'] + 1)
    ).clip(0, 10)

    # ── Balance volatility (CV of balance) ───────────────────────────────
    base['balance_cv'] = (
        base['std_balance'] / (base['mean_balance'].abs() + 1)
    ).clip(0, 100)

    # ── Fan-in proxy: unique credit narrations per credit txn ────────────
    base['fan_in_score'] = (
        base['unique_narr'] / (base['cr_count'] + 1)
    ).clip(0, 1)

    # ── Avg amount per transaction ────────────────────────────────────────
    total_flow = base['total_credit'] + base['total_debit']
    base['avg_txn_amount'] = (total_flow / (base['txn_count'] + 1)).clip(0)

    # ── Credit concentration (max credit as fraction of total) ────────────
    base['credit_concentration'] = (
        base['max_credit'] / (base['total_credit'] + 1)
    ).clip(0, 1)

    # ── Net flow ratio (positive = net receiver, negative = net sender) ───
    base['net_flow_ratio'] = (
        (base['total_credit'] - base['total_debit'])
        / (base['total_credit'] + base['total_debit'] + 1)
    ).clip(-1, 1)

    # ── Account age bucket (encoded) ─────────────────────────────────────
    base['age_bucket'] = pd.cut(
        base['date_range_days'],
        bins=[-1, 30, 90, 180, 365, np.inf],
        labels=[0, 1, 2, 3, 4]
    ).astype(float).fillna(0)

    # ── Velocity burst: max txns in any 7-day rolling window ──────────────
    print("  Computing 7-day velocity bursts (vectorised)...")

    def max_7day_velocity(grp):
        dates = grp['txn_date'].dropna().dt.normalize()
        if len(dates) < 2:
            return float(len(dates))
        counts = dates.value_counts().sort_index()
        if len(counts) < 2:
            return float(counts.iloc[0])
        counts_df = counts.reset_index()
        counts_df.columns = ['date', 'cnt']
        counts_df = counts_df.set_index('date').resample('D').sum().fillna(0)
        rolling = counts_df['cnt'].rolling('7D').sum()
        return float(rolling.max())

    velocity = g.apply(max_7day_velocity).reset_index()
    velocity.columns = ['account_id', 'max_7d_velocity']
    base = base.merge(velocity, on='account_id')

    # ── Sub-threshold amount flag (structuring <50k) ─────────────────────
    def subthreshold_ratio(grp):
        cr = grp['credit']
        n = (cr > 0).sum()
        if n == 0:
            return 0.0
        sub = ((cr > 0) & (cr < 50000)).sum()
        return float(sub / n)

    sub_ratios = g.apply(subthreshold_ratio).reset_index()
    sub_ratios.columns = ['account_id', 'subthreshold_ratio']
    base = base.merge(sub_ratios, on='account_id')

    print(f"  Feature engineering done in {time.time() - t0:.1f}s")
    return base


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: TRAIN ISOLATION FOREST + XGBoost (pseudo-labels)
# ══════════════════════════════════════════════════════════════════════════════

FEATURE_COLS = [
    'txn_count', 'total_credit', 'total_debit',
    'max_credit', 'max_debit',
    'cr_count', 'dr_count',
    'passthrough_score',
    'round_amt_ratio',
    'balance_cv',
    'fan_in_score',
    'avg_txn_amount',
    'credit_concentration',
    'net_flow_ratio',
    'age_bucket',
    'txns_per_day',
    'max_7d_velocity',
    'subthreshold_ratio',
    'std_balance',
    'unique_narr',
]


def train_models(feat_df: pd.DataFrame):
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import RobustScaler
    from sklearn.metrics import roc_auc_score

    print("\n[3/4] Training models on SOA behavioural features...")

    X_raw = feat_df[FEATURE_COLS].fillna(0).values.astype(np.float32)

    # Robust scaling (handles outlier balances / amounts)
    scaler = RobustScaler()
    X = scaler.fit_transform(X_raw).astype(np.float32)

    n_accounts = len(X)
    # Contamination: we assume ~30% of investigated accounts show anomalous behaviour
    contamination = 0.30
    print(f"  Accounts: {n_accounts:,}  |  Isolation Forest contamination={contamination}")

    iso = IsolationForest(
        n_estimators=300,
        contamination=contamination,
        max_samples=min(n_accounts, 10000),
        max_features=len(FEATURE_COLS),
        random_state=42,
        n_jobs=-1
    )
    iso.fit(X)

    # Anomaly score: higher = more suspicious (0-100 scale)
    raw_scores = iso.decision_function(X)          # negative = more anomalous
    iso_labels  = (iso.predict(X) == -1).astype(int)  # 1=anomaly, 0=normal

    # Normalise to 0-100 fraud score
    s_min, s_max = raw_scores.min(), raw_scores.max()
    fraud_scores = 100 * (1 - (raw_scores - s_min) / (s_max - s_min + 1e-9))

    print(f"  Isolation Forest: flagged {iso_labels.sum():,} anomalies "
          f"({iso_labels.mean()*100:.1f}%)")
    print(f"  Score range: {fraud_scores.min():.1f} – {fraud_scores.max():.1f}")

    # ── XGBoost on pseudo-labels from Isolation Forest ───────────────────
    print("\n  Training XGBoost on Isolation Forest pseudo-labels...")
    try:
        from xgboost import XGBClassifier
        from sklearn.model_selection import StratifiedKFold
        from sklearn.metrics import roc_auc_score, average_precision_score, classification_report

        # Use top/bottom quartile as confident pseudo-labels (ignore ambiguous middle)
        high_thresh = np.percentile(fraud_scores, 75)
        low_thresh  = np.percentile(fraud_scores, 25)
        confident_mask = (fraud_scores >= high_thresh) | (fraud_scores <= low_thresh)
        pseudo_labels  = (fraud_scores >= high_thresh).astype(int)

        X_conf = X[confident_mask]
        y_conf = pseudo_labels[confident_mask]

        n0, n1 = (y_conf==0).sum(), (y_conf==1).sum()
        spw = n0 / max(n1, 1)
        print(f"  Pseudo-label set: {len(X_conf):,} accounts | "
              f"Suspicious: {n1:,} | Normal: {n0:,} | scale_pos_weight={spw:.2f}")

        skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        oof_probs = np.zeros(len(X_conf))
        fold_rocs = []

        for fold, (tr_idx, te_idx) in enumerate(skf.split(X_conf, y_conf), 1):
            clf = XGBClassifier(
                n_estimators=200, max_depth=5, learning_rate=0.05,
                scale_pos_weight=spw, subsample=0.8, colsample_bytree=0.8,
                min_child_weight=3, random_state=42 + fold,
                eval_metric='aucpr', n_jobs=-1, tree_method='hist',
                verbosity=0
            )
            clf.fit(X_conf[tr_idx], y_conf[tr_idx])
            oof_probs[te_idx] = clf.predict_proba(X_conf[te_idx])[:, 1]
            fold_rocs.append(roc_auc_score(y_conf[te_idx], oof_probs[te_idx]))
            print(f"    Fold {fold}: ROC-AUC={fold_rocs[-1]:.4f}")

        pooled_roc = roc_auc_score(y_conf, oof_probs)
        pooled_pr  = average_precision_score(y_conf, oof_probs)
        print(f"\n  Pooled ROC-AUC : {pooled_roc:.4f}")
        print(f"  Pooled PR-AUC  : {pooled_pr:.4f}")

        # Retrain on full confident set
        xgb_final = XGBClassifier(
            n_estimators=250, max_depth=5, learning_rate=0.04,
            scale_pos_weight=spw, subsample=0.8, colsample_bytree=0.8,
            min_child_weight=3, random_state=42,
            eval_metric='aucpr', n_jobs=-1, tree_method='hist', verbosity=0
        )
        xgb_final.fit(X_conf, y_conf)

        # Fused score: blend IF score with XGBoost probability
        xgb_probs_all = xgb_final.predict_proba(X)[:, 1]
        fused_scores = 0.6 * fraud_scores / 100 + 0.4 * xgb_probs_all
        fused_scores = (fused_scores * 100).clip(0, 100)

        feat_importance = {
            col: round(float(imp), 6)
            for col, imp in zip(FEATURE_COLS, xgb_final.feature_importances_)
        }

    except ImportError:
        print("  [WARN] XGBoost not available — using Isolation Forest only.")
        xgb_final     = None
        xgb_probs_all = np.zeros(len(X))
        fused_scores  = fraud_scores.copy()
        pooled_roc    = 0.0
        pooled_pr     = 0.0
        feat_importance = {col: 0.0 for col in FEATURE_COLS}

    return {
        'iso_model':       iso,
        'xgb_model':       xgb_final,
        'scaler':          scaler,
        'iso_scores':      fraud_scores,
        'fused_scores':    fused_scores,
        'iso_labels':      iso_labels,
        'pooled_roc':      pooled_roc,
        'pooled_pr':       pooled_pr,
        'feat_importance': feat_importance,
        'contamination':   contamination,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: EXPORT MODELS + RESULTS
# ══════════════════════════════════════════════════════════════════════════════

def export_results(feat_df, results):
    print("\n[4/4] Exporting models, configs, and scored accounts...")
    MODELS_DIR.mkdir(exist_ok=True)

    iso      = results['iso_model']
    xgb      = results['xgb_model']
    scaler   = results['scaler']
    n_feat   = len(FEATURE_COLS)

    # ── ONNX export ────────────────────────────────────────────────────────
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType

        print("  Exporting Isolation Forest → ONNX...")
        onnx_iso = convert_sklearn(
            iso,
            initial_types=[('float_input', FloatTensorType([None, n_feat]))],
            target_opset={'': 12, 'ai.onnx.ml': 3}
        )
        with open(MODELS_DIR / 'isolation_forest.onnx', 'wb') as f:
            f.write(onnx_iso.SerializeToString())
        print(f"  Saved: {MODELS_DIR}/isolation_forest.onnx")

        if xgb is not None:
            from onnxmltools import convert_xgboost
            from onnxmltools.convert.common.data_types import FloatTensorType as OFT
            print("  Exporting XGBoost → ONNX...")
            onnx_xgb = convert_xgboost(
                xgb,
                initial_types=[('float_input', OFT([None, n_feat]))],
                target_opset=12
            )
            with open(MODELS_DIR / 'xgboost_fraud.onnx', 'wb') as f:
                f.write(onnx_xgb.SerializeToString())
            print(f"  Saved: {MODELS_DIR}/xgboost_fraud.onnx")

    except ImportError as e:
        print(f"  [WARN] ONNX export skipped ({e}). Install: pip install skl2onnx onnxmltools")
    except Exception as e:
        print(f"  [WARN] ONNX export error: {e}")

    # ── Scaler params (needed for Node.js inference) ───────────────────────
    scaler_params = {
        'center':    scaler.center_.tolist(),
        'scale':     scaler.scale_.tolist(),
        'feature_names': FEATURE_COLS,
    }

    # ── feature_config.json ────────────────────────────────────────────────
    top_feats = sorted(results['feat_importance'].items(), key=lambda x: x[1], reverse=True)
    config = {
        'feature_names':     FEATURE_COLS,
        'feature_count':     n_feat,
        'feature_importance': results['feat_importance'],
        'top_10_features':   [f for f, _ in top_feats[:10]],
        'scaler':            scaler_params,
        'thresholds': {
            'critical': 70,
            'high':     50,
            'medium':   30,
            'low':       0,
        },
        'model_info': {
            'approach':     'Unsupervised (Isolation Forest) + XGBoost on pseudo-labels',
            'dataset':      'SOA Excel files — 25 files, 494,276 transactions, 254,597 accounts',
            'contamination': results['contamination'],
            'trained_at':   pd.Timestamp.now().isoformat(),
        }
    }
    with open(MODELS_DIR / 'feature_config.json', 'w') as f:
        json.dump(config, f, indent=2)
    print(f"  Saved: {MODELS_DIR}/feature_config.json")

    # ── training_metrics.json ──────────────────────────────────────────────
    metrics = {
        'dataset':             'SOA Excel files (25 files, 494,276 transactions)',
        'accounts_trained':    len(feat_df),
        'anomalies_detected':  int(results['iso_labels'].sum()),
        'anomaly_rate':        round(float(results['iso_labels'].mean() * 100), 2),
        'xgb_roc_auc':        round(float(results['pooled_roc']), 4),
        'xgb_pr_auc':         round(float(results['pooled_pr']),  4),
        'iso_contamination':   results['contamination'],
        'score_min':           round(float(results['fused_scores'].min()), 2),
        'score_max':           round(float(results['fused_scores'].max()), 2),
        'score_mean':          round(float(results['fused_scores'].mean()), 2),
        'score_p75':           round(float(np.percentile(results['fused_scores'], 75)), 2),
        'score_p90':           round(float(np.percentile(results['fused_scores'], 90)), 2),
        'score_p95':           round(float(np.percentile(results['fused_scores'], 95)), 2),
        'top_10_features':    [f for f, _ in top_feats[:10]],
        'evaluation_type':    '5-Fold CV on Isolation Forest pseudo-labels',
    }
    with open(MODELS_DIR / 'training_metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f"  Saved: {MODELS_DIR}/training_metrics.json")

    # ── Ranked account scores CSV ──────────────────────────────────────────
    scores_df = feat_df[['account_id', 'account_name']].copy() if 'account_name' in feat_df.columns \
                else feat_df[['account_id']].copy()

    scores_df['iso_fraud_score'] = results['iso_scores'].round(2)
    scores_df['fused_score']     = results['fused_scores'].round(2)
    scores_df['is_anomaly']      = results['iso_labels']
    scores_df['risk_level']      = pd.cut(
        results['fused_scores'],
        bins=[-1, 30, 50, 70, 101],
        labels=['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    )
    scores_df = scores_df.sort_values('fused_score', ascending=False).reset_index(drop=True)
    scores_df.to_csv(SCORES_OUT, index=False)
    print(f"  Saved: {SCORES_OUT}")

    # ── Print top 20 suspicious accounts ──────────────────────────────────
    print("\n  === TOP 20 HIGHEST RISK ACCOUNTS ===")
    print(f"  {'Account ID':<20} {'Score':>6}  {'Risk':<10}")
    print(f"  {'-'*42}")
    for _, row in scores_df.head(20).iterrows():
        name = str(row.get('account_name', ''))[:18] if 'account_name' in row else ''
        print(f"  {str(row['account_id']):<20} {row['fused_score']:>6.1f}  {str(row['risk_level']):<10}  {name}")

    # ── Summary stats ──────────────────────────────────────────────────────
    risk_counts = scores_df['risk_level'].value_counts()
    print(f"\n  === RISK DISTRIBUTION ===")
    for level in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
        cnt = risk_counts.get(level, 0)
        pct = cnt / len(scores_df) * 100
        bar = '█' * int(pct / 2)
        print(f"  {level:<10} {cnt:>7,} accounts ({pct:5.1f}%)  {bar}")

    return scores_df


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    total_start = time.time()
    print("=" * 65)
    print("  Anviksha — SOA Native Fraud Scorer")
    print("  Training entirely on SOA Excel dataset")
    print("=" * 65)

    # 1. Load raw transactions
    txns = load_all_soa_files()

    # 2. Engineer behavioural features
    feat_df = engineer_features(txns)

    # Attach account name for reporting
    name_map = txns.groupby('account_id')['account_name'].first().reset_index()
    feat_df = feat_df.merge(name_map, on='account_id', how='left')

    # Save engineered features
    feat_df[['account_id'] + FEATURE_COLS].to_csv(DATASET_OUT, index=False)
    print(f"\n  Saved feature dataset: {DATASET_OUT} ({len(feat_df):,} accounts × {len(FEATURE_COLS)} features)")

    # 3. Train Isolation Forest + XGBoost
    results = train_models(feat_df)

    # 4. Export everything
    scores_df = export_results(feat_df, results)

    elapsed = time.time() - total_start
    print(f"\n{'='*65}")
    print(f"  ✅ Complete in {elapsed:.1f}s")
    print(f"  Accounts scored  : {len(feat_df):,}")
    print(f"  CRITICAL risk    : {(scores_df['risk_level']=='CRITICAL').sum():,}")
    print(f"  HIGH risk        : {(scores_df['risk_level']=='HIGH').sum():,}")
    print(f"  XGBoost ROC-AUC  : {results['pooled_roc']:.4f}")
    print(f"  Models in        : {MODELS_DIR}/")
    print(f"  Scores CSV       : {SCORES_OUT}")
    print(f"{'='*65}")
