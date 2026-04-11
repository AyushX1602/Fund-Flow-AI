"""
FundFlow AI — India Extras Generator
Populates VPA (UPI Virtual Payment Address), KYC type, account age,
and CIBIL credit score for every account in the database.
This is deterministic (fixed seed) so results are reproducible.

Run:  python scripts/generate_india_extras.py
"""
import os, sys, hashlib, sqlite3
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DB_PATH

# ── Config ────────────────────────────────────────────────────────────────────

BANK_HANDLES = ['oksbi', 'ybl', 'ibl', 'axl', 'apl', 'paytm', 'hdfcbank', 'upi']

# KYC type distribution (aligned with RBI data):
# biometric ~35%, vcip ~20%, otp_ekyc ~35%, minimum_kyc ~10%
KYC_TYPES  = ['biometric', 'vcip', 'otp_ekyc', 'minimum_kyc']
KYC_PROBS  = [0.35,         0.20,   0.35,        0.10]


def acct_hash_int(acct: str) -> int:
    return int(hashlib.md5(str(acct).encode()).hexdigest(), 16)


def acct_to_bank_handle(acct: str) -> str:
    return BANK_HANDLES[acct_hash_int(acct) % len(BANK_HANDLES)]


def generate_vpa(acct: str) -> str:
    handle = acct_to_bank_handle(acct)
    # Realistic VPA: last 10 digits of account @ bank_handle
    suffix = acct.replace('C', '').replace('_DORMANT_', '9')[-10:]
    return f"{suffix}@{handle}"


def generate_india_extras(conn: sqlite3.Connection) -> pd.DataFrame:
    """Generate India-specific metadata for all unique accounts."""

    print("[IndiaExtras] Loading all accounts from DB...")
    rows = conn.execute(
        "SELECT DISTINCT sender_account FROM transactions "
        "UNION SELECT DISTINCT receiver_account FROM transactions"
    ).fetchall()
    accounts = [r[0] for r in rows]
    print(f"[IndiaExtras] Found {len(accounts):,} unique accounts")

    np.random.seed(42)
    rng = np.random.default_rng(42)

    records = []
    for acct in accounts:
        h = acct_hash_int(acct)
        # Deterministic pseudo-random per account
        np.random.seed(h % (2**31))

        kyc_type = np.random.choice(KYC_TYPES, p=KYC_PROBS)

        # Account age: mule / dormant accounts tend to be < 90 days
        if 'DORMANT' in str(acct):
            age_days  = int(np.random.uniform(1, 45))
            kyc_type  = 'otp_ekyc'   # Dormant mule accounts use OTP KYC
        else:
            age_days  = int(np.random.uniform(30, 2000))

        # CIBIL score 300–900 (normal distribution centred at 680)
        credit_score = int(np.clip(np.random.normal(680, 120), 300, 900))

        records.append({
            'account_id':     acct,
            'vpa':            generate_vpa(acct),
            'bank_handle':    acct_to_bank_handle(acct),
            'kyc_type':       kyc_type,
            'account_age_days': age_days,
            'credit_score':   credit_score,
        })

    df = pd.DataFrame(records)
    print(f"[IndiaExtras] Generated metadata for {len(df):,} accounts")
    print(f"  KYC distribution:\n{df['kyc_type'].value_counts()}")
    print(f"  Avg credit score: {df['credit_score'].mean():.0f}")
    print(f"  Accounts with OTP+new (<90d): {((df['kyc_type']=='otp_ekyc') & (df['account_age_days']<90)).sum()}")
    return df


def save_to_db(df: pd.DataFrame, conn: sqlite3.Connection):
    """Create account_profiles table and insert rows."""
    conn.execute("DROP TABLE IF EXISTS account_profiles")
    conn.execute("""
        CREATE TABLE account_profiles (
            account_id       TEXT PRIMARY KEY,
            vpa              TEXT,
            bank_handle      TEXT,
            kyc_type         TEXT,
            account_age_days INTEGER,
            credit_score     INTEGER
        )
    """)
    rows = df[['account_id', 'vpa', 'bank_handle', 'kyc_type',
               'account_age_days', 'credit_score']].values.tolist()
    conn.executemany(
        "INSERT OR REPLACE INTO account_profiles VALUES (?,?,?,?,?,?)", rows
    )
    conn.commit()
    print(f"[IndiaExtras] Saved {len(rows):,} rows to account_profiles table")


def save_to_pickle(df: pd.DataFrame):
    """Also save as a dict for fast in-process lookup."""
    import pickle
    out = df.set_index('account_id').to_dict(orient='index')
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'data', 'processed', 'india_extras.pkl'
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        pickle.dump(out, f)
    print(f"[IndiaExtras] Saved lookup dict to {path}")
    return path


if __name__ == '__main__':
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        df = generate_india_extras(conn)
        save_to_db(df, conn)
        pkl_path = save_to_pickle(df)
        print("[IndiaExtras] Done.")
        print(f"  Load with:  pd.read_sql('SELECT * FROM account_profiles', conn)")
        print(f"  Or pkl at:  {pkl_path}")
    finally:
        conn.close()
