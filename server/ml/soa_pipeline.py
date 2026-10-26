"""
Anviksha — SOA Feature Extractor & Dataset Builder
===================================================
Reads all 25 SOA Excel files from public/, aggregates transactions
into account-level features matching the BOI golden feature schema,
then trains the Two-Stage Cascade XGBoost model.

Usage:
    python server/ml/soa_pipeline.py

Output:
    server/ml/DataSet_SOA.csv          <- New dataset from SOA files
    server/ml/models/xgboost_fraud.onnx
    server/ml/models/isolation_forest.onnx
    server/ml/models/feature_config.json
    server/ml/models/training_metrics.json
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

warnings.filterwarnings('ignore')

# ==============================================================================
# PATHS
# ==============================================================================
SCRIPT_DIR  = Path(__file__).parent
ROOT_DIR    = SCRIPT_DIR.parent.parent
PUBLIC_DIR  = ROOT_DIR / 'public'
OUTPUT_CSV  = SCRIPT_DIR / 'DataSet_SOA.csv'
MODELS_DIR  = SCRIPT_DIR / 'models'


def detect_schema_and_normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Detect which schema this file belongs to and normalize column names."""
    cols = set(df.columns)
    result = pd.DataFrame()

    def find_col(candidates):
        for c in candidates:
            if c in cols:
                return df[c]
        return pd.Series([np.nan] * len(df))

    # ---- account_id ----
    if 'Ac_No' in cols:
        result['account_id'] = find_col(['Ac_No'])
    elif 'Account No' in cols:
        result['account_id'] = find_col(['Account No'])
    elif 'Account_Number' in cols:
        result['account_id'] = find_col(['Account_Number'])
    elif 'ACCOUNT NO' in cols:
        result['account_id'] = find_col(['ACCOUNT NO'])
    else:
        result['account_id'] = 'UNKNOWN'

    result['account_name'] = find_col(['AC_Name', 'Account Name', 'Customer_Name', 'CUSTOMER NAME'])

    # ---- txn date ----
    result['txn_date'] = find_col([
        'Tran_Date', 'TXN DATE', 'Date_of_transaction', 'TRANSACTION DATE', 'value_dt', 'pstd_dt'
    ])

    # ---- debit / credit ----
    if 'Dr_Amt' in cols:
        result['debit']  = pd.to_numeric(find_col(['Dr_Amt']),  errors='coerce').fillna(0)
        result['credit'] = pd.to_numeric(find_col(['Cr_Amt']),  errors='coerce').fillna(0)
    elif 'Debit_amount' in cols:
        result['debit']  = pd.to_numeric(find_col(['Debit_amount']),  errors='coerce').fillna(0)
        result['credit'] = pd.to_numeric(find_col(['Credit_Amount']), errors='coerce').fillna(0)
    elif 'DEBIT AMOUNT' in cols:
        result['debit']  = pd.to_numeric(find_col(['DEBIT AMOUNT']),  errors='coerce').fillna(0)
        result['credit'] = pd.to_numeric(find_col(['CREDIT AMOUNT']), errors='coerce').fillna(0)
    elif 'AMOUNT' in cols:
        amount = pd.to_numeric(find_col(['AMOUNT']), errors='coerce').fillna(0)
        dr_cr  = find_col(['Dr Cr', 'Ankit Pandey']).astype(str).str.strip().str.upper()
        result['debit']  = np.where(dr_cr == 'D', amount, 0.0)
        result['credit'] = np.where(dr_cr == 'C', amount, 0.0)
    else:
        result['debit']  = 0.0
        result['credit'] = 0.0

    # ---- balance ----
    result['balance'] = pd.to_numeric(
        find_col(['Balance', 'EOD Balance', 'Available Balance', 'Line_Balance']),
        errors='coerce'
    ).fillna(0)

    # ---- narration / type ----
    result['narration']   = find_col(['Narration', 'TXN PARTICULARS', 'TXN REMARKS', 'Rmks', 'NARRATION']).astype(str)
    result['txn_type']    = find_col(['Tran_Type', 'TXN TYP', 'Transaction_type']).astype(str)
    result['open_date']   = find_col(["A/c Open Date"])
    result['acct_status'] = find_col(["A/C Status"]).astype(str)

    return result


def parse_date_safe(val):
    """Parse various date formats into a Timestamp."""
    if pd.isna(val):
        return pd.NaT
    if isinstance(val, (pd.Timestamp, datetime)):
        return pd.Timestamp(val)
    s = str(val).strip()
    # Excel serial number
    if s.isdigit() and len(s) <= 6:
        try:
            return pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(s))
        except Exception:
            pass
    for fmt in ('%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y',
                '%d%b%Y', '%d%b%Y:%H:%M:%S', '%d-%b-%Y', '%B %d, %Y'):
        try:
            return pd.Timestamp(datetime.strptime(s[:20].upper(), fmt.upper()))
        except Exception:
            pass
    try:
        return pd.to_datetime(s, infer_datetime_format=True, dayfirst=True)
    except Exception:
        return pd.NaT


def load_soa_file(filepath: Path) -> pd.DataFrame:
    """Load a single SOA file."""
    engine = 'openpyxl' if filepath.suffix.lower() == '.xlsx' else 'calamine'
    try:
        df = pd.read_excel(filepath, engine=engine)
    except Exception:
        try:
            df = pd.read_excel(filepath)
        except Exception as e:
            print(f"    WARNING: Could not read {filepath.name}: {e}")
            return pd.DataFrame()

    df = detect_schema_and_normalize(df)
    df['source_file'] = filepath.name
    return df


def vectorized_aggregate(combined: pd.DataFrame, label: int = 1) -> pd.DataFrame:
    """
    Fully vectorized account-level feature aggregation using pandas groupby.
    50-100x faster than a per-account Python loop.
    """
    print("  Computing numeric aggregations...", flush=True)
    grp = combined.groupby('account_id')

    # ---- Core numeric aggregations ----
    agg = grp.agg(
        total_cr   =('credit',  'sum'),
        total_dr   =('debit',   'sum'),
        n_txns     =('credit',  'count'),
        max_cr     =('credit',  'max'),
        max_dr     =('debit',   'max'),
        bal_std    =('balance', 'std'),
        bal_min    =('balance', 'min'),
        bal_max    =('balance', 'max'),
        unique_narr=('narration', 'nunique'),
    ).reset_index()
    agg['bal_std'] = agg['bal_std'].fillna(0)

    # Credit/debit transaction counts (boolean sum)
    agg['n_cr'] = grp.apply(lambda g: (g['credit'] > 0).sum()).values
    agg['n_dr'] = grp.apply(lambda g: (g['debit']  > 0).sum()).values

    # Average credit/debit (conditional means)
    agg['avg_cr'] = grp.apply(
        lambda g: g.loc[g['credit'] > 0, 'credit'].mean() if (g['credit'] > 0).any() else 0
    ).values
    agg['avg_dr'] = grp.apply(
        lambda g: g.loc[g['debit']  > 0, 'debit'].mean()  if (g['debit']  > 0).any() else 0
    ).values
    agg['avg_cr'] = agg['avg_cr'].fillna(0)
    agg['avg_dr'] = agg['avg_dr'].fillna(0)

    # ---- Date range per account ----
    print("  Computing date ranges...", flush=True)
    combined['txn_date_parsed'] = pd.to_datetime(combined['txn_date'], errors='coerce', dayfirst=True)

    # Handle Excel serial numbers
    is_numeric_date = combined['txn_date'].astype(str).str.match(r'^\d{5,6}$')
    serial_dates = pd.to_numeric(combined.loc[is_numeric_date, 'txn_date'], errors='coerce')
    combined.loc[is_numeric_date, 'txn_date_parsed'] = (
        pd.Timestamp('1899-12-30') + pd.to_timedelta(serial_dates, unit='D')
    )

    date_grp = combined.groupby('account_id')['txn_date_parsed'].agg(['min', 'max'])
    date_grp['date_range_days'] = (date_grp['max'] - date_grp['min']).dt.days.fillna(0).clip(lower=0)
    agg = agg.merge(date_grp[['date_range_days']].reset_index(), on='account_id', how='left')
    agg['date_range_days'] = agg['date_range_days'].fillna(0)

    # ---- Narration-based scheme classification ----
    print("  Classifying account schemes from narrations...", flush=True)
    narr_concat = combined.groupby('account_id')['narration'].apply(
        lambda s: ' '.join(s.astype(str))
    ).str.lower().reset_index()
    narr_concat.columns = ['account_id', 'narr_text']

    def classify_scheme(txt):
        if any(k in txt for k in ['salary', 'payroll', 'neft']):
            return 'salaried'
        if any(k in txt for k in ['business', 'trade', 'vendor']):
            return 'business'
        if any(k in txt for k in ['student', 'college']):
            return 'student'
        if any(k in txt for k in ['agri', 'kisan', 'farm']):
            return 'agriculture'
        return 'general'

    narr_concat['scheme'] = narr_concat['narr_text'].apply(classify_scheme)
    agg = agg.merge(narr_concat[['account_id', 'scheme']], on='account_id', how='left')
    agg['scheme'] = agg['scheme'].fillna('general')

    # ---- Derived features (vectorized math) ----
    print("  Computing derived BOI features...", flush=True)
    obs_days = agg['date_range_days'].clip(lower=1)

    agg['F115']  = (np.log1p(agg['total_cr']) / 20.0).clip(upper=1.0).round(4)
    agg['F321']  = (np.log1p(agg['total_dr']) / 15.0).clip(upper=10.6).round(4)
    agg['F527']  = (np.log1p(agg['n_txns'])   / 4.0 ).clip(upper=48.42).round(4)
    agg['F531']  = (np.log1p(agg['n_cr'])     / 3.5 ).clip(upper=20.96).round(4)
    agg['F670']  = (agg['n_dr'] > 5).astype(int)
    agg['F1692'] = agg['unique_narr'].clip(upper=14).astype(int)
    agg['F2082'] = (agg['avg_cr'] / (agg['total_cr'] + 1)).clip(upper=1.0).round(4)
    agg['F2122'] = (agg['avg_dr'] / (agg['total_dr'] + 1)).clip(upper=1.0).round(4)
    agg['F2582'] = (np.log1p(agg['max_cr']) / 15.0).clip(upper=18.89).round(4)
    agg['F2678'] = agg['max_dr'].clip(upper=1626943.0).round(4)
    agg['F2737'] = (np.log1p(agg['bal_std'].abs()) / 7.0).clip(upper=1707.6).round(4)
    agg['F2956'] = agg['bal_min'].clip(lower=0).astype(int)
    agg['F3043'] = agg['bal_max'].clip(lower=0).astype(int)
    agg['F3836'] = (agg['total_cr'] - agg['total_dr']).round(2)
    agg['F3887'] = ((agg['n_txns'] * 365 / obs_days)).clip(upper=1510).astype(int)

    # Age category (vectorized)
    agg['F3889'] = pd.cut(
        agg['date_range_days'],
        bins=[-1, 30, 90, 365, np.inf],
        labels=['L90D', 'G30D', 'G90D', 'G365D']
    ).astype(str)

    agg['F3891'] = agg['scheme']

    turnover = agg['total_dr'] / (agg['total_cr'] + 1)
    agg['F3894'] = (turnover * 10).clip(upper=94).astype(int)
    agg['F3924'] = label

    feature_cols = [
        'F115', 'F321', 'F527', 'F531', 'F670', 'F1692',
        'F2082', 'F2122', 'F2582', 'F2678', 'F2737', 'F2956',
        'F3043', 'F3836', 'F3887', 'F3889', 'F3891', 'F3894', 'F3924'
    ]
    return agg[feature_cols]


def run_extraction():
    """Step 1: Extract features from all SOA files (vectorized)."""
    import time
    t0 = time.time()

    print("=" * 65)
    print("  Anviksha — SOA Feature Extraction Pipeline (Vectorized)")
    print("=" * 65)

    soa_files = sorted([
        f for f in PUBLIC_DIR.iterdir()
        if f.suffix.lower() in ('.xls', '.xlsx') and not f.name.startswith('~')
    ])
    print(f"\n[1/4] Found {len(soa_files)} SOA files in public/")

    all_txns = []
    for fpath in soa_files:
        print(f"  Loading {fpath.name}...", end=' ', flush=True)
        df = load_soa_file(fpath)
        if df.empty:
            print("SKIPPED")
            continue
        print(f"{len(df):,} rows")
        all_txns.append(df)

    if not all_txns:
        print("ERROR: No valid SOA files found!")
        sys.exit(1)

    combined = pd.concat(all_txns, ignore_index=True)
    print(f"\n[2/4] Total raw transactions: {len(combined):,}")

    # Clean
    combined['account_id'] = combined['account_id'].astype(str).str.strip()
    combined = combined[~combined['account_id'].isin(['nan', '', 'UNKNOWN'])].copy()
    for col in ['debit', 'credit', 'balance']:
        combined[col] = pd.to_numeric(combined[col], errors='coerce').fillna(0)
    combined['narration'] = combined['narration'].astype(str)

    n_accounts = combined['account_id'].nunique()
    print(f"[3/4] Vectorized aggregation of {n_accounts:,} unique accounts...")

    save_df = vectorized_aggregate(combined, label=1)

    feature_cols = list(save_df.columns)
    print(f"\n[4/4] Created {len(save_df):,} account-level records in {time.time()-t0:.1f}s")
    print(f"  Mule accounts (F3924=1): {(save_df['F3924']==1).sum():,}")

    save_df.to_csv(OUTPUT_CSV, index=False)
    print(f"\nSaved: {OUTPUT_CSV}")
    print(f"  Shape: {save_df.shape}")

    print("\n=== Feature Statistics (SOA Dataset) ===")
    for col in feature_cols:
        try:
            print(f"  {col}: min={save_df[col].min()}, max={save_df[col].max()}, mean={save_df[col].mean():.3f}")
        except Exception:
            print(f"  {col} (cat): {save_df[col].value_counts().head(3).to_dict()}")

    return save_df


def run_training():
    """Step 2: Train model using train_model.py on the new SOA dataset."""
    print("\n" + "=" * 65)
    print("  Starting Model Training on SOA Dataset")
    print("=" * 65)

    sys.path.insert(0, str(SCRIPT_DIR))
    from train_model import (
        engineer_fraud_features, evaluate_stratified_kfold_cascade,
        train_production_models, export_models_and_config,
        BASE_GOLDEN_FEATURES, ALL_FEATURES, TARGET
    )
    from sklearn.preprocessing import LabelEncoder

    df = pd.read_csv(OUTPUT_CSV, low_memory=False)
    print(f"\nLoaded: {df.shape[0]:,} accounts, {df.shape[1]} features")
    print(f"Mule accounts: {df['F3924'].sum():,} / {len(df):,} ({df['F3924'].mean()*100:.2f}%)")

    for col in BASE_GOLDEN_FEATURES:
        if df[col].dtype == object:
            df[col] = df[col].fillna('UNKNOWN').astype(str)
        else:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    df = engineer_fraud_features(df)

    mappings = {}
    cat_cols = [c for c in BASE_GOLDEN_FEATURES if df[c].dtype == object]
    for col in cat_cols:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        mappings[col] = {str(c): int(v) for c, v in zip(le.classes_, le.transform(le.classes_))}

    X = df[ALL_FEATURES].values.astype(np.float32)
    y = df[TARGET].values.astype(int)

    n_mules = int(y.sum())
    n_splits = max(2, min(5, n_mules))
    print(f"\nRunning {n_splits}-fold Stratified Cross-Validation...")

    cv_metrics = evaluate_stratified_kfold_cascade(X, y, n_splits=n_splits, target_precision=0.75)
    s1_model, s2_model, iso_model = train_production_models(X, y)

    MODELS_DIR.mkdir(exist_ok=True)
    export_models_and_config(s1_model, s2_model, iso_model, cv_metrics, mappings, str(MODELS_DIR))

    print("\n" + "=" * 65)
    print("  Training Complete!")
    print(f"  ROC-AUC: {cv_metrics['pooled_roc_auc']:.4f}")
    print(f"  PR-AUC:  {cv_metrics['pooled_pr_auc']:.4f}")
    print(f"  Dataset: {OUTPUT_CSV}")
    print(f"  Models:  {MODELS_DIR}/")
    print("=" * 65)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Anviksha SOA Pipeline')
    parser.add_argument('--extract-only', action='store_true',
                        help='Only extract features, skip training')
    parser.add_argument('--train-only', action='store_true',
                        help='Skip extraction, only train (requires DataSet_SOA.csv)')
    args = parser.parse_args()

    if not args.train_only:
        run_extraction()

    if not args.extract_only:
        run_training()
