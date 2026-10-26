"""
cdac_audit_and_profiling.py
============================
Step 1 & Step 2 of Anviksha C-DAC Implementation Checklist:
1. Audit the 25 Excel schemas and transaction identities
2. Measure account-history coverage (Sparse: 1-2, Moderate: 3-19, Rich: 20+)

Outputs:
  server/ml/models/cdac_schema_audit.json
  server/ml/models/cdac_coverage_report.json
"""

import os, sys, json, time, warnings
from pathlib import Path
import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')

SCRIPT_DIR = Path(__file__).parent
PUBLIC_DIR = SCRIPT_DIR.parent.parent / "public"
MODELS_DIR = SCRIPT_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def parse_date_series(s: pd.Series) -> pd.Series:
    """Robust vectorised date parsing handling timestamps, serials, and strings."""
    parsed = pd.to_datetime(s, errors='coerce', dayfirst=True)
    
    # Handle Excel serial numbers (e.g. 43523)
    num_mask = parsed.isna() & s.astype(str).str.match(r'^\d{5,6}$')
    if num_mask.any():
        serials = pd.to_numeric(s[num_mask], errors='coerce')
        parsed[num_mask] = pd.Timestamp('1899-12-30') + pd.to_timedelta(serials, unit='D')
        
    # Handle strings like '14JUN2021:12:19:10' or '27AUG2020'
    str_mask = parsed.isna() & s.astype(str).str.match(r'^\d{2}[A-Z]{3}\d{4}')
    if str_mask.any():
        parsed[str_mask] = pd.to_datetime(
            s[str_mask].astype(str).str[:9], format='%d%b%Y', errors='coerce'
        )
    return parsed


def audit_and_profile():
    print("=" * 80)
    print("  ANVIKSHA: C-DAC SOA DATASET COMPREHENSIVE SCHEMA & COVERAGE AUDIT")
    print("=" * 80)

    soa_files = sorted([
        f for f in PUBLIC_DIR.iterdir()
        if f.suffix.lower() in ('.xls', '.xlsx') and not f.name.startswith('~')
    ])
    print(f"\nFound {len(soa_files)} SOA Excel files in public/")

    file_audits = []
    all_txns = []

    t0 = time.time()

    for idx, fpath in enumerate(soa_files, 1):
        engine = 'openpyxl' if fpath.suffix.lower() == '.xlsx' else 'calamine'
        try:
            df = pd.read_excel(fpath, engine=engine)
        except Exception:
            try:
                df = pd.read_excel(fpath)
            except Exception as e:
                print(f"  [{idx:2d}/25] SKIP {fpath.name}: {e}")
                continue

        cols = df.columns.tolist()
        n_rows = len(df)

        # Detect primary account identifier column
        ac_col = None
        for c in ['Ac_No', 'Account No', 'Account_Number', 'ACCOUNT NO']:
            if c in cols:
                ac_col = c
                break

        # Detect customer name column
        name_col = None
        for c in ['AC_Name', 'Account Name', 'Customer_Name', 'CUSTOMER NAME']:
            if c in cols:
                name_col = c
                break

        # Detect amounts
        dr_col, cr_col, amt_col = None, None, None
        for c in ['Dr_Amt', 'Debit_amount', 'DEBIT AMOUNT']:
            if c in cols:
                dr_col = c
                break
        for c in ['Cr_Amt', 'Credit_Amount', 'CREDIT AMOUNT']:
            if c in cols:
                cr_col = c
                break
        if 'AMOUNT' in cols:
            amt_col = 'AMOUNT'

        # Detect date
        dt_col = None
        for c in ['Tran_Date', 'TXN DATE', 'Date_of_transaction', 'TRANSACTION DATE', 'pstd_dt', 'value_dt']:
            if c in cols:
                dt_col = c
                break

        # Detect narration
        narr_col = None
        for c in ['Narration', 'TXN PARTICULARS', 'TXN REMARKS', 'Rmks', 'NARRATION']:
            if c in cols:
                narr_col = c
                break

        # Extract normalized slice
        norm = pd.DataFrame()
        norm['source_file'] = fpath.name
        norm['raw_account_id'] = df[ac_col].astype(str).str.strip() if ac_col else 'FILE_' + fpath.stem
        norm['customer_name']  = df[name_col].astype(str).str.strip() if name_col else 'UNKNOWN'
        
        # In files where Ac_No changes on every row but customer_name is single,
        # the true investigated subject entity is the customer/file entity!
        norm['entity_id'] = fpath.stem + "_" + norm['customer_name']

        if dr_col and cr_col:
            norm['debit']  = pd.to_numeric(df[dr_col], errors='coerce').fillna(0)
            norm['credit'] = pd.to_numeric(df[cr_col], errors='coerce').fillna(0)
        elif amt_col:
            dr_cr_col = [c for c in ['Ankit Pandey', 'Dr Cr'] if c in cols]
            amt = pd.to_numeric(df[amt_col], errors='coerce').fillna(0)
            if dr_cr_col:
                dr_cr = df[dr_cr_col[0]].astype(str).str.strip().str.upper()
                norm['debit']  = np.where(dr_cr == 'D', amt, 0.0)
                norm['credit'] = np.where(dr_cr == 'C', amt, 0.0)
            else:
                norm['debit']  = 0.0
                norm['credit'] = amt
        else:
            norm['debit'] = 0.0
            norm['credit'] = 0.0

        bal_col = [c for c in ['Balance', 'EOD Balance', 'Available Balance', 'Line_Balance'] if c in cols]
        norm['balance'] = pd.to_numeric(df[bal_col[0]], errors='coerce').fillna(0) if bal_col else 0.0
        
        norm['narration'] = df[narr_col].astype(str) if narr_col else ''
        norm['txn_date_raw'] = df[dt_col] if dt_col else pd.NaT
        norm['txn_date'] = parse_date_series(norm['txn_date_raw'])

        all_txns.append(norm)

        u_ac = norm['raw_account_id'].nunique()
        u_cust = norm['customer_name'].nunique()
        sample_cust = norm['customer_name'].iloc[0] if len(norm) > 0 else 'N/A'
        date_min = str(norm['txn_date'].min())[:10] if norm['txn_date'].notna().any() else 'N/A'
        date_max = str(norm['txn_date'].max())[:10] if norm['txn_date'].notna().any() else 'N/A'

        audit_entry = {
            'file_name': fpath.name,
            'row_count': n_rows,
            'col_count': len(cols),
            'columns': cols,
            'account_col': ac_col,
            'name_col': name_col,
            'unique_account_ids': u_ac,
            'unique_customer_names': u_cust,
            'primary_customer': sample_cust,
            'total_debit': round(float(norm['debit'].sum()), 2),
            'total_credit': round(float(norm['credit'].sum()), 2),
            'date_min': date_min,
            'date_max': date_max
        }
        file_audits.append(audit_entry)
        print(f"  [{idx:2d}/25] {fpath.name:<14} | Rows: {n_rows:>6,} | AcIDs: {u_ac:>6,} | Cust: {sample_cust[:18]:<18} | Dates: {date_min} -> {date_max}")

    combined = pd.concat(all_txns, ignore_index=True)
    total_txns = len(combined)
    total_raw_accounts = combined['raw_account_id'].nunique()
    total_entities = combined['entity_id'].nunique()

    print(f"\n[AUDIT SUMMARY]")
    print(f"  Total Transactions : {total_txns:,}")
    print(f"  Unique Raw Ac_No   : {total_raw_accounts:,}")
    print(f"  Unique Case Entities: {total_entities} (The 25 Case Subjects)")

    # --------------------------------------------------------------------------
    # STEP 2: MEASURE ACCOUNT-HISTORY COVERAGE
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("  STEP 2: MEASURING ACCOUNT-HISTORY COVERAGE")
    print("=" * 80)

    # 1. Coverage at raw_account_id level
    raw_ac_counts = combined.groupby('raw_account_id').size()
    sparse_raw = (raw_ac_counts <= 2).sum()
    moderate_raw = ((raw_ac_counts >= 3) & (raw_ac_counts <= 19)).sum()
    rich_raw = (raw_ac_counts >= 20).sum()

    coverage_raw_ac = {
        'total_unique_accounts': int(total_raw_accounts),
        'sparse_1_to_2': {
            'count': int(sparse_raw),
            'pct': round(float(sparse_raw / total_raw_accounts * 100), 2),
            'description': '1-2 observed transactions: Limited-evidence risk indicators'
        },
        'moderate_3_to_19': {
            'count': int(moderate_raw),
            'pct': round(float(moderate_raw / total_raw_accounts * 100), 2),
            'description': '3-19 transactions: Tabular behavioral anomaly model'
        },
        'rich_20_plus': {
            'count': int(rich_raw),
            'pct': round(float(rich_raw / total_raw_accounts * 100), 2),
            'description': '20+ transactions: Full temporal sequence + graph topology analysis'
        }
    }

    print("\n[A. Raw Account ID Level Coverage (254k accounts)]:")
    print(f"  Sparse   (1-2 txns)  : {sparse_raw:>7,} accounts ({sparse_raw/total_raw_accounts*100:.2f}%)")
    print(f"  Moderate (3-19 txns) : {moderate_raw:>7,} accounts ({moderate_raw/total_raw_accounts*100:.2f}%)")
    print(f"  Rich     (20+ txns)  : {rich_raw:>7,} accounts ({rich_raw/total_raw_accounts*100:.2f}%)")

    # 2. Coverage at Case Entity Level (The 25 Investigated Portfolios)
    entity_counts = combined.groupby(['source_file', 'customer_name']).agg(
        txn_count=('debit', 'count'),
        total_credit=('credit', 'sum'),
        total_debit=('debit', 'sum'),
        date_min=('txn_date', 'min'),
        date_max=('txn_date', 'max'),
        unique_raw_ac=('raw_account_id', 'nunique')
    ).reset_index()

    entity_counts['observation_days'] = (
        (entity_counts['date_max'] - entity_counts['date_min']).dt.days.fillna(0).clip(lower=1)
    )

    print("\n[B. The 25 Case Entity Profiles (The True Subjects)]:")
    print(f"{'File':<14} | {'Customer Name':<20} | {'Txns':>7} | {'Cr (₹)':>14} | {'Dr (₹)':>14} | {'Days':>5} | {'UniqueAc':>8}")
    print("-" * 95)
    for _, row in entity_counts.sort_values(by='txn_count', ascending=False).iterrows():
        print(f"{row['source_file']:<14} | {row['customer_name'][:20]:<20} | {row['txn_count']:>7,} | {row['total_credit']:>14,.0f} | {row['total_debit']:>14,.0f} | {int(row['observation_days']):>5} | {row['unique_raw_ac']:>8,}")

    # Export json reports
    audit_report = {
        'total_files': len(soa_files),
        'total_transactions': total_txns,
        'unique_raw_accounts': total_raw_accounts,
        'unique_entities': total_entities,
        'files': file_audits
    }

    coverage_report = {
        'total_transactions': total_txns,
        'account_level_coverage': coverage_raw_ac,
        'entity_level_coverage': entity_counts.to_dict(orient='records')
    }

    with open(MODELS_DIR / "cdac_schema_audit.json", "w", encoding="utf-8") as f:
        json.dump(audit_report, f, indent=2, default=str)

    with open(MODELS_DIR / "cdac_coverage_report.json", "w", encoding="utf-8") as f:
        json.dump(coverage_report, f, indent=2, default=str)

    print(f"\n[SAVED] cdac_schema_audit.json and cdac_coverage_report.json in {MODELS_DIR}")
    print(f"Elapsed time: {time.time() - t0:.1f}s")
    print("=" * 80 + "\n")

if __name__ == '__main__':
    audit_and_profile()
