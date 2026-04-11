"""
FundFlow AI — Graph Feature Builder (Vectorised — Fast)
Computes per-account graph signals from ALL transactions using pure pandas.
No per-account loops. Should complete in under 3 minutes on 499K rows.
"""
import pandas as pd
import numpy as np
import pickle
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import PROCESSED_DATA_PATH, PROCESSED_DIR

GRAPH_FEATURES_PATH = os.path.join(PROCESSED_DIR, "graph_features.pkl")


def build_account_graph_features(df: pd.DataFrame) -> dict:
    """
    All computations use vectorised pandas groupby/merge — no per-account loops.
    Returns dict: {account_id: {feature_dict}}
    """
    print("  Preparing data...")
    df = df.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    # ── RING DETECTION (NetworkX — only on unique edges, not all 499K rows) ───
    print("  Detecting fraud rings (graph)...")
    import networkx as nx
    # Build simple DiGraph with unique sender→receiver edges only
    edge_list = df[['sender_account', 'receiver_account']].drop_duplicates()
    G = nx.DiGraph()
    G.add_edges_from(zip(edge_list['sender_account'], edge_list['receiver_account']))
    print(f"    Unique edge graph: {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges")

    ring_accounts = set()
    ring_count = 0
    for cycle in nx.simple_cycles(G):
        if 2 <= len(cycle) <= 5:
            ring_count += 1
            for acct in cycle:
                ring_accounts.add(acct)
    print(f"    Rings: {ring_count} | Ring accounts: {len(ring_accounts):,}")
    del G, edge_list  # Free memory

    # ── SENDER-SIDE AGGREGATES ────────────────────────────────────────────────
    print("  Computing sender-side aggregates...")
    sender_agg = df.groupby('sender_account').agg(
        total_sent       = ('amount', 'sum'),
        sender_txn_count = ('amount', 'count'),
        sender_first_step= ('step', 'min'),
    ).reset_index().rename(columns={'sender_account': 'account'})

    # ── RECEIVER-SIDE AGGREGATES ──────────────────────────────────────────────
    print("  Computing receiver-side aggregates...")
    receiver_agg = df.groupby('receiver_account').agg(
        total_received        = ('amount', 'sum'),
        receiver_txn_count    = ('amount', 'count'),
        receiver_unique_senders = ('sender_account', 'nunique'),
        receiver_first_step   = ('step', 'min'),
    ).reset_index().rename(columns={'receiver_account': 'account'})

    # ── FORWARDING DELAY (vectorised) ─────────────────────────────────────────
    # For each account: find the first time it received, and the first time it then sent
    # Sort by account + timestamp to find first-in and first-out times
    print("  Computing forwarding delays (vectorised)...")

    # First receive time per account
    first_receive = df.groupby('receiver_account')['timestamp'].min().reset_index()
    first_receive.columns = ['account', 'first_receive_time']

    # First send time per account AFTER its first receive
    # Merge to get first receive time on sender side
    sender_ts = df[['sender_account', 'timestamp']].rename(
        columns={'sender_account': 'account', 'timestamp': 'send_time'}
    )
    delay_df = sender_ts.merge(first_receive, on='account', how='left')
    # Only keep sends that happened AFTER the first receive
    delay_df = delay_df[delay_df['send_time'] >= delay_df['first_receive_time']]
    if len(delay_df) > 0:
        first_send_after_receive = delay_df.groupby('account')['send_time'].min().reset_index()
        first_send_after_receive.columns = ['account', 'first_send_after_receive']
        delay_df2 = first_receive.merge(first_send_after_receive, on='account', how='left')
        delay_df2['fwd_delay_min'] = (
            delay_df2['first_send_after_receive'] - delay_df2['first_receive_time']
        ).dt.total_seconds() / 60
    else:
        delay_df2 = first_receive.copy()
        delay_df2['fwd_delay_min'] = np.nan

    # Convert delay to a score
    def delay_to_score(d):
        if pd.isna(d): return 0.0
        if d < 30:     return 1.0
        if d < 120:    return 0.5
        return 0.1

    delay_df2['fwd_delay_score'] = delay_df2['fwd_delay_min'].apply(delay_to_score)
    delay_features = delay_df2[['account', 'fwd_delay_score']].dropna()

    # ── PURE RECEIVERS (never sent money) ─────────────────────────────────────
    all_senders   = set(df['sender_account'].unique())
    all_receivers = set(df['receiver_account'].unique())
    pure_receivers = all_receivers - all_senders

    # ── MERGE ALL ACCOUNT-LEVEL FEATURES ─────────────────────────────────────
    print("  Merging all account features...")
    all_accounts = pd.DataFrame(
        {'account': list(set(df['sender_account'].unique()) | set(df['receiver_account'].unique()))}
    )

    merged = (
        all_accounts
        .merge(sender_agg,   on='account', how='left')
        .merge(receiver_agg, on='account', how='left')
        .merge(delay_features, on='account', how='left')
    )
    merged = merged.fillna(0)

    # ── COMPUTE MULE SCORE (vectorised) ───────────────────────────────────────
    print("  Computing mule scores (vectorised)...")

    recv_safe = merged['total_received'].clip(lower=100)
    merged['passthrough_ratio'] = np.where(
        merged['total_received'] > 100,
        (merged['total_sent'] / recv_safe).clip(0, 1),
        0.0
    )
    merged['fwd_delay_score'] = merged['fwd_delay_score'].fillna(0.0)

    merged['unique_senders_score'] = (merged['receiver_unique_senders'] / 10.0).clip(0, 1)

    # Amount clustering (coefficient of variation — low CV = suspiciously regular)
    # Approximate: use ratio of std/mean per account
    sender_cv = df.groupby('sender_account')['amount'].agg(['std','mean']).reset_index()
    sender_cv.columns = ['account', 'amount_std', 'amount_mean']
    sender_cv['cluster_score'] = (1 - (sender_cv['amount_std'] / (sender_cv['amount_mean'] + 1e-9))).clip(0, 1)
    merged = merged.merge(sender_cv[['account','cluster_score']], on='account', how='left')
    merged['cluster_score'] = merged['cluster_score'].fillna(0.0)

    # Account age signal
    first_step = merged[['sender_first_step','receiver_first_step']].min(axis=1)
    merged['is_new_account'] = (first_step > 650).astype(int)
    acct_age_score = np.where(first_step > 650, 1.0, np.where(first_step > 300, 0.5, 0.0))

    # Composite mule score
    merged['mule_score'] = (
        merged['passthrough_ratio']    * 0.30 +
        merged['fwd_delay_score']      * 0.25 +
        merged['unique_senders_score'] * 0.20 +
        merged['cluster_score']        * 0.10 +
        acct_age_score                 * 0.15
    ).clip(0, 1).round(4)

    # Ring membership flag
    merged['in_ring'] = merged['account'].isin(ring_accounts).astype(int)

    # Pure receiver flag
    merged['is_pure_receiver'] = merged['account'].isin(pure_receivers).astype(int)

    # Suspected mule threshold
    merged['is_suspected_mule'] = (merged['mule_score'] >= 0.55).astype(int)

    # ── BUILD OUTPUT DICT ─────────────────────────────────────────────────────
    print("  Building output dictionary...")
    cols = [
        'account', 'mule_score', 'passthrough_ratio', 'fwd_delay_score',
        'is_suspected_mule', 'in_ring',
        'receiver_unique_senders', 'total_received', 'receiver_txn_count',
        'is_pure_receiver', 'is_new_account',
    ]
    merged = merged[cols]

    features = {}
    for row in merged.itertuples(index=False):
        features[row.account] = {
            'mule_score':              float(row.mule_score),
            'passthrough_ratio':       float(row.passthrough_ratio),
            'fwd_delay_score':         float(row.fwd_delay_score),
            'is_suspected_mule':       int(row.is_suspected_mule),
            'in_ring':                 int(row.in_ring),
            'receiver_unique_senders': int(row.receiver_unique_senders),
            'receiver_total_inflow':   float(row.total_received),
            'receiver_txn_count':      int(row.receiver_txn_count),
            'is_pure_receiver':        int(row.is_pure_receiver),
            'is_new_account':          int(row.is_new_account),
        }

    return features


def compute_and_save(data_path: str = None, output_path: str = None):
    data_path   = data_path   or PROCESSED_DATA_PATH
    output_path = output_path or GRAPH_FEATURES_PATH

    print("=" * 60)
    print("  FundFlow AI — Graph Feature Builder (Vectorised)")
    print("=" * 60)

    print(f"\nLoading: {data_path}")
    df = pd.read_csv(data_path)
    print(f"  Rows: {len(df):,}")

    features = build_account_graph_features(df)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        pickle.dump(features, f)

    mules  = sum(1 for v in features.values() if v['is_suspected_mule'])
    rings  = sum(1 for v in features.values() if v['in_ring'])
    print(f"\n  Accounts: {len(features):,}")
    print(f"  Suspected mules: {mules:,}")
    print(f"  Ring accounts:   {rings:,}")
    print(f"  Saved to: {output_path}")
    print("=" * 60)
    print("  DONE")
    print("=" * 60)
    return features


def load_graph_features(path: str = None) -> dict:
    path = path or GRAPH_FEATURES_PATH
    if not os.path.exists(path):
        return {}
    with open(path, 'rb') as f:
        return pickle.load(f)


if __name__ == "__main__":
    compute_and_save()
