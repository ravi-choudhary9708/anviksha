"""
graph_connectivity_audit.py
===========================
Rigorous Inter-Case Graph Topology & Visibility Audit across the 25 C-DAC SOA Files.

Evaluates:
  1. Unique verified nodes (Case Subjects + Counterparties)
  2. Unique directed edges (Sender -> Receiver)
  3. Shared counterparties across multiple case portfolios (Bridge Nodes)
  4. Inter-case connectivity: Do case subjects transact with shared counterparties?
  5. Multi-hop path verification (Length 2+ paths between subjects)
  6. Graph visibility boundary assessment (Star graphs vs Connected components)

Outputs:
  server/ml/models/cdac_graph_connectivity_audit.json
"""

import os, sys, json, time, re, warnings
from pathlib import Path
from collections import defaultdict
import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')

SCRIPT_DIR = Path(__file__).parent
PUBLIC_DIR = SCRIPT_DIR.parent.parent / "public"
MODELS_DIR = SCRIPT_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def extract_counterparty(row, ac_col):
    raw_ac = str(row.get(ac_col, '')).strip()
    narr = str(row.get('Narration', row.get('TXN PARTICULARS', row.get('TXN REMARKS', row.get('Rmks', '')))))
    
    # 1. UPI VPA
    m_upi = re.search(r'UPI/([A-Za-z0-9_.\-]+@[A-Za-z0-9_.\-]*)', narr)
    if m_upi:
        return 'UPI_' + m_upi.group(1)
        
    # 2. Account number in narration
    m_ac = re.search(r'([0-9]{9,18})', narr)
    if m_ac:
        return 'AC_' + m_ac.group(1)
        
    # 3. Clean raw_account_id if informative
    if raw_ac and raw_ac not in ('nan', '', 'UNKNOWN', 'NaN') and len(raw_ac) >= 6:
        return 'AC_' + raw_ac

    # 4. Truncated token
    token = re.sub(r'[^A-Za-z0-9]', '', narr)[:16]
    return 'CP_' + token if token else 'CP_UNKNOWN'


def audit_graph_connectivity():
    print("=" * 80)
    print("  ANVIKSHA: C-DAC INTER-CASE GRAPH CONNECTIVITY & VISIBILITY AUDIT")
    print("=" * 80)

    soa_files = sorted([
        f for f in PUBLIC_DIR.iterdir()
        if f.suffix.lower() in ('.xls', '.xlsx') and not f.name.startswith('~')
    ])

    case_entities = {}
    edges = []
    node_set = set()
    counterparty_case_map = defaultdict(set)  # cp -> set of case_ids

    t0 = time.time()

    for idx, fpath in enumerate(soa_files, 1):
        engine = 'openpyxl' if fpath.suffix.lower() == '.xlsx' else 'calamine'
        try:
            df = pd.read_excel(fpath, engine=engine)
        except Exception:
            try:
                df = pd.read_excel(fpath)
            except Exception as e:
                print(f"  SKIP {fpath.name}: {e}")
                continue

        cols = df.columns.tolist()
        ac_col = next((c for c in ['Ac_No', 'Account No', 'Account_Number', 'ACCOUNT NO'] if c in cols), None)
        name_col = next((c for c in ['AC_Name', 'Account Name', 'Customer_Name', 'CUSTOMER NAME'] if c in cols), None)
        cust_name = str(df[name_col].iloc[0]).strip() if name_col and len(df) > 0 else fpath.stem
        case_id = f"CASE_{fpath.stem}_{cust_name.replace(' ', '_')}"

        case_entities[case_id] = {
            'file_name': fpath.name,
            'customer_name': cust_name,
            'row_count': len(df)
        }
        node_set.add(case_id)

        # Detect amounts
        dr_col = next((c for c in ['Dr_Amt', 'Debit_amount', 'DEBIT AMOUNT'] if c in cols), None)
        cr_col = next((c for c in ['Cr_Amt', 'Credit_Amount', 'CREDIT AMOUNT'] if c in cols), None)

        if dr_col and cr_col:
            debits = pd.to_numeric(df[dr_col], errors='coerce').fillna(0).values
            credits = pd.to_numeric(df[cr_col], errors='coerce').fillna(0).values
        elif 'AMOUNT' in cols:
            amounts = pd.to_numeric(df['AMOUNT'], errors='coerce').fillna(0).values
            dr_cr_col = next((c for c in ['Ankit Pandey', 'Dr Cr'] if c in cols), None)
            if dr_cr_col:
                dr_cr = df[dr_cr_col].astype(str).str.strip().str.upper().values
                debits = np.where(dr_cr == 'D', amounts, 0.0)
                credits = np.where(dr_cr == 'C', amounts, 0.0)
            else:
                debits = np.zeros(len(df))
                credits = amounts
        else:
            debits = np.zeros(len(df))
            credits = np.zeros(len(df))

        # Extract counterparties
        has_varying_ac = df[ac_col].nunique() > 10 if ac_col else False

        for i, row in df.iterrows():
            cr = credits[i]
            dr = debits[i]
            if cr == 0 and dr == 0:
                continue

            if has_varying_ac:
                cp = 'AC_' + str(row[ac_col]).strip()
            else:
                cp = extract_counterparty(row, ac_col)

            node_set.add(cp)
            counterparty_case_map[cp].add(case_id)

            if cr > 0:
                # Credit: Inflow (Counterparty -> Subject)
                edges.append((cp, case_id, float(cr), 'CREDIT_INFLOW'))
            if dr > 0:
                # Debit: Outflow (Subject -> Counterparty)
                edges.append((case_id, cp, float(dr), 'DEBIT_OUTFLOW'))

        print(f"  [{idx:2d}/25] Processed {fpath.name:<14} -> Case: {case_id[:28]:<28}")

    total_nodes = len(node_set)
    total_edges = len(edges)
    total_cases = len(case_entities)
    total_counterparties = total_nodes - total_cases

    print(f"\n[NETWORK AUDIT SUMMARY]")
    print(f"  Total Verified Nodes        : {total_nodes:,}")
    print(f"    - Primary Case Subjects   : {total_cases}")
    print(f"    - Observed Counterparties : {total_counterparties:,}")
    print(f"  Total Directed Edges        : {total_edges:,}")

    # Analyze Shared Counterparties across cases
    shared_cps = {cp: cases for cp, cases in counterparty_case_map.items() if len(cases) > 1}
    n_shared = len(shared_cps)
    print(f"\n[INTER-CASE CONNECTIVITY]")
    print(f"  Counterparties shared across >= 2 cases: {n_shared}")

    # Case-to-Case Co-occurrence matrix
    case_overlap = defaultdict(lambda: defaultdict(int))
    for cp, cases in shared_cps.items():
        case_list = sorted(list(cases))
        for i in range(len(case_list)):
            for j in range(i + 1, len(case_list)):
                case_overlap[case_list[i]][case_list[j]] += 1
                case_overlap[case_list[j]][case_list[i]] += 1

    shared_bridges = []
    for c1, neighbors in case_overlap.items():
        for c2, count in neighbors.items():
            if c1 < c2:
                shared_bridges.append({
                    'case_1': c1,
                    'case_2': c2,
                    'shared_counterparties_count': count
                })

    shared_bridges.sort(key=lambda x: x['shared_counterparties_count'], reverse=True)

    # Multi-hop paths (Case_A -> CP -> Case_B)
    print(f"  Direct Case-to-Case Bridge Links found: {len(shared_bridges)}")
    if shared_bridges:
        print("  Top Inter-Case Syndication Bridges:")
        for b in shared_bridges[:5]:
            print(f"    • {b['case_1'][:24]} <---> {b['case_2'][:24]} | Shared nodes: {b['shared_counterparties_count']}")

    # Visibility Classification
    if n_shared == 0:
        graph_nature = "Disjoint Egocentric Star Graphs (Each file is an isolated account-centric statement)"
    elif n_shared < 100:
        graph_nature = "Loosely Connected Egocentric Clusters (Predominantly star topologies with sparse inter-case bridges)"
    else:
        graph_nature = "Interconnected Syndication Network (Substantial shared counterparty infrastructure)"

    print(f"\n  Graph Topology Classification: {graph_nature}")

    output_audit = {
        'total_nodes': total_nodes,
        'case_subject_nodes': total_cases,
        'counterparty_nodes': total_counterparties,
        'total_directed_edges': total_edges,
        'shared_counterparties_across_cases_count': n_shared,
        'shared_counterparties_pct': round(n_shared / max(1, total_counterparties) * 100, 3),
        'graph_topology_classification': graph_nature,
        'inter_case_bridges': shared_bridges,
        'sample_shared_counterparties': [
            {'counterparty': cp, 'connected_cases': list(cases)}
            for cp, cases in list(shared_cps.items())[:15]
        ]
    }

    out_file = MODELS_DIR / "cdac_graph_connectivity_audit.json"
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output_audit, f, indent=2)

    print(f"\n[SAVED] cdac_graph_connectivity_audit.json in {MODELS_DIR}")
    print(f"Elapsed time: {time.time() - t0:.1f}s")
    print("=" * 80 + "\n")
    return output_audit

if __name__ == '__main__':
    audit_graph_connectivity()
