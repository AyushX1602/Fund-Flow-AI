"""
FundFlow AI — Mule Account Detector
Detects money mule accounts: intermediaries that receive and immediately forward funds.
"""
import networkx as nx
import pandas as pd
import numpy as np
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def compute_mule_scores(G: nx.MultiDiGraph, df: pd.DataFrame,
                        kyc_data: dict = None) -> pd.DataFrame:
    """
    Compute a mule score for every account in the graph.

    kyc_data: dict {account_id: {kyc_type, account_age_days, credit_score}}
              If provided, OTP-only KYC + new account (<90d) adds +0.15 to score.

    Mule signals:
    1. Outflow/Inflow ratio close to 1.0 (pass-through behaviour)
    2. Short time delta between receiving and forwarding
    3. High number of unique senders
    4. Account appears new (low step number)
    5. Transaction amounts cluster tightly (operational pattern)
    6. [NEW] OTP-only Aadhaar eKYC + new account age

    Returns DataFrame with columns: account, mule_score, signals, ...
    """
    df = df.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    kyc = kyc_data or {}
    records = []

    for account in G.nodes():
        node = G.nodes[account]
        total_sent     = node.get('total_sent', 0.0)
        total_received = node.get('total_received', 0.0)
        in_deg         = G.in_degree(account)
        out_deg        = G.out_degree(account)

        if total_received < 1000 or (in_deg == 0 and out_deg == 0):
            continue

        if total_received > 0:
            passthrough_ratio = min(total_sent / total_received, 1.0)
        else:
            passthrough_ratio = 0.0

        acct_in  = df[df['receiver_account'] == account].sort_values('timestamp')
        acct_out = df[df['sender_account'] == account].sort_values('timestamp')

        avg_fwd_delay_min = np.nan
        if len(acct_in) > 0 and len(acct_out) > 0:
            first_in  = acct_in['timestamp'].min()
            first_out = acct_out['timestamp'].min()
            delay_min = (first_out - first_in).total_seconds() / 60
            avg_fwd_delay_min = max(delay_min, 0)

        unique_senders = in_deg

        acct_all = df[(df['sender_account'] == account) | (df['receiver_account'] == account)]
        min_step = acct_all['step'].min() if len(acct_all) > 0 else 999

        all_amounts = list(acct_in['amount']) + list(acct_out['amount'])
        if len(all_amounts) > 2:
            cv = np.std(all_amounts) / (np.mean(all_amounts) + 1e-9)
            amount_cluster_score = max(0, 1 - cv)
        else:
            amount_cluster_score = 0.0

        s1 = passthrough_ratio * 0.30
        s2 = (1.0 if (not np.isnan(avg_fwd_delay_min) and avg_fwd_delay_min < 30) else
              0.5 if (not np.isnan(avg_fwd_delay_min) and avg_fwd_delay_min < 120) else 0.0) * 0.25
        s3 = min(unique_senders / 10.0, 1.0) * 0.20
        s4 = (1.0 if min_step > 600 else 0.5 if min_step > 300 else 0.0) * 0.15
        s5 = amount_cluster_score * 0.10

        # S6: Aadhaar KYC boost — OTP-only eKYC + new account (< 90 days)
        kyc_info       = kyc.get(account, {})
        kyc_type       = kyc_info.get('kyc_type', 'biometric')
        account_age    = kyc_info.get('account_age_days', 365)
        s6 = 0.15 if (kyc_type == 'otp_ekyc' and account_age < 90) else 0.0

        mule_score = round(min(s1 + s2 + s3 + s4 + s5 + s6, 1.0), 4)

        records.append({
            "account":              account,
            "mule_score":           mule_score,
            "passthrough_ratio":    round(passthrough_ratio, 4),
            "avg_fwd_delay_min":    round(avg_fwd_delay_min, 1) if not np.isnan(avg_fwd_delay_min) else None,
            "unique_senders":       unique_senders,
            "unique_receivers":     out_deg,
            "total_received":       round(total_received, 2),
            "total_sent":           round(total_sent, 2),
            "amount_cluster_score": round(amount_cluster_score, 4),
            "kyc_type":             kyc_type,
            "account_age_days":     account_age,
            "is_suspected_mule":    int(mule_score >= 0.6),
        })

    result = pd.DataFrame(records)
    if len(result) > 0:
        result = result.sort_values('mule_score', ascending=False).reset_index(drop=True)
    return result



def get_mule_network(mule_df: pd.DataFrame, G: nx.MultiDiGraph,
                     threshold: float = 0.6) -> dict:
    """
    Build a subgraph showing only suspected mule accounts and their connections.
    Returns nodes and edges for dashboard visualization.
    """
    suspected = set(mule_df[mule_df['mule_score'] >= threshold]['account'].tolist())

    nodes = []
    edges = []
    included = set()

    for acct in suspected:
        if acct not in G or acct in included:    # ← skip if already added
            continue
        score_row  = mule_df[mule_df['account'] == acct]
        mule_score = float(score_row['mule_score'].values[0]) if len(score_row) > 0 else 0.0
        nodes.append({
            "id":         acct,
            "label":      acct[:12] + "...",
            "mule_score": mule_score,
            "color":      "#ff1744" if mule_score > 0.8 else "#ffab00",
        })
        included.add(acct)

        # Add their direct neighbors (that haven't been included yet)
        for neighbor in list(G.successors(acct)) + list(G.predecessors(acct)):
            if neighbor not in included:
                n_score_row = mule_df[mule_df['account'] == neighbor]
                n_score = float(n_score_row['mule_score'].values[0]) if len(n_score_row) > 0 else 0.0
                nodes.append({
                    "id":         neighbor,
                    "label":      neighbor[:12] + "...",
                    "mule_score": n_score,
                    "color":      "#4a9eff",
                })
                included.add(neighbor)

    # Edges between included nodes
    for u, v, data in G.edges(data=True):
        if u in included and v in included:
            edges.append({
                "from":   u,
                "to":     v,
                "amount": data['amount'],
                "txn_id": data['txn_id'],
            })

    return {"nodes": nodes, "edges": edges, "suspected_mules": len(suspected)}
