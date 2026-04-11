"""
FundFlow AI — Data Augmentation
Injects additional fraud patterns that PaySim doesn't cover:
- Smurfing (structuring)
- Round-tripping (circular chains)
- Rapid multi-hop fund movement
- Dormant account activation
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import PROCESSED_DATA_PATH, INDIAN_BRANCHES, CHANNELS


def _generate_txn_id(base_idx: int, pattern: str, seq: int) -> str:
    """Generate a unique txn_id for augmented transactions."""
    return f"AUG_{pattern}_{base_idx:04d}_{seq:03d}"


def inject_smurfing(df: pd.DataFrame, num_patterns: int = 50, seed: int = 100) -> pd.DataFrame:
    """
    Inject smurfing (structuring) patterns.
    One large amount split into multiple small amounts just under reporting threshold.
    """
    np.random.seed(seed)
    new_rows = []
    existing_accounts = df['sender_account'].unique()

    for i in range(num_patterns):
        # Pick a sender from existing accounts
        sender = np.random.choice(existing_accounts)
        # Total amount between 2L and 10L
        total_amount = np.random.uniform(200000, 1000000)
        # Split into 5-15 small transactions, each under 50K
        num_splits = np.random.randint(5, 16)
        amounts = np.random.dirichlet(np.ones(num_splits)) * total_amount
        # Cap each at 49,999
        amounts = np.clip(amounts, 1000, 49999)

        # Pick unique receivers
        receivers = np.random.choice(existing_accounts, size=num_splits, replace=False)

        # All within a 2-hour window
        base_time = datetime(2026, 3, 15) + timedelta(hours=np.random.randint(0, 720))
        sender_branch = np.random.choice(INDIAN_BRANCHES)

        for j, (amount, receiver) in enumerate(zip(amounts, receivers)):
            ts = base_time + timedelta(minutes=np.random.randint(0, 120))
            new_rows.append({
                'txn_id': _generate_txn_id(i, 'SMURF', j),
                'timestamp': ts,
                'sender_account': sender,
                'receiver_account': receiver,
                'amount': round(amount, 2),
                'txn_type': 'NEFT',
                'sender_branch': sender_branch,
                'receiver_branch': np.random.choice(INDIAN_BRANCHES),
                'sender_balance_before': total_amount * 1.5,
                'sender_balance_after': total_amount * 1.5 - amount,
                'receiver_balance_before': np.random.uniform(10000, 500000),
                'receiver_balance_after': np.random.uniform(10000, 500000) + amount,
                'channel': np.random.choice(['mobile', 'internet']),
                'is_fraud': 1,
                'is_flagged_fraud': 0,
                'step': int((ts - datetime(2026, 3, 1)).total_seconds() / 3600),
            })

    aug_df = pd.DataFrame(new_rows)
    print(f"  [SMURFING] Injected {len(new_rows)} transactions across {num_patterns} patterns")
    return pd.concat([df, aug_df], ignore_index=True)


def inject_round_tripping(df: pd.DataFrame, num_rings: int = 30, seed: int = 200) -> pd.DataFrame:
    """
    Inject round-tripping patterns: A→B→C→A (circular chains).
    Money goes in a circle and returns to origin.
    """
    np.random.seed(seed)
    new_rows = []
    existing_accounts = df['sender_account'].unique()

    for i in range(num_rings):
        # Ring size: 3-5 accounts
        ring_size = np.random.randint(3, 6)
        ring_accounts = np.random.choice(existing_accounts, size=ring_size, replace=False).tolist()

        # Amount: 1L-8L, slight decrease each hop (fees/commissions)
        base_amount = np.random.uniform(100000, 800000)
        base_time = datetime(2026, 3, 10) + timedelta(hours=np.random.randint(0, 720))

        for j in range(ring_size):
            sender = ring_accounts[j]
            receiver = ring_accounts[(j + 1) % ring_size]  # Circular
            # Slight amount decrease each hop
            amount = base_amount * (1 - 0.02 * j)
            ts = base_time + timedelta(minutes=10 + j * np.random.randint(5, 30))

            new_rows.append({
                'txn_id': _generate_txn_id(i, 'RING', j),
                'timestamp': ts,
                'sender_account': sender,
                'receiver_account': receiver,
                'amount': round(amount, 2),
                'txn_type': np.random.choice(['NEFT', 'IMPS']),
                'sender_branch': np.random.choice(INDIAN_BRANCHES),
                'receiver_branch': np.random.choice(INDIAN_BRANCHES),
                'sender_balance_before': base_amount * 2,
                'sender_balance_after': base_amount * 2 - amount,
                'receiver_balance_before': np.random.uniform(50000, 300000),
                'receiver_balance_after': np.random.uniform(50000, 300000) + amount,
                'channel': 'internet',
                'is_fraud': 1,
                'is_flagged_fraud': 0,
                'step': int((ts - datetime(2026, 3, 1)).total_seconds() / 3600),
            })

    aug_df = pd.DataFrame(new_rows)
    print(f"  [ROUND-TRIP] Injected {len(new_rows)} transactions across {num_rings} rings")
    return pd.concat([df, aug_df], ignore_index=True)


def inject_rapid_multihop(df: pd.DataFrame, num_chains: int = 40, seed: int = 300) -> pd.DataFrame:
    """
    Inject rapid multi-hop fund movement: A→B→C→D→E in < 1 hour.
    Money moves through 4-6 accounts very quickly.
    """
    np.random.seed(seed)
    new_rows = []
    existing_accounts = df['sender_account'].unique()

    for i in range(num_chains):
        chain_length = np.random.randint(4, 7)
        chain_accounts = np.random.choice(existing_accounts, size=chain_length, replace=False)
        base_amount = np.random.uniform(200000, 1500000)
        base_time = datetime(2026, 3, 5) + timedelta(hours=np.random.randint(0, 720))

        for j in range(chain_length - 1):
            amount = base_amount * (1 - 0.01 * j)  # Small decrease
            # Very short gaps: 2-15 minutes between hops
            ts = base_time + timedelta(minutes=j * np.random.randint(2, 15))

            new_rows.append({
                'txn_id': _generate_txn_id(i, 'RAPID', j),
                'timestamp': ts,
                'sender_account': chain_accounts[j],
                'receiver_account': chain_accounts[j + 1],
                'amount': round(amount, 2),
                'txn_type': 'IMPS',  # Fastest transfer
                'sender_branch': np.random.choice(INDIAN_BRANCHES),
                'receiver_branch': np.random.choice(INDIAN_BRANCHES),
                'sender_balance_before': base_amount * 1.2,
                'sender_balance_after': base_amount * 0.2,
                'receiver_balance_before': np.random.uniform(10000, 100000),
                'receiver_balance_after': np.random.uniform(10000, 100000) + amount,
                'channel': 'internet',
                'is_fraud': 1,
                'is_flagged_fraud': 0,
                'step': int((ts - datetime(2026, 3, 1)).total_seconds() / 3600),
            })

    aug_df = pd.DataFrame(new_rows)
    print(f"  [RAPID-HOP] Injected {len(new_rows)} transactions across {num_chains} chains")
    return pd.concat([df, aug_df], ignore_index=True)


def inject_dormant_activation(df: pd.DataFrame, num_accounts: int = 25, seed: int = 400) -> pd.DataFrame:
    """
    Inject dormant account activation: account inactive for weeks, 
    then sudden burst of high-value transactions.
    """
    np.random.seed(seed)
    new_rows = []
    existing_accounts = df['sender_account'].unique()

    for i in range(num_accounts):
        # Create a "dormant" account — use a new-ish looking ID
        dormant_account = f"C_DORMANT_{i:04d}"
        # Burst of 5-10 transactions in 3 hours
        num_txns = np.random.randint(5, 11)
        base_time = datetime(2026, 3, 28) + timedelta(hours=np.random.randint(0, 48))
        total_amount = np.random.uniform(500000, 2000000)

        for j in range(num_txns):
            receiver = np.random.choice(existing_accounts)
            amount = total_amount / num_txns * np.random.uniform(0.7, 1.3)
            ts = base_time + timedelta(minutes=np.random.randint(0, 180))

            new_rows.append({
                'txn_id': _generate_txn_id(i, 'DORMANT', j),
                'timestamp': ts,
                'sender_account': dormant_account,
                'receiver_account': receiver,
                'amount': round(amount, 2),
                'txn_type': np.random.choice(['NEFT', 'IMPS', 'UPI']),
                'sender_branch': np.random.choice(INDIAN_BRANCHES),
                'receiver_branch': np.random.choice(INDIAN_BRANCHES),
                'sender_balance_before': total_amount * 1.1,
                'sender_balance_after': total_amount * 1.1 - amount,
                'receiver_balance_before': np.random.uniform(20000, 200000),
                'receiver_balance_after': np.random.uniform(20000, 200000) + amount,
                'channel': np.random.choice(['mobile', 'internet']),
                'is_fraud': 1,
                'is_flagged_fraud': 0,
                'step': int((ts - datetime(2026, 3, 1)).total_seconds() / 3600),
            })

    aug_df = pd.DataFrame(new_rows)
    print(f"  [DORMANT] Injected {len(new_rows)} transactions across {num_accounts} dormant accounts")
    return pd.concat([df, aug_df], ignore_index=True)


def augment_data(input_path: str = None, output_path: str = None) -> pd.DataFrame:
    """Run all augmentation patterns on the processed PaySim data."""
    input_path = input_path or PROCESSED_DATA_PATH
    output_path = output_path or PROCESSED_DATA_PATH  # Overwrite in-place

    print("=" * 60)
    print("  DATA AUGMENTATION — Injecting Fraud Patterns")
    print("=" * 60)

    print(f"\nLoading processed data from: {input_path}")
    df = pd.read_csv(input_path, parse_dates=['timestamp'])
    print(f"  Base size: {len(df):,} | Fraud: {df['is_fraud'].sum():,}")

    print("\nInjecting patterns:")
    df = inject_smurfing(df)
    df = inject_round_tripping(df)
    df = inject_rapid_multihop(df)
    df = inject_dormant_activation(df)

    # Re-sort by timestamp
    df = df.sort_values('timestamp').reset_index(drop=True)

    # Save
    df.to_csv(output_path, index=False)
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)

    print("\n" + "=" * 60)
    print("  AUGMENTATION COMPLETE")
    print("=" * 60)
    print(f"  Total transactions: {len(df):,}")
    print(f"  Total fraud:        {df['is_fraud'].sum():,} ({df['is_fraud'].mean()*100:.3f}%)")
    print(f"  - Original PaySim:  8,213")
    print(f"  - Smurfing:         {len(df[df['txn_id'].str.startswith('AUG_SMURF')])}")
    print(f"  - Round-tripping:   {len(df[df['txn_id'].str.startswith('AUG_RING')])}")
    print(f"  - Rapid multi-hop:  {len(df[df['txn_id'].str.startswith('AUG_RAPID')])}")
    print(f"  - Dormant acct:     {len(df[df['txn_id'].str.startswith('AUG_DORMANT')])}")
    print(f"  File size:          {file_size_mb:.1f} MB")
    print("=" * 60)

    return df


if __name__ == "__main__":
    augment_data()
