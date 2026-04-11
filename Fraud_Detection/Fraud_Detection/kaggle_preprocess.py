# =============================================================================
# FundFlow AI — Kaggle Preprocessing Notebook
# Run this on Kaggle with the PaySim dataset attached.
# Output: transactions_processed.csv (~200MB, 500K rows sampled + all fraud)
# =============================================================================

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import hashlib
import os

# ── CONFIG ───────────────────────────────────────────────────────────────────

PAYSIM_PATH = "/kaggle/input/paysim1/PS_20174392719_1491204439457_log.csv"  
# If the filename is different, list files first:
# import os; print(os.listdir('/kaggle/input/paysim1/'))

BASE_DATE = datetime(2026, 3, 1)

TRANSACTION_TYPE_MAP = {
    "TRANSFER":  "NEFT",
    "CASH_OUT":  "ATM",
    "PAYMENT":   "UPI",
    "CASH_IN":   "DEPOSIT",
    "DEBIT":     "IMPS",
}

INDIAN_BRANCHES = [
    "BR_MUMBAI_001","BR_MUMBAI_002","BR_MUMBAI_003",
    "BR_DELHI_001","BR_DELHI_002","BR_DELHI_003",
    "BR_CHENNAI_001","BR_CHENNAI_002",
    "BR_BANGALORE_001","BR_BANGALORE_002",
    "BR_HYDERABAD_001","BR_HYDERABAD_002",
    "BR_KOLKATA_001","BR_KOLKATA_002",
    "BR_PUNE_001","BR_PUNE_002",
    "BR_AHMEDABAD_001","BR_JAIPUR_001",
    "BR_LUCKNOW_001","BR_CHANDIGARH_001",
    "BR_BHOPAL_001","BR_PATNA_001",
    "BR_KOCHI_001","BR_GUWAHATI_001","BR_SURAT_001",
]

CHANNELS      = ["mobile", "internet", "branch"]
CHANNEL_PROBS = [0.45, 0.35, 0.20]

# ── STEP 1: LOAD ─────────────────────────────────────────────────────────────

print("Loading PaySim...")
df = pd.read_csv(PAYSIM_PATH)
print(f"  Total rows : {len(df):,}")
print(f"  Fraud rows : {df['isFraud'].sum():,}  ({df['isFraud'].mean()*100:.3f}%)")
print(f"  Columns    : {list(df.columns)}")

# ── STEP 2: SAMPLE (keep ALL fraud + 490K legit rows = ~500K total) ──────────

print("\nSampling dataset...")
fraud_df  = df[df['isFraud'] == 1].copy()
legit_df  = df[df['isFraud'] == 0].sample(n=490_000, random_state=42).copy()
df = pd.concat([fraud_df, legit_df], ignore_index=True).sample(frac=1, random_state=42).reset_index(drop=True)
print(f"  Sampled    : {len(df):,} rows  (fraud: {df['isFraud'].sum():,}  legit: {(df['isFraud']==0).sum():,})")

# ── STEP 3: PREPROCESS ───────────────────────────────────────────────────────

print("\nPreprocessing...")
np.random.seed(42)

# Transaction IDs
df['txn_id'] = [f"TXN_{i:08d}" for i in range(len(df))]

# Map types
df['txn_type'] = df['type'].map(TRANSACTION_TYPE_MAP).fillna('OTHER')

# Timestamps: step = hour offset from BASE_DATE
rand_min = np.random.randint(0, 60, len(df))
rand_sec = np.random.randint(0, 60, len(df))
df['timestamp'] = [
    BASE_DATE + timedelta(hours=int(s), minutes=int(m), seconds=int(sec))
    for s, m, sec in zip(df['step'], rand_min, rand_sec)
]
df = df.sort_values('timestamp').reset_index(drop=True)
df['txn_id'] = [f"TXN_{i:08d}" for i in range(len(df))]  # re-ID after sort

# Branch codes (deterministic per account)
def acct_to_branch(name):
    h = int(hashlib.md5(str(name).encode()).hexdigest(), 16)
    return INDIAN_BRANCHES[h % len(INDIAN_BRANCHES)]

df['sender_branch']   = df['nameOrig'].apply(acct_to_branch)
df['receiver_branch'] = df['nameDest'].apply(acct_to_branch)

# Channel
df['channel'] = np.random.choice(CHANNELS, size=len(df), p=CHANNEL_PROBS)
night_mask = df['timestamp'].apply(lambda t: t.hour < 6)
df.loc[night_mask, 'channel'] = np.random.choice(['mobile','internet'], size=night_mask.sum(), p=[0.7,0.3])

# Rename
df = df.rename(columns={
    'nameOrig':        'sender_account',
    'nameDest':        'receiver_account',
    'oldbalanceOrg':   'sender_balance_before',
    'newbalanceOrig':  'sender_balance_after',
    'oldbalanceDest':  'receiver_balance_before',
    'newbalanceDest':  'receiver_balance_after',
    'isFraud':         'is_fraud',
    'isFlaggedFraud':  'is_flagged_fraud',
})

FINAL_COLS = [
    'txn_id','timestamp','sender_account','receiver_account',
    'amount','txn_type','sender_branch','receiver_branch',
    'sender_balance_before','sender_balance_after',
    'receiver_balance_before','receiver_balance_after',
    'channel','is_fraud','is_flagged_fraud','step',
]
df = df[FINAL_COLS]
print(f"  Done. Shape: {df.shape}")

# ── STEP 4: AUGMENT (inject extra fraud patterns) ────────────────────────────

def txn_id_aug(pattern, i, j):
    return f"AUG_{pattern}_{i:04d}_{j:03d}"

all_accounts = df['sender_account'].unique()
new_rows = []

## 4a: Smurfing — large amount split into many small txns
np.random.seed(100)
for i in range(50):
    sender  = np.random.choice(all_accounts)
    total   = np.random.uniform(200_000, 1_000_000)
    n       = np.random.randint(5, 16)
    amounts = np.clip(np.random.dirichlet(np.ones(n)) * total, 1000, 49999)
    recvrs  = np.random.choice(all_accounts, n, replace=False)
    base_t  = BASE_DATE + timedelta(hours=np.random.randint(0, 720))
    s_br    = np.random.choice(INDIAN_BRANCHES)
    for j, (amt, rcv) in enumerate(zip(amounts, recvrs)):
        ts = base_t + timedelta(minutes=np.random.randint(0, 120))
        new_rows.append(dict(
            txn_id=txn_id_aug('SMURF',i,j), timestamp=ts,
            sender_account=sender, receiver_account=rcv,
            amount=round(amt,2), txn_type='NEFT',
            sender_branch=s_br, receiver_branch=np.random.choice(INDIAN_BRANCHES),
            sender_balance_before=total*1.5, sender_balance_after=total*1.5-amt,
            receiver_balance_before=np.random.uniform(10000,500000),
            receiver_balance_after=np.random.uniform(10000,500000)+amt,
            channel=np.random.choice(['mobile','internet']),
            is_fraud=1, is_flagged_fraud=0,
            step=int((ts-BASE_DATE).total_seconds()//3600),
        ))

## 4b: Round-tripping — A→B→C→A circular chains
np.random.seed(200)
for i in range(30):
    size    = np.random.randint(3, 6)
    ring    = np.random.choice(all_accounts, size, replace=False).tolist()
    amt0    = np.random.uniform(100_000, 800_000)
    base_t  = BASE_DATE + timedelta(hours=np.random.randint(0, 720))
    for j in range(size):
        amt = amt0 * (1 - 0.02*j)
        ts  = base_t + timedelta(minutes=10 + j*np.random.randint(5,30))
        new_rows.append(dict(
            txn_id=txn_id_aug('RING',i,j), timestamp=ts,
            sender_account=ring[j], receiver_account=ring[(j+1)%size],
            amount=round(amt,2), txn_type=np.random.choice(['NEFT','IMPS']),
            sender_branch=np.random.choice(INDIAN_BRANCHES),
            receiver_branch=np.random.choice(INDIAN_BRANCHES),
            sender_balance_before=amt0*2, sender_balance_after=amt0*2-amt,
            receiver_balance_before=np.random.uniform(50000,300000),
            receiver_balance_after=np.random.uniform(50000,300000)+amt,
            channel='internet', is_fraud=1, is_flagged_fraud=0,
            step=int((ts-BASE_DATE).total_seconds()//3600),
        ))

## 4c: Rapid multi-hop — A→B→C→D→E in < 1 hour
np.random.seed(300)
for i in range(40):
    length  = np.random.randint(4, 7)
    chain   = np.random.choice(all_accounts, length, replace=False)
    amt0    = np.random.uniform(200_000, 1_500_000)
    base_t  = BASE_DATE + timedelta(hours=np.random.randint(0, 720))
    for j in range(length-1):
        amt = amt0 * (1 - 0.01*j)
        ts  = base_t + timedelta(minutes=j*np.random.randint(2,15))
        new_rows.append(dict(
            txn_id=txn_id_aug('RAPID',i,j), timestamp=ts,
            sender_account=chain[j], receiver_account=chain[j+1],
            amount=round(amt,2), txn_type='IMPS',
            sender_branch=np.random.choice(INDIAN_BRANCHES),
            receiver_branch=np.random.choice(INDIAN_BRANCHES),
            sender_balance_before=amt0*1.2, sender_balance_after=amt0*0.2,
            receiver_balance_before=np.random.uniform(10000,100000),
            receiver_balance_after=np.random.uniform(10000,100000)+amt,
            channel='internet', is_fraud=1, is_flagged_fraud=0,
            step=int((ts-BASE_DATE).total_seconds()//3600),
        ))

## 4d: Dormant account activation
np.random.seed(400)
for i in range(25):
    dormant = f"C_DORMANT_{i:04d}"
    n       = np.random.randint(5, 11)
    total   = np.random.uniform(500_000, 2_000_000)
    base_t  = BASE_DATE + timedelta(hours=np.random.randint(650, 720))
    for j in range(n):
        rcv = np.random.choice(all_accounts)
        amt = total/n * np.random.uniform(0.7, 1.3)
        ts  = base_t + timedelta(minutes=np.random.randint(0,180))
        new_rows.append(dict(
            txn_id=txn_id_aug('DORMANT',i,j), timestamp=ts,
            sender_account=dormant, receiver_account=rcv,
            amount=round(amt,2), txn_type=np.random.choice(['NEFT','IMPS','UPI']),
            sender_branch=np.random.choice(INDIAN_BRANCHES),
            receiver_branch=np.random.choice(INDIAN_BRANCHES),
            sender_balance_before=total*1.1, sender_balance_after=total*1.1-amt,
            receiver_balance_before=np.random.uniform(20000,200000),
            receiver_balance_after=np.random.uniform(20000,200000)+amt,
            channel=np.random.choice(['mobile','internet']),
            is_fraud=1, is_flagged_fraud=0,
            step=int((ts-BASE_DATE).total_seconds()//3600),
        ))

# Merge + sort
aug_df = pd.DataFrame(new_rows)[FINAL_COLS]
df = pd.concat([df, aug_df], ignore_index=True).sort_values('timestamp').reset_index(drop=True)

print(f"\nAugmentation complete:")
print(f"  Total rows : {len(df):,}")
print(f"  Fraud rows : {df['is_fraud'].sum():,}  ({df['is_fraud'].mean()*100:.3f}%)")
print(f"  Smurfing   : {len(df[df['txn_id'].str.startswith('AUG_SMURF')])}")
print(f"  Round-trip : {len(df[df['txn_id'].str.startswith('AUG_RING')])}")
print(f"  Rapid-hop  : {len(df[df['txn_id'].str.startswith('AUG_RAPID')])}")
print(f"  Dormant    : {len(df[df['txn_id'].str.startswith('AUG_DORMANT')])}")

# ── STEP 5: SAVE ─────────────────────────────────────────────────────────────

out_path = "/kaggle/working/transactions_processed.csv"
df.to_csv(out_path, index=False)
size_mb = os.path.getsize(out_path) / (1024*1024)
print(f"\nSaved to: {out_path}")
print(f"File size: {size_mb:.1f} MB")
print("\nDONE. Download transactions_processed.csv from the Output panel.")
