import json

with open('server/ml/models/cdac_forensic_audit_25cases.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

cases = sorted(d['cases'], key=lambda x: x['anomaly_suspicion_rank'], reverse=True)

print("="*90)
print(f"C-DAC 25 SOA CASES: FULL AUDIT & ML RANKING RESULTS")
print(f"Total Transactions: 494,276 | Total Nodes: {d['metadata']['graph_nodes']} | Cross-Case Bridges: 7")
print("="*90)

for i, c in enumerate(cases[:7]):
    name = c.get('customer_name')
    file = c.get('source_file')
    rank = c.get('anomaly_suspicion_rank', 0)
    tier = c.get('operational_priority_tier')
    dwell_m = c.get('fifo_estimated_median_dwell_mins', 0)
    rapid = c.get('rapid_forward_pct_24h', 0)
    fan_in = c.get('fan_in_senders', 0)
    fan_out = c.get('fan_out_receivers', 0)
    cr = c.get('total_credits_inr', 0)
    db = c.get('total_debits_inr', 0)
    codes = c.get('evidence_codes', '')
    
    dwell_str = f"{dwell_m:.1f} mins ({dwell_m/60:.1f} hrs)" if dwell_m < 1440 else f"{dwell_m/1440:.1f} days"
    
    print(f"#{i+1:02d} | {name:<22} | {file:<12} | Score: {rank:5.1f}/100 | Tier: {tier}")
    print(f"     FIFO Dwell: {dwell_str:<18} | Rapid <24h: {rapid:5.1f}% | Fan-In/Out: {fan_in:,} -> {fan_out:,}")
    print(f"     Volume: Cr ₹{cr:,.0f} / Db ₹{db:,.0f} | Evidence: {codes}")
    print("-" * 90)
