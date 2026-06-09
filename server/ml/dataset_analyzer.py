"""
============================================================
Anviksha - Dataset Analyzer (EDA)
============================================================
Quick exploratory data analysis on the BOI hackathon DataSet.csv.
Generates statistics, visualizations, and insights that will guide
the training pipeline and impress judges in the presentation.

Usage:
    python server/ml/dataset_analyzer.py

Output:
    server/ml/models/eda_class_distribution.png
    server/ml/models/eda_missing_values.png
    server/ml/models/eda_golden_features_corr.png
    server/ml/models/eda_report.json
============================================================
"""

import os
import json
import numpy as np
import pandas as pd
from pathlib import Path
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import warnings
warnings.filterwarnings('ignore')

# ============================================================
# Configuration
# ============================================================
SCRIPT_DIR = Path(__file__).parent
DATASET_PATH = SCRIPT_DIR / 'DataSet.csv'
OUTPUT_DIR = SCRIPT_DIR / 'models'

BOI_GOLDEN_FEATURES = [
    'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082',
    'F2122', 'F2582', 'F2678', 'F2737', 'F2956', 'F3043',
    'F3836', 'F3887', 'F3889', 'F3891', 'F3894'
]

# Plot styling
COLORS = {
    'bg': '#0f1117',
    'card': '#1a1d29',
    'text': '#e2e8f0',
    'muted': '#64748b',
    'blue': '#3b82f6',
    'green': '#10b981',
    'red': '#ef4444',
    'amber': '#f59e0b',
    'purple': '#8b5cf6',
}

plt.rcParams.update({
    'figure.facecolor': COLORS['bg'],
    'axes.facecolor': COLORS['card'],
    'axes.edgecolor': COLORS['muted'],
    'text.color': COLORS['text'],
    'xtick.color': COLORS['text'],
    'ytick.color': COLORS['text'],
    'axes.labelcolor': COLORS['text'],
    'font.family': 'sans-serif',
    'font.size': 11,
})

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 60)
    print("  Anviksha - Dataset Exploratory Analysis")
    print("=" * 60)

    print("\n[1/6] Loading dataset...")
    df = pd.read_csv(DATASET_PATH, low_memory=False)
    print(f"  Raw shape: {df.shape}")

    df = df.loc[:, ~df.columns.str.contains('^Unnamed', case=False, na=False)]
    if '' in df.columns:
        df = df.drop(columns=[''])
    print(f"  After dropping index: {df.shape}")

    print("\n[2/6] Analyzing target variable F3924...")
    target = df['F3924']
    class_counts = target.value_counts().sort_index()
    total = len(target)
    fraud_count = int(class_counts.get(1, 0))
    legit_count = int(class_counts.get(0, 0))
    fraud_ratio = fraud_count / total if total > 0 else 0

    print(f"  Total samples:  {total:,}")
    print(f"  Legitimate (0): {legit_count:,} ({legit_count/total*100:.1f}%)")
    print(f"  Suspicious (1): {fraud_count:,} ({fraud_count/total*100:.1f}%)")
    print(f"  Fraud ratio:    {fraud_ratio:.4f}")

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(
        ['Legitimate (0)', 'Suspicious (1)'],
        [legit_count, fraud_count],
        color=[COLORS['green'], COLORS['red']],
        edgecolor='none',
        width=0.5,
    )
    for bar, count in zip(bars, [legit_count, fraud_count]):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + total * 0.01,
                f'{count:,}\n({count/total*100:.1f}%)',
                ha='center', va='bottom', fontweight='bold', fontsize=13, color=COLORS['text'])
    ax.set_title('Target Variable Distribution (F3924)', fontsize=15, fontweight='bold', pad=15)
    ax.set_ylabel('Count', fontsize=12)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'{int(x):,}'))
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / 'eda_class_distribution.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Saved eda_class_distribution.png")

    print("\n[3/6] Analyzing missing values...")
    X = df.drop(columns=['F3924'])

    na_counts = X.isna().sum()
    sentinel_counts = (X == -1).sum()
    effective_missing = na_counts + sentinel_counts
    effective_missing_pct = effective_missing / len(X) * 100

    complete = (effective_missing_pct == 0).sum()
    low_missing = ((effective_missing_pct > 0) & (effective_missing_pct <= 20)).sum()
    mid_missing = ((effective_missing_pct > 20) & (effective_missing_pct <= 80)).sum()
    high_missing = (effective_missing_pct > 80).sum()

    print(f"  Complete columns (0% missing):     {complete}")
    print(f"  Low missing (0-20%):               {low_missing}")
    print(f"  Medium missing (20-80%):           {mid_missing}")
    print(f"  High missing (>80%):               {high_missing}")
    print(f"  Total features:                    {X.shape[1]}")

    surviving = X.shape[1] - high_missing
    print(f"  Features surviving >80% NA drop:   {surviving}")

    fig, ax = plt.subplots(figsize=(10, 5))
    categories = ['Complete\n(0%)', 'Low Missing\n(0-20%)', 'Medium\n(20-80%)', 'High Missing\n(>80%)']
    counts = [complete, low_missing, mid_missing, high_missing]
    colors = [COLORS['green'], COLORS['blue'], COLORS['amber'], COLORS['red']]
    bars = ax.bar(categories, counts, color=colors, edgecolor='none', width=0.6)
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 10,
                f'{count}', ha='center', va='bottom', fontweight='bold', fontsize=13, color=COLORS['text'])
    ax.set_title('Missing Value Distribution Across Features', fontsize=15, fontweight='bold', pad=15)
    ax.set_ylabel('Number of Features', fontsize=12)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / 'eda_missing_values.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Saved eda_missing_values.png")

    print("\n[4/6] Analyzing data types...")
    num_cols = X.select_dtypes(include=[np.number]).columns
    cat_cols = X.select_dtypes(include=['object', 'category']).columns
    print(f"  Numeric features:     {len(num_cols)}")
    print(f"  Categorical features: {len(cat_cols)}")
    if len(cat_cols) > 0:
        print(f"  Categorical columns:  {list(cat_cols)}")
        for col in cat_cols:
            uniques = X[col].dropna().unique()
            print(f"    {col}: {len(uniques)} unique values → {list(uniques[:10])}")

    print("\n[5/6] Analyzing BOI golden features...")
    golden_stats = {}
    available_golden = [f for f in BOI_GOLDEN_FEATURES if f in X.columns]
    print(f"  Available: {len(available_golden)}/18")

    for feat in available_golden:
        col = X[feat]
        na_pct = (col.isna().sum() + (col == -1).sum()) / len(col) * 100
        if col.dtype in ['object', 'category']:
            golden_stats[feat] = {
                'type': 'categorical',
                'missing_pct': round(na_pct, 1),
                'unique': int(col.nunique()),
                'top_values': col.value_counts().head(3).to_dict(),
            }
        else:
            clean = col.replace(-1, np.nan).dropna()
            golden_stats[feat] = {
                'type': 'numeric',
                'missing_pct': round(na_pct, 1),
                'mean': round(float(clean.mean()), 4) if len(clean) > 0 else None,
                'std': round(float(clean.std()), 4) if len(clean) > 0 else None,
                'min': round(float(clean.min()), 4) if len(clean) > 0 else None,
                'max': round(float(clean.max()), 4) if len(clean) > 0 else None,
            }
        status = "[!] HIGH MISSING" if na_pct > 80 else ("[+] LOW" if na_pct < 20 else "[~] MODERATE")
        print(f"  {feat}: {status} ({na_pct:.1f}% missing) - {golden_stats[feat].get('type', 'unknown')}")

    golden_numeric = [f for f in available_golden if f in num_cols]
    if len(golden_numeric) >= 4:
        golden_data = X[golden_numeric].replace(-1, np.nan)
        corr = golden_data.corr()

        fig, ax = plt.subplots(figsize=(12, 10))
        im = ax.imshow(corr.values, cmap='RdBu_r', vmin=-1, vmax=1, aspect='auto')
        ax.set_xticks(range(len(golden_numeric)))
        ax.set_yticks(range(len(golden_numeric)))
        ax.set_xticklabels(golden_numeric, rotation=45, ha='right', fontsize=9)
        ax.set_yticklabels(golden_numeric, fontsize=9)
        plt.colorbar(im, ax=ax, shrink=0.8, label='Correlation')
        ax.set_title('Correlation Heatmap - BOI Golden Features', fontsize=14, fontweight='bold', pad=15)
        plt.tight_layout()
        fig.savefig(OUTPUT_DIR / 'eda_golden_features_corr.png', dpi=150, bbox_inches='tight')
        plt.close()
        print("  [OK] Saved eda_golden_features_corr.png")

    print("\n[6/6] Finding top discriminating features...")
    y = df['F3924']

    correlations = {}
    for col in num_cols:
        try:
            clean = X[col].replace(-1, np.nan)
            combined = pd.DataFrame({'feat': clean, 'target': y}).dropna()
            if len(combined) > 100 and combined['feat'].std() > 0:
                corr_val = combined['feat'].corr(combined['target'])
                if not np.isnan(corr_val):
                    correlations[col] = abs(corr_val)
        except Exception:
            continue

    top_corr = sorted(correlations.items(), key=lambda x: x[1], reverse=True)[:30]
    print(f"  Top 30 features by |correlation| with target:")
    for feat, corr in top_corr[:15]:
        golden_marker = " ** GOLDEN **" if feat in BOI_GOLDEN_FEATURES else ""
        print(f"    {feat}: {corr:.4f}{golden_marker}")
    if len(top_corr) > 15:
        print(f"    ... and {len(top_corr) - 15} more")

    report = {
        'dataset': {
            'path': str(DATASET_PATH),
            'shape': list(df.shape),
            'total_samples': total,
        },
        'target': {
            'name': 'F3924',
            'legitimate_count': legit_count,
            'suspicious_count': fraud_count,
            'fraud_ratio': round(fraud_ratio, 4),
        },
        'features': {
            'total': X.shape[1],
            'numeric': int(len(num_cols)),
            'categorical': int(len(cat_cols)),
            'surviving_80pct_na_drop': int(surviving),
        },
        'missing_values': {
            'complete': int(complete),
            'low_missing': int(low_missing),
            'mid_missing': int(mid_missing),
            'high_missing': int(high_missing),
        },
        'golden_features': {
            'available': available_golden,
            'stats': golden_stats,
        },
        'top_discriminating_features': [
            {'feature': f, 'correlation': round(c, 4)} for f, c in top_corr
        ],
    }

    report_path = OUTPUT_DIR / 'eda_report.json'
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\n  [OK] Saved eda_report.json")

    print("\n" + "=" * 60)
    print("  EDA Complete! Check server/ml/models/ for outputs.")
    print("=" * 60)

if __name__ == '__main__':
    main()
