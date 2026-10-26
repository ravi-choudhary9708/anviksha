"""
fifo_fund_engine.py
===================
Rigorous FIFO (First-In, First-Out) Fund Allocation Engine for Bank Statement Analysis.

Solves the core fund-tracking challenge:
  Instead of naively diffing consecutive row timestamps, this engine accurately
  models deposit liquidity. Each incoming credit deposit is placed in a FIFO queue.
  When an outgoing debit occurs, it depletes the oldest available credit lots.

Outputs for each account/entity:
  - fifo_median_dwell_minutes: Median holding time of matched funds
  - fifo_mean_dwell_minutes: Mean holding time of matched funds
  - rapid_volume_pct_15m: % of total credit rupees disbursed within 15 minutes
  - rapid_volume_pct_1h:  % of total credit rupees disbursed within 1 hour
  - rapid_volume_pct_24h: % of total credit rupees disbursed within 24 hours
  - total_matched_rupees: Total rupees successfully paired via FIFO
  - unmatched_debit_rupees: Debits exceeding available credits (overdraft/opening balance)
  - fifo_matched_pairs_count: Count of matched credit-debit allocation events
  - sample_matched_chains: Concrete verifiable evidence chains (Credit -> Debit)
"""

import numpy as np
import pandas as pd
from collections import deque
from datetime import datetime


def compute_fifo_fund_flow(txns_df: pd.DataFrame, initial_balance: float = 0.0) -> dict:
    """
    Executes FIFO fund allocation on a chronological stream of transactions.
    
    Args:
        txns_df: DataFrame with ['timestamp', 'credit', 'debit', 'narration', 'raw_account_id']
        initial_balance: Opening balance prior to observed transactions
        
    Returns:
        dict with exact FIFO dwell-time statistics and matched allocation chains.
    """
    if len(txns_df) == 0:
        return _empty_fifo_result()

    # Ensure chronological sort with valid timestamps
    valid_txns = txns_df.dropna(subset=['timestamp']).copy()
    if len(valid_txns) == 0:
        return _empty_fifo_result()

    valid_txns = valid_txns.sort_values('timestamp').reset_index(drop=True)

    # Queue of available credit lots: deque of dicts
    # Each lot: {'lot_id', 'timestamp', 'initial_amt', 'remaining_amt', 'narration', 'cp'}
    credit_queue = deque()

    # If positive initial balance exists, seed queue with opening balance lot
    first_time = valid_txns['timestamp'].iloc[0]
    if initial_balance > 0:
        credit_queue.append({
            'lot_id': 'OPENING_BAL',
            'timestamp': first_time,
            'initial_amt': float(initial_balance),
            'remaining_amt': float(initial_balance),
            'narration': 'Opening Account Balance',
            'cp': 'OPENING_BALANCE'
        })

    matched_pairs = []
    total_debits = 0.0
    total_credits = 0.0
    unmatched_debits = 0.0

    pair_id = 0

    for idx, row in valid_txns.iterrows():
        t = row['timestamp']
        cr = float(row.get('credit', 0.0))
        dr = float(row.get('debit', 0.0))
        narr = str(row.get('narration', ''))
        cp = str(row.get('counterparty_id', row.get('raw_account_id', 'UNKNOWN')))

        # Record incoming credit
        if cr > 0:
            total_credits += cr
            credit_queue.append({
                'lot_id': f"CR_{idx}",
                'timestamp': t,
                'initial_amt': cr,
                'remaining_amt': cr,
                'narration': narr,
                'cp': cp
            })

        # Process outgoing debit against FIFO credit queue
        if dr > 0:
            total_debits += dr
            remaining_to_fund = dr

            while remaining_to_fund > 0 and len(credit_queue) > 0:
                oldest_credit = credit_queue[0]
                available = oldest_credit['remaining_amt']

                match_amount = min(remaining_to_fund, available)
                dwell_seconds = (t - oldest_credit['timestamp']).total_seconds()
                dwell_minutes = max(0.0, dwell_seconds / 60.0)

                matched_pairs.append({
                    'pair_id': pair_id,
                    'credit_id': oldest_credit['lot_id'],
                    'credit_time': oldest_credit['timestamp'],
                    'credit_cp': oldest_credit['cp'],
                    'debit_id': f"DR_{idx}",
                    'debit_time': t,
                    'debit_cp': cp,
                    'matched_amount': round(match_amount, 2),
                    'dwell_minutes': round(dwell_minutes, 2),
                    'is_rapid_15m': dwell_minutes <= 15.0,
                    'is_rapid_1h': dwell_minutes <= 60.0,
                    'is_rapid_24h': dwell_minutes <= 1440.0
                })
                pair_id += 1

                remaining_to_fund -= match_amount
                oldest_credit['remaining_amt'] -= match_amount

                if oldest_credit['remaining_amt'] <= 1e-4:
                    credit_queue.popleft()

            # Debits exceeding available credits
            if remaining_to_fund > 0:
                unmatched_debits += remaining_to_fund

    if len(matched_pairs) == 0:
        return _empty_fifo_result(total_credits, total_debits, unmatched_debits)

    pairs_df = pd.DataFrame(matched_pairs)

    total_matched_rupees = float(pairs_df['matched_amount'].sum())
    
    # Weighted dwell time (weighted by matched amount)
    weights = pairs_df['matched_amount'].values
    dwells = pairs_df['dwell_minutes'].values
    weighted_mean_dwell = float(np.average(dwells, weights=weights)) if total_matched_rupees > 0 else 0.0

    # Unweighted median dwell time
    median_dwell = float(np.median(dwells))

    # Rapid volume percentages (rupees disbursed within time window / total matched rupees)
    rapid_15m_amt = float(pairs_df.loc[pairs_df['is_rapid_15m'], 'matched_amount'].sum())
    rapid_1h_amt  = float(pairs_df.loc[pairs_df['is_rapid_1h'],  'matched_amount'].sum())
    rapid_24h_amt = float(pairs_df.loc[pairs_df['is_rapid_24h'], 'matched_amount'].sum())

    pct_15m = round(rapid_15m_amt / max(1e-5, total_matched_rupees) * 100.0, 2)
    pct_1h  = round(rapid_1h_amt  / max(1e-5, total_matched_rupees) * 100.0, 2)
    pct_24h = round(rapid_24h_amt / max(1e-5, total_matched_rupees) * 100.0, 2)

    # Extract top 3 concrete reproducible evidence chains
    sample_chains = []
    rapid_subset = pairs_df[pairs_df['is_rapid_15m']].head(3)
    if len(rapid_subset) == 0:
        rapid_subset = pairs_df.head(3)

    for _, r in rapid_subset.iterrows():
        sample_chains.append({
            'credit_time': str(r['credit_time']),
            'debit_time': str(r['debit_time']),
            'amount_inr': float(r['matched_amount']),
            'dwell_minutes': float(r['dwell_minutes']),
            'credit_sender': str(r['credit_cp'])[:20],
            'debit_receiver': str(r['debit_cp'])[:20]
        })

    return {
        'total_observed_credits': round(total_credits, 2),
        'total_observed_debits': round(total_debits, 2),
        'total_fifo_matched_rupees': round(total_matched_rupees, 2),
        'unmatched_debit_rupees': round(unmatched_debits, 2),
        'fifo_matched_events_count': len(matched_pairs),
        'fifo_median_dwell_minutes': round(median_dwell, 2),
        'fifo_weighted_mean_dwell_minutes': round(weighted_mean_dwell, 2),
        'rapid_volume_pct_15m': pct_15m,
        'rapid_volume_pct_1h': pct_1h,
        'rapid_volume_pct_24h': pct_24h,
        'sample_matched_chains': sample_chains
    }


def _empty_fifo_result(cr=0.0, dr=0.0, unmatched=0.0):
    return {
        'total_observed_credits': round(cr, 2),
        'total_observed_debits': round(dr, 2),
        'total_fifo_matched_rupees': 0.0,
        'unmatched_debit_rupees': round(unmatched, 2),
        'fifo_matched_events_count': 0,
        'fifo_median_dwell_minutes': 0.0,
        'fifo_weighted_mean_dwell_minutes': 0.0,
        'rapid_volume_pct_15m': 0.0,
        'rapid_volume_pct_1h': 0.0,
        'rapid_volume_pct_24h': 0.0,
        'sample_matched_chains': []
    }
