"""
plot_forensic_audit.py
======================
Renders 3 publication-grade figures for the 25-Case Forensic Consistency Audit:
  1. cdac_fifo_dwell_time.png (FIFO Estimated Median Dwell Time Comparison)
  2. cdac_inter_case_syndication.png (Inter-Case Shared Counterparty Bridges)
  3. cdac_human_in_the_loop_tiers.png (Regulatory-Compliant Operational Priority Tiers)
"""

import os, sys, json
from pathlib import Path
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

SCRIPT_DIR = Path(__file__).parent
PUBLIC_DIR = SCRIPT_DIR.parent.parent / "public"
MODELS_DIR = SCRIPT_DIR / "models"
VIZ_DIR    = PUBLIC_DIR / "visualizations"
ARTIFACT_DIR = Path("C:/Users/ravi/.gemini/antigravity-ide/brain/da725794-bb23-4cd2-b539-e3783b9ce3a5")

plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['axes.edgecolor'] = '#334155'
plt.rcParams['axes.linewidth'] = 1.2

# Load audit data
with open(MODELS_DIR / "cdac_forensic_audit_25cases.json", "r", encoding="utf-8") as f:
    audit_data = json.load(f)

cases_df = pd.DataFrame(audit_data['cases'])

# ------------------------------------------------------------------------------
# FIGURE 1: FIFO ESTIMATED MEDIAN DWELL TIME (HOURS)
# ------------------------------------------------------------------------------
fig1, ax1 = plt.subplots(figsize=(12, 6.5), facecolor='#0f172a')
ax1.set_facecolor('#1e293b')

dwell_df = cases_df.copy()
dwell_df['dwell_hours'] = dwell_df['fifo_estimated_median_dwell_mins'] / 60.0
dwell_df = dwell_df.sort_values('dwell_hours', ascending=True)

y_pos = np.arange(len(dwell_df))
hours = dwell_df['dwell_hours'].values
labels = [f"{r['customer_name']} ({r['source_file']})" for _, r in dwell_df.iterrows()]

colors = ['#ef4444' if h <= 24.0 else '#f59e0b' if h <= 72.0 else '#10b981' for h in hours]

bars = ax1.barh(y_pos, hours, color=colors, edgecolor='#334155', height=0.7)
ax1.set_yticks(y_pos)
ax1.set_yticklabels(labels, color='#e2e8f0', fontsize=8.5)
ax1.set_xscale('log')
ax1.set_xlabel('FIFO Estimated Median Dwell Time (Hours, Log Scale)', color='#e2e8f0', fontsize=11, labelpad=8)
ax1.set_title('FIFO Liquidity Holding Period Across 25 C-DAC Cases\n(Rapid Turnover <24h vs. Benign Multi-Month Personal Balances)',
              color='#f8fafc', fontsize=13, fontweight='bold', pad=15)
ax1.tick_params(colors='#94a3b8')
ax1.grid(axis='x', linestyle=':', alpha=0.3, color='#94a3b8')

ax1.axvline(24.0, color='#ef4444', linestyle='--', lw=1.5, alpha=0.8, label='Rapid Passthrough Horizon (24 Hours)')

import matplotlib.patches as mpatches
p_red = mpatches.Patch(color='#ef4444', label='Rapid Liquidity Turnover (<= 24h)')
p_yel = mpatches.Patch(color='#f59e0b', label='Moderate Holding (24h - 72h)')
p_grn = mpatches.Patch(color='#10b981', label='Benign Long-Term Holding (> 72h)')
leg1 = ax1.legend(handles=[p_red, p_yel, p_grn], facecolor='#0f172a', edgecolor='#475569', labelcolor='#e2e8f0', loc='lower right')
leg1.get_frame().set_alpha(0.9)

for out_dir in [MODELS_DIR, VIZ_DIR, ARTIFACT_DIR]:
    fig1.savefig(out_dir / "cdac_fifo_dwell_time.png", dpi=180, bbox_inches='tight', facecolor='#0f172a')
plt.close(fig1)

# ------------------------------------------------------------------------------
# FIGURE 2: INTER-CASE SYNDICATION BRIDGES
# ------------------------------------------------------------------------------
fig2, ax2 = plt.subplots(figsize=(10, 5.5), facecolor='#0f172a')
ax2.set_facecolor('#1e293b')

bridge_pairs = [
    ("Tanish Mukherjee (26)\n<--->\nRachana Dhar (48)", 55702, "#ef4444"),
    ("Vivaan Shah (4)\n<--->\nAditya Sethi (5)", 365, "#f97316"),
    ("Kabir Arora (2)\n<--->\nVivaan Shah (4)", 255, "#f59e0b"),
    ("Kabir Arora (2)\n<--->\nAditya Sethi (5)", 93, "#38bdf8"),
    ("Jack Patil (6)\n<--->\nWakeeta Sheth (7)", 67, "#a855f7"),
    ("Faras Swaminathan (9)\n<--->\nOther Cases", 12, "#10b981"),
]

labels_b = [p[0] for p in bridge_pairs]
counts_b = [p[1] for p in bridge_pairs]
colors_b = [p[2] for p in bridge_pairs]

bars2 = ax2.bar(labels_b, counts_b, color=colors_b, edgecolor='#334155', width=0.55)
ax2.set_yscale('log')
ax2.set_ylabel('Shared Counterparty Count (Log Scale)', color='#e2e8f0', fontsize=11, labelpad=8)
ax2.set_title('Empirical Inter-Case Syndication Infrastructure\n(Disproves Disjoint Star Graph Assumption — 56,386 Shared Counterparties)',
              color='#f8fafc', fontsize=12, fontweight='bold', pad=15)
ax2.tick_params(colors='#94a3b8', labelsize=8.5)
ax2.grid(axis='y', linestyle=':', alpha=0.3, color='#94a3b8')

for bar, val in zip(bars2, counts_b):
    ax2.text(bar.get_x() + bar.get_width()/2.0, val * 1.25, f"{val:,}",
             ha='center', va='bottom', color='#f8fafc', fontsize=9.5, fontweight='bold')

for out_dir in [MODELS_DIR, VIZ_DIR, ARTIFACT_DIR]:
    fig2.savefig(out_dir / "cdac_inter_case_syndication.png", dpi=180, bbox_inches='tight', facecolor='#0f172a')
plt.close(fig2)

# ------------------------------------------------------------------------------
# FIGURE 3: HUMAN-IN-THE-LOOP OPERATIONAL PRIORITY TIERS
# ------------------------------------------------------------------------------
fig3, ax3 = plt.subplots(figsize=(11, 5.5), facecolor='#0f172a')
ax3.set_facecolor('#1e293b')

tier_counts = cases_df['operational_priority_tier'].value_counts()
t_order = [
    ('TIER_1_URGENT_ANALYST_INVESTIGATION', 'Tier 1: Urgent Analyst Investigation\n(Immediate SAR Triage, High Asymmetry)', '#ef4444'),
    ('TIER_2_STANDARD_ANALYST_REVIEW', 'Tier 2: Standard Analyst Review\n(Scheduled Deep-Dive Compliance Audit)', '#f59e0b'),
    ('TIER_3_ENHANCED_MONITORING', 'Tier 3: Enhanced Monitoring\n(Automated Velocity & Bridge Watchlist)', '#38bdf8'),
    ('TIER_4_ROUTINE_MONITORING', 'Tier 4: Routine Monitoring\n(Benign Baseline, Long Dwell Time)', '#10b981'),
]

labels_t = [t[1] for t in t_order]
counts_t = [tier_counts.get(t[0], 0) for t in t_order]
colors_t = [t[2] for t in t_order]

bars3 = ax3.barh(labels_t, counts_t, color=colors_t, edgecolor='#334155', height=0.6)
ax3.invert_yaxis()
ax3.set_xlabel('Case Subject Count (out of 26 evaluated)', color='#e2e8f0', fontsize=11, labelpad=8)
ax3.set_title('Regulatory-Compliant Human-in-the-Loop Operational Queue\n(Zero Autonomous Account Freezes Without Authorized Compliance Review)',
              color='#f8fafc', fontsize=12, fontweight='bold', pad=15)
ax3.tick_params(colors='#94a3b8', labelsize=9.5)
ax3.grid(axis='x', linestyle=':', alpha=0.3, color='#94a3b8')

for bar, val in zip(bars3, counts_t):
    ax3.text(val + 0.3, bar.get_y() + bar.get_height()/2.0, f"{val} Cases ({val/len(cases_df)*100:.1f}%)",
             ha='left', va='center', color='#f8fafc', fontsize=10, fontweight='bold')

for out_dir in [MODELS_DIR, VIZ_DIR, ARTIFACT_DIR]:
    fig3.savefig(out_dir / "cdac_human_in_the_loop_tiers.png", dpi=180, bbox_inches='tight', facecolor='#0f172a')
plt.close(fig3)

print("[PLOTS GENERATED] 3 forensic audit plots saved to models/, public/visualizations/, and artifacts.")
