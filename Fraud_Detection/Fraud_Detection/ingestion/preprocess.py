"""
FundFlow AI — PaySim Preprocessing
Transforms raw PaySim data into Indian banking context.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
import sys
import hashlib

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    PAYSIM_RAW_PATH, PROCESSED_DATA_PATH, PROCESSED_DIR,
    TRANSACTION_TYPE_MAP, INDIAN_BRANCHES, CHANNELS, CHANNEL_WEIGHTS, BASE_DATE,
)


def preprocess_paysim(input_path: str = None, output_path: str = None, sample_size: int = None) -> pd.DataFrame:
    """
    Preprocess PaySim dataset into Indian banking context.

    Args:
        input_path: Path to raw PaySim CSV. Defaults to config.
        output_path: Path to save processed CSV. Defaults to config.
        sample_size: If set, sample this many rows (for faster dev iteration).

    Returns:
        Processed DataFrame.
    """
    input_path = input_path or PAYSIM_RAW_PATH
    output_path = output_path or PROCESSED_DATA_PATH

    print("[1/8] Loading PaySim dataset...")
    if sample_size:
        df = pd.read_csv(input_path, nrows=sample_size)
        print(f"       Loaded {len(df):,} rows (sampled)")
    else:
        df = pd.read_csv(input_path)
        print(f"       Loaded {len(df):,} rows")

    print(f"       Fraud: {df['isFraud'].sum():,} ({df['isFraud'].mean()*100:.3f}%)")

    # --- 1. Generate transaction IDs ---
    print("[2/8] Generating transaction IDs...")
    df = df.reset_index(drop=True)
    df['txn_id'] = df.index.map(lambda i: f"TXN_{i:08d}")

    # --- 2. Map transaction types to Indian banking ---
    print("[3/8] Mapping transaction types to Indian banking context...")
    df['txn_type'] = df['type'].map(TRANSACTION_TYPE_MAP)
    # Verify all types mapped
    unmapped = df['txn_type'].isna().sum()
    if unmapped > 0:
        print(f"       WARNING: {unmapped} unmapped transaction types")
        df['txn_type'] = df['txn_type'].fillna('OTHER')

    # --- 3. Convert step (hourly) to timestamps ---
    print("[4/8] Converting steps to timestamps...")
    base_dt = datetime.strptime(BASE_DATE, "%Y-%m-%d")
    # Add random minutes and seconds within each hour for granularity
    np.random.seed(42)
    random_minutes = np.random.randint(0, 60, size=len(df))
    random_seconds = np.random.randint(0, 60, size=len(df))

    df['timestamp'] = df['step'].apply(lambda s: base_dt + timedelta(hours=int(s)))
    df['timestamp'] = df['timestamp'] + pd.to_timedelta(random_minutes, unit='m') + pd.to_timedelta(random_seconds, unit='s')
    # Sort by timestamp for proper temporal ordering
    df = df.sort_values('timestamp').reset_index(drop=True)
    # Regenerate txn_ids after sort
    df['txn_id'] = df.index.map(lambda i: f"TXN_{i:08d}")

    # --- 4. Assign branch codes ---
    print("[5/8] Assigning Indian branch codes...")
    # Use hash of account name to deterministically assign branches
    # This ensures same account always maps to same branch
    def account_to_branch(account_name: str) -> str:
        h = int(hashlib.md5(account_name.encode()).hexdigest(), 16)
        return INDIAN_BRANCHES[h % len(INDIAN_BRANCHES)]

    df['sender_branch'] = df['nameOrig'].apply(account_to_branch)
    df['receiver_branch'] = df['nameDest'].apply(account_to_branch)

    # --- 5. Add transaction channel ---
    print("[6/8] Adding transaction channels...")
    df['channel'] = np.random.choice(CHANNELS, size=len(df), p=CHANNEL_WEIGHTS)
    # Night transactions (0-5 AM) are more likely branch=0, mobile higher
    night_mask = df['timestamp'].dt.hour.isin([0, 1, 2, 3, 4, 5])
    df.loc[night_mask, 'channel'] = np.random.choice(
        ['mobile', 'internet'], size=night_mask.sum(), p=[0.7, 0.3]
    )

    # --- 6. Rename columns to project schema ---
    print("[7/8] Renaming columns to project schema...")
    df = df.rename(columns={
        'nameOrig': 'sender_account',
        'nameDest': 'receiver_account',
        'oldbalanceOrg': 'sender_balance_before',
        'newbalanceOrig': 'sender_balance_after',
        'oldbalanceDest': 'receiver_balance_before',
        'newbalanceDest': 'receiver_balance_after',
        'isFraud': 'is_fraud',
        'isFlaggedFraud': 'is_flagged_fraud',
    })

    # --- 7. Select and order final columns ---
    final_columns = [
        'txn_id', 'timestamp', 'sender_account', 'receiver_account',
        'amount', 'txn_type', 'sender_branch', 'receiver_branch',
        'sender_balance_before', 'sender_balance_after',
        'receiver_balance_before', 'receiver_balance_after',
        'channel', 'is_fraud', 'is_flagged_fraud', 'step',
    ]
    df = df[final_columns]

    # --- 8. Save processed data ---
    print("[8/8] Saving processed data...")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"       Saved to: {output_path}")
    print(f"       File size: {file_size_mb:.1f} MB")

    # --- Summary ---
    print("\n" + "=" * 60)
    print("  PREPROCESSING COMPLETE")
    print("=" * 60)
    print(f"  Total transactions: {len(df):,}")
    print(f"  Fraud transactions: {df['is_fraud'].sum():,} ({df['is_fraud'].mean()*100:.3f}%)")
    print(f"  Unique senders:     {df['sender_account'].nunique():,}")
    print(f"  Unique receivers:   {df['receiver_account'].nunique():,}")
    print(f"  Date range:         {df['timestamp'].min()} to {df['timestamp'].max()}")
    print(f"  Transaction types:  {dict(df['txn_type'].value_counts())}")
    print(f"  Channels:           {dict(df['channel'].value_counts())}")
    print(f"  Branches:           {df['sender_branch'].nunique()} unique branches")
    print("=" * 60)

    return df


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Preprocess PaySim dataset")
    parser.add_argument("--sample", type=int, default=None,
                        help="Sample N rows for faster dev iteration")
    parser.add_argument("--input", type=str, default=None,
                        help="Path to raw PaySim CSV")
    parser.add_argument("--output", type=str, default=None,
                        help="Path to save processed CSV")
    args = parser.parse_args()

    preprocess_paysim(
        input_path=args.input,
        output_path=args.output,
        sample_size=args.sample,
    )
