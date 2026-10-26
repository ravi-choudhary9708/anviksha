"""
Anviksha — C-DAC SOA Dataset to SQLite Database Synchronizer
===========================================================
Synchronizes the 25 C-DAC investigated cases, cross-case syndication bridges,
priority alerts, and verified transaction chains into data/anviksha.db
"""

import json
import sqlite3
import os
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'anviksha.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

def sync_cdac():
    print(f"[SYNC] Connecting to SQLite DB at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Load C-DAC forensic audit data
    audit_file = os.path.join(MODELS_DIR, 'cdac_forensic_audit_25cases.json')
    if not os.path.exists(audit_file):
        print(f"[ERROR] {audit_file} not found!")
        return

    with open(audit_file, 'r', encoding='utf-8') as f:
        audit_data = json.load(f)

    # Load Graph connectivity data
    graph_file = os.path.join(MODELS_DIR, 'cdac_graph_connectivity_audit.json')
    graph_data = {}
    if os.path.exists(graph_file):
        with open(graph_file, 'r', encoding='utf-8') as f:
            graph_data = json.load(f)

    cases = audit_data.get('cases', [])
    print(f"[SYNC] Processing {len(cases)} C-DAC case subjects...")

    # Case ID mapping for stable foreign keys
    case_id_map = {}

    for i, c in enumerate(cases):
        # Deterministic UUID for case subject
        case_tag = c.get('case_tag', f"CASE_{c['source_file']}")
        case_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"anviksha.cdac.{case_tag}"))
        case_id_map[case_tag] = case_uuid

        # Map operational tier to status
        tier = c.get('operational_priority_tier', 'TIER_4_ROUTINE_MONITORING')
        if tier == 'TIER_1_EXPEDITED_HUMAN_TRIAGE':
            status = 'under_review'
            is_mule = 1
        elif tier == 'TIER_2_STANDARD_ANALYST_REVIEW':
            status = 'flagged'
            is_mule = 1
        elif tier == 'TIER_3_HIGH_VOLUME_MONITORING':
            status = 'active'
            is_mule = 0
        else:
            status = 'active'
            is_mule = 0

        account_number = f"CDAC-{c['source_file'].split('.')[0]}-{100000 + i}"
        account_holder = c.get('customer_name', f"Case Subject {i+1}")
        risk_score = round(float(c.get('anomaly_suspicion_rank', 0)), 1)
        upi_id = f"{account_holder.lower().replace(' ', '')}@cdacbank"
        opened_date = c.get('first_txn_date', '2021-01-01 00:00:00').split(' ')[0]

        # Insert or replace account
        cur.execute("""
            INSERT INTO accounts (
                id, account_number, account_holder, ifsc_code, bank_name,
                upi_id, phone, account_type, kyc_status, opened_date,
                risk_score, status, is_mule
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_number) DO UPDATE SET
                risk_score = excluded.risk_score,
                status = excluded.status,
                is_mule = excluded.is_mule,
                account_holder = excluded.account_holder
        """, (
            case_uuid, account_number, account_holder, f"CDAC000{100+i}",
            "C-DAC Partner Bank", upi_id, f"+9198765{i:05d}",
            'savings' if c.get('passthrough_ratio', 0) < 1.0 else 'current',
            'verified', opened_date, risk_score, status, is_mule
        ))

        # Insert Alert for Tier 1 and Tier 2 cases
        if tier in ['TIER_1_EXPEDITED_HUMAN_TRIAGE', 'TIER_2_STANDARD_ANALYST_REVIEW']:
            alert_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"anviksha.cdac.alert.{case_tag}"))
            severity = 'critical' if tier == 'TIER_1_EXPEDITED_HUMAN_TRIAGE' else 'high'
            title = f"[{'TIER 1 EXPEDITED' if severity == 'critical' else 'TIER 2 ANALYST'}] {account_holder} — Suspicion Rank {risk_score}/100"
            evidence = c.get('evidence_details', '')
            fifo_dwell = c.get('fifo_estimated_median_dwell_mins', 0)
            rapid_24h = c.get('rapid_forward_pct_24h', 0)
            
            ai_explanation = (
                f"C-DAC Forensic Audit Finding: {account_holder} exhibits {rapid_24h}% funds forwarded "
                f"within 24 hours (FIFO median holding time: {fifo_dwell:.1f} mins). "
                f"Counterparty structure: {c.get('fan_in_senders', 0):,} fan-in senders to {c.get('fan_out_receivers', 0):,} receivers. "
                f"Evidence tags: {c.get('evidence_codes', '')}. Regulatory recommendation: {c.get('recommended_action', '')}."
            )

            cur.execute("""
                INSERT INTO alerts (
                    id, alert_type, severity, account_id, title,
                    description, ai_explanation, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    severity = excluded.severity,
                    title = excluded.title,
                    description = excluded.description,
                    ai_explanation = excluded.ai_explanation
            """, (
                alert_id, 'ml_flag', severity, case_uuid, title,
                evidence, ai_explanation, 'open', datetime.now().isoformat()
            ))

        # Insert sample transactions from verifiable chains
        chains = c.get('sample_matched_chains', [])
        for ch_idx, chain in enumerate(chains[:10]):
            txn_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"anviksha.cdac.txn.{case_tag}.{ch_idx}"))
            amount = float(chain.get('amount_inr', 1000.0))
            txn_ref = f"CDAC-{case_tag[:10]}-{ch_idx}-{int(amount)}"
            dwell = chain.get('dwell_minutes', 0)

            # We create a counterparty account if not present
            cp_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"anviksha.cdac.cp.{chain.get('credit_sender', 'CP_SENDER')}"))
            cur.execute("""
                INSERT OR IGNORE INTO accounts (
                    id, account_number, account_holder, ifsc_code, bank_name,
                    opened_date, risk_score, status, is_mule
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cp_uuid, f"ACC-{cp_uuid[:8]}", chain.get('credit_sender', 'Counterparty'),
                'BKID0001000', 'Counterparty Bank', '2021-01-01', 25.0, 'active', 0
            ))

            cur.execute("""
                INSERT OR REPLACE INTO transactions (
                    id, txn_ref, type, amount, sender_account_id, receiver_account_id,
                    description, timestamp, risk_score, is_flagged
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                txn_id, txn_ref, 'UPI' if amount < 100000 else 'IMPS',
                amount, cp_uuid, case_uuid,
                f"FIFO Chain: Matched forwarding {dwell:.1f}m dwell ({chain.get('credit_sender')} -> {account_holder})",
                chain.get('credit_time', datetime.now().isoformat()),
                risk_score, 1 if risk_score >= 41 else 0
            ))

    # Sync Inter-Case Syndication Bridges into account_connections
    bridges = graph_data.get('inter_case_bridges', [])
    print(f"[SYNC] Inserting {len(bridges)} inter-case syndication bridges...")

    for b in bridges:
        case_1_tag = b.get('case_1')
        case_2_tag = b.get('case_2')
        shared_count = b.get('shared_counterparties_count', 0)

        id1 = case_id_map.get(case_1_tag)
        id2 = case_id_map.get(case_2_tag)

        if id1 and id2:
            # Insert bidirectional connection
            cur.execute("""
                INSERT INTO account_connections (
                    source_account_id, dest_account_id, txn_count, total_amount, first_txn_at, last_txn_at
                ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(source_account_id, dest_account_id) DO UPDATE SET
                    txn_count = excluded.txn_count,
                    total_amount = excluded.total_amount
            """, (id1, id2, shared_count, shared_count * 50000.0))

            cur.execute("""
                INSERT INTO account_connections (
                    source_account_id, dest_account_id, txn_count, total_amount, first_txn_at, last_txn_at
                ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(source_account_id, dest_account_id) DO UPDATE SET
                    txn_count = excluded.txn_count,
                    total_amount = excluded.total_amount
            """, (id2, id1, shared_count, shared_count * 50000.0))

    conn.commit()

    # Query counts
    cur.execute("SELECT count(*) FROM accounts")
    acc_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM transactions")
    txn_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM alerts WHERE status = 'open'")
    alert_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM account_connections")
    conn_count = cur.fetchone()[0]

    print(f"[SYNC COMPLETED] SQLite updated:")
    print(f"  - Total Accounts: {acc_count}")
    print(f"  - Total Transactions: {txn_count}")
    print(f"  - Open Alerts: {alert_count}")
    print(f"  - Account Connections (including Syndication Bridges): {conn_count}")

    conn.close()

if __name__ == '__main__':
    sync_cdac()
