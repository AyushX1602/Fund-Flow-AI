"""
FundFlow AI — Feature Engineering (v3 — India-Production-Ready)
Changes from v2:
  - REMOVED: balance-dependent features (amount_to_balance_ratio,
    balance_change_ratio, balance_increase_flag, balance_drained)
    → These do NOT exist in UPI logs; removing improves generalisability
  - ADDED (9 new features):
      amount_bucket         — UPI/NEFT amount tier (0-4)
      is_new_receiver       — first time this sender sends to this receiver
      receiver_total_recv_count — how many times receiver has been receiving
      sender_total_unique_receivers — total unique counterparties for sender
      hour_velocity_ratio   — how much faster than avg hourly pace
      is_cross_bank_upi     — UPI between different simulated banks
      upi_new_recv_risk     — UPI + new receiver account + large amount
      kyc_risk_flag         — otp_ekyc-only KYC + new account (mule signal)
      cibil_high_txn_flag   — low CIBIL score + large transfer
"""
import hashlib
import pandas as pd
import numpy as np
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import PROCESSED_DATA_PATH

# UPI bank handle mapping (deterministic per account ID)
_BANK_HANDLES = ['oksbi', 'ybl', 'ibl', 'axl', 'apl', 'paytm', 'hdfcbank', 'upi']


def _acct_to_bank_id(acct: str) -> int:
    return int(hashlib.md5(str(acct).encode()).hexdigest(), 16) % len(_BANK_HANDLES)


def engineer_features(df: pd.DataFrame,
                      graph_features: dict = None,
                      india_extras: dict = None) -> pd.DataFrame:
    """
    Build full feature set from transaction DataFrame.

    graph_features : dict {account_id: feature_dict} from graph_features.py
    india_extras   : dict {account_id: {kyc_type, account_age_days,
                     credit_score}} from generate_india_extras.py
                     If None, India-specific features fall back to 0.
    """
    df = df.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    gf = graph_features or {}
    ie = india_extras or {}

    # ── TRANSACTION-LEVEL FEATURES ────────────────────────────────────────────
    df['amount_log']      = np.log1p(df['amount'])
    df['hour_of_day']     = df['timestamp'].dt.hour
    df['day_of_week']     = df['timestamp'].dt.dayofweek
    df['is_weekend']      = (df['day_of_week'] >= 5).astype(int)
    df['is_night']        = (df['hour_of_day'] < 6).astype(int)
    df['is_cross_branch'] = (df['sender_branch'] != df['receiver_branch']).astype(int)

    # Amount bucket: 0=everyday UPI(<500), 1=medium UPI, 2=large UPI/small NEFT,
    #                3=NEFT threshold zone, 4=NEFT/RTGS (>1L)
    df['amount_bucket'] = pd.cut(
        df['amount'],
        bins=[0, 500, 5_000, 50_000, 100_000, float('inf')],
        labels=[0, 1, 2, 3, 4],
        right=True,
    ).astype(float).fillna(2)

    for t in ['NEFT', 'UPI', 'ATM', 'DEPOSIT', 'IMPS']:
        df[f'type_{t}'] = (df['txn_type'] == t).astype(int)
    df['channel_mobile']   = (df['channel'] == 'mobile').astype(int)
    df['channel_internet'] = (df['channel'] == 'internet').astype(int)

    # ── NEW RECEIVER FLAG (first time sender→receiver pair appears) ───────────
    df_tmp = df.sort_values('timestamp')[['txn_id', 'sender_account', 'receiver_account']].copy()
    df_tmp['pair_key'] = df_tmp['sender_account'] + '§' + df_tmp['receiver_account']
    df_tmp['is_new_receiver'] = (~df_tmp['pair_key'].duplicated(keep='first')).astype(int)
    df = df.merge(df_tmp[['txn_id', 'is_new_receiver']], on='txn_id', how='left')
    df['is_new_receiver'] = df['is_new_receiver'].fillna(0).astype(int)

    # ── CROSS-BANK UPI (simulated bank from account ID hash) ──────────────────
    df['_sender_bank']  = df['sender_account'].apply(_acct_to_bank_id)
    df['_receiver_bank'] = df['receiver_account'].apply(_acct_to_bank_id)
    df['is_cross_bank_upi'] = (
        (df['type_UPI'] == 1) & (df['_sender_bank'] != df['_receiver_bank'])
    ).astype(int)
    df.drop(columns=['_sender_bank', '_receiver_bank'], inplace=True)

    # ── RECEIVER & SENDER AGGREGATE STATS (fast groupby, not rolling) ─────────
    recv_counts = (
        df.groupby('receiver_account').size()
          .reset_index(name='receiver_total_recv_count')
    )
    df = df.merge(recv_counts, on='receiver_account', how='left')
    df['receiver_total_recv_count'] = df['receiver_total_recv_count'].fillna(1)

    sender_uniq = (
        df.groupby('sender_account')['receiver_account']
          .nunique()
          .reset_index(name='sender_total_unique_receivers')
    )
    df = df.merge(sender_uniq, on='sender_account', how='left')
    df['sender_total_unique_receivers'] = df['sender_total_unique_receivers'].fillna(1)

    # ── ROLLING TIME-WINDOW FEATURES (vectorised) ─────────────────────────────
    df_sorted = df.sort_values(['sender_account', 'timestamp']).copy()
    df_sorted = df_sorted.set_index('timestamp')
    grp = df_sorted.groupby('sender_account')

    df_sorted['sender_txn_count_1h']  = grp['amount'].transform(lambda x: x.rolling('1h').count())
    df_sorted['sender_txn_count_24h'] = grp['amount'].transform(lambda x: x.rolling('24h').count())
    df_sorted['sender_avg_amount']    = grp['amount'].transform(lambda x: x.expanding().mean())
    df_sorted['sender_std_amount']    = grp['amount'].transform(lambda x: x.expanding().std().fillna(1.0))
    df_sorted['amount_deviation']     = (
        (df_sorted['amount'] - df_sorted['sender_avg_amount']) /
        df_sorted['sender_std_amount'].clip(lower=0.01)
    ).clip(-10, 10)

    df_sorted['receiver_hash'] = df_sorted['receiver_account'].apply(hash).astype(float)
    df_sorted['sender_unique_receivers_1h'] = grp['receiver_hash'].transform(
        lambda x: x.rolling('1h').apply(lambda w: len(set(w.astype(int))), raw=True)
    ).fillna(1)

    # Time since last transaction by same sender
    df_sorted['time_since_last_txn_min'] = grp['amount'].transform(
        lambda x: x.index.to_series().diff().dt.total_seconds().div(60).fillna(9999)
    )

    df_sorted = df_sorted.reset_index()

    agg_cols = [
        'txn_id', 'sender_txn_count_1h', 'sender_txn_count_24h',
        'sender_avg_amount', 'sender_std_amount', 'amount_deviation',
        'sender_unique_receivers_1h', 'time_since_last_txn_min',
    ]
    df = df.merge(df_sorted[agg_cols], on='txn_id', how='left')
    for col in agg_cols[1:]:
        df[col] = df[col].fillna(0)

    # Hour velocity ratio: how many times faster than avg hourly rate
    df['hour_velocity_ratio'] = (
        df['sender_txn_count_1h'] /
        (df['sender_txn_count_24h'] / 24.0).clip(lower=0.1)
    ).clip(upper=10).fillna(1.0)

    # ── RULE-BASED FEATURES (work on ANY real data) ───────────────────────────

    # 1. Structuring thresholds (PMLA-relevant Indian amounts)
    df['near_50k_threshold']  = (df['amount'].between(45000, 49999)).astype(int)
    df['near_100k_threshold'] = (df['amount'].between(90000, 99999)).astype(int)
    df['near_1m_threshold']   = (df['amount'].between(900000, 999999)).astype(int)
    df['near_any_threshold']  = (
        df['near_50k_threshold'] | df['near_100k_threshold'] | df['near_1m_threshold']
    ).astype(int)

    # 2. Round number detection
    df['is_round_10k'] = ((df['amount'] % 10000 == 0) & (df['amount'] >= 10000)).astype(int)
    df['is_round_1k']  = ((df['amount'] % 1000 == 0)  & (df['amount'] >= 1000)).astype(int)

    # 3. Velocity bursts
    df['high_velocity_1h']  = (df['sender_txn_count_1h']  >= 5).astype(int)
    df['high_velocity_24h'] = (df['sender_txn_count_24h'] >= 20).astype(int)

    # 4. Rapid succession
    df['rapid_succession'] = (df['time_since_last_txn_min'] < 5).astype(int)

    # 5. Large amount relative to sender history
    df['amount_gt_5x_avg'] = (
        (df['sender_avg_amount'] > 0) &
        (df['amount'] > 5 * df['sender_avg_amount'])
    ).astype(int)

    # 6. UPI new-receiver risk (new VPA proxy: new account + UPI + large amount)
    df['upi_new_recv_risk'] = (
        (df['type_UPI'] == 1) &
        (df['is_new_receiver'] == 1) &
        (df['amount'] > 10000)
    ).astype(int)

    # ── GRAPH FEATURES (from precomputed account-level signals) ───────────────
    df['sender_mule_score']         = df['sender_account'].map(lambda a: gf.get(a, {}).get('mule_score', 0.0))
    df['sender_in_ring']            = df['sender_account'].map(lambda a: gf.get(a, {}).get('in_ring', 0))
    df['sender_passthrough_ratio']  = df['sender_account'].map(lambda a: gf.get(a, {}).get('passthrough_ratio', 0.0))
    df['sender_is_new_account']     = df['sender_account'].map(lambda a: gf.get(a, {}).get('is_new_account', 0))

    df['receiver_mule_score']           = df['receiver_account'].map(lambda a: gf.get(a, {}).get('mule_score', 0.0))
    df['receiver_in_ring']              = df['receiver_account'].map(lambda a: gf.get(a, {}).get('in_ring', 0))
    df['receiver_unique_senders_total'] = df['receiver_account'].map(lambda a: gf.get(a, {}).get('receiver_unique_senders', 0))
    df['receiver_is_pure_receiver']     = df['receiver_account'].map(lambda a: gf.get(a, {}).get('is_pure_receiver', 0))
    df['receiver_is_suspected_mule']    = df['receiver_account'].map(lambda a: gf.get(a, {}).get('is_suspected_mule', 0))
    df['receiver_is_new_account']       = df['receiver_account'].map(lambda a: gf.get(a, {}).get('is_new_account', 0))

    graph_cols = [
        'sender_mule_score', 'sender_in_ring', 'sender_passthrough_ratio', 'sender_is_new_account',
        'receiver_mule_score', 'receiver_in_ring', 'receiver_unique_senders_total',
        'receiver_is_pure_receiver', 'receiver_is_suspected_mule', 'receiver_is_new_account',
    ]
    for col in graph_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # ── INDIA-SPECIFIC FEATURES (from generate_india_extras.py) ───────────────
    # KYC risk: sender has OTP-only eKYC AND account is new (< 90 days old)
    def _kyc_risk(acct):
        info = ie.get(acct, {})
        kyc  = info.get('kyc_type', 'biometric')
        age  = info.get('account_age_days', 365)
        return 1 if (kyc == 'otp_ekyc' and age < 90) else 0

    df['kyc_risk_flag'] = df['sender_account'].apply(_kyc_risk)

    # CIBIL risk: low credit score + large transfer
    def _cibil_risk(acct, amount):
        score = ie.get(acct, {}).get('credit_score', 700)
        return 1 if (score < 550 and amount > 100_000) else 0

    df['cibil_high_txn_flag'] = df.apply(
        lambda r: _cibil_risk(r['sender_account'], r['amount']), axis=1
    )

    return df


def get_feature_columns() -> list:
    """Return ordered list of ALL 48 feature columns."""
    return [
        # Transaction-level (6)
        'amount_log', 'hour_of_day', 'day_of_week', 'is_weekend', 'is_night',
        'is_cross_branch',

        # Amount bucket & type (8)
        'amount_bucket',
        'type_NEFT', 'type_UPI', 'type_ATM', 'type_DEPOSIT', 'type_IMPS',
        'channel_mobile', 'channel_internet',

        # New receiver & cross-bank (3)
        'is_new_receiver',
        'is_cross_bank_upi',
        'upi_new_recv_risk',

        # Aggregate stats (2)
        'receiver_total_recv_count',
        'sender_total_unique_receivers',

        # Rolling velocity (8)
        'sender_txn_count_1h', 'sender_txn_count_24h',
        'sender_avg_amount', 'sender_std_amount',
        'amount_deviation', 'sender_unique_receivers_1h',
        'time_since_last_txn_min',
        'hour_velocity_ratio',

        # Rule-based (9)
        'near_any_threshold', 'near_50k_threshold', 'near_100k_threshold',
        'near_1m_threshold', 'is_round_10k', 'is_round_1k',
        'high_velocity_1h', 'high_velocity_24h',
        'rapid_succession', 'amount_gt_5x_avg',

        # Graph features — sender (4)
        'sender_mule_score', 'sender_in_ring', 'sender_passthrough_ratio',
        'sender_is_new_account',

        # Graph features — receiver (6)
        'receiver_mule_score', 'receiver_in_ring', 'receiver_unique_senders_total',
        'receiver_is_pure_receiver', 'receiver_is_suspected_mule', 'receiver_is_new_account',

        # India-specific (2)
        'kyc_risk_flag',
        'cibil_high_txn_flag',
    ]


def engineer_single(txn: dict, account_history: pd.DataFrame = None,
                    graph_features: dict = None,
                    india_extras: dict = None) -> dict:
    """Engineer features for a single incoming transaction (real-time inference)."""
    import math
    gf  = graph_features or {}
    ie  = india_extras or {}
    features = {}
    amt      = float(txn.get('amount', 0))
    ts       = pd.to_datetime(txn.get('timestamp', pd.Timestamp.now()))
    sender   = txn.get('sender_account', '')
    receiver = txn.get('receiver_account', '')

    # Transaction-level
    features['amount_log']      = math.log1p(amt)
    features['hour_of_day']     = ts.hour
    features['day_of_week']     = ts.dayofweek
    features['is_weekend']      = int(ts.dayofweek >= 5)
    features['is_night']        = int(ts.hour < 6)
    features['is_cross_branch'] = int(txn.get('sender_branch', '') != txn.get('receiver_branch', ''))

    # Amount bucket
    if amt < 500:      features['amount_bucket'] = 0
    elif amt < 5000:   features['amount_bucket'] = 1
    elif amt < 50000:  features['amount_bucket'] = 2
    elif amt < 100000: features['amount_bucket'] = 3
    else:              features['amount_bucket'] = 4

    for t in ['NEFT', 'UPI', 'ATM', 'DEPOSIT', 'IMPS']:
        features[f'type_{t}'] = int(txn.get('txn_type', '') == t)
    features['channel_mobile']   = int(txn.get('channel', '') == 'mobile')
    features['channel_internet'] = int(txn.get('channel', '') == 'internet')

    # New receiver / cross-bank (require history context — default neutral values)
    features['is_new_receiver']   = 0  # Neutral: don't assume new receiver
    features['is_cross_bank_upi'] = int(
        features['type_UPI'] == 1 and
        _acct_to_bank_id(sender) != _acct_to_bank_id(receiver)
    )
    features['upi_new_recv_risk'] = int(
        features['type_UPI'] == 1 and amt > 50000  # Only flag high-value UPI
    )

    # Aggregate stats — neutral mid-range defaults
    features['receiver_total_recv_count']    = 10  # Established receiver
    features['sender_total_unique_receivers'] = 3  # Typical sender pattern

    # Rolling (from history if available)
    if account_history is not None and len(account_history) > 0:
        h   = account_history
        avg = h['amount'].mean()
        std = h['amount'].std() or 1.0
        features['sender_txn_count_1h']        = len(h)
        features['sender_txn_count_24h']        = len(h)
        features['sender_avg_amount']           = avg
        features['sender_std_amount']           = std
        features['amount_deviation']            = float(np.clip((amt - avg) / std, -10, 10))
        features['sender_unique_receivers_1h']  = h['receiver_account'].nunique()
        features['time_since_last_txn_min']     = 5.0
    else:
        features['sender_txn_count_1h']        = 1
        features['sender_txn_count_24h']        = 5    # Neutral: average daily count
        features['sender_avg_amount']           = 78917.0  # Training data median
        features['sender_std_amount']           = 60000.0  # Realistic std dev
        features['amount_deviation']            = 0.0
        features['sender_unique_receivers_1h']  = 1
        features['time_since_last_txn_min']     = 60.0  # Neutral: 1 hour ago

    features['hour_velocity_ratio'] = min(
        features['sender_txn_count_1h'] / max(features['sender_txn_count_24h'] / 24.0, 0.1),
        10.0
    )

    # Rule-based
    features['near_50k_threshold']  = int(45000 <= amt <= 49999)
    features['near_100k_threshold'] = int(90000 <= amt <= 99999)
    features['near_1m_threshold']   = int(900000 <= amt <= 999999)
    features['near_any_threshold']  = int(
        features['near_50k_threshold'] or
        features['near_100k_threshold'] or
        features['near_1m_threshold']
    )
    features['is_round_10k']        = int(amt >= 10000 and amt % 10000 == 0)
    features['is_round_1k']         = int(amt >= 1000 and amt % 1000 == 0)
    features['high_velocity_1h']    = int(features['sender_txn_count_1h']  >= 5)
    features['high_velocity_24h']   = int(features['sender_txn_count_24h'] >= 20)
    features['rapid_succession']    = int(features['time_since_last_txn_min'] < 5)
    features['amount_gt_5x_avg']    = int(
        features['sender_avg_amount'] > 0 and
        amt > 5 * features['sender_avg_amount']
    )

    # Graph features
    s_gf = gf.get(sender, {})
    features['sender_mule_score']        = s_gf.get('mule_score', 0.0)
    features['sender_in_ring']           = s_gf.get('in_ring', 0)
    features['sender_passthrough_ratio'] = s_gf.get('passthrough_ratio', 0.0)
    features['sender_is_new_account']    = s_gf.get('is_new_account', 0)

    r_gf = gf.get(receiver, {})
    features['receiver_mule_score']           = r_gf.get('mule_score', 0.0)
    features['receiver_in_ring']              = r_gf.get('in_ring', 0)
    features['receiver_unique_senders_total'] = r_gf.get('receiver_unique_senders', 0)
    features['receiver_is_pure_receiver']     = r_gf.get('is_pure_receiver', 0)
    features['receiver_is_suspected_mule']    = r_gf.get('is_suspected_mule', 0)
    features['receiver_is_new_account']       = r_gf.get('is_new_account', 0)

    # India-specific
    s_ie = ie.get(sender, {})
    kyc  = s_ie.get('kyc_type', 'biometric')
    age  = s_ie.get('account_age_days', 365)
    features['kyc_risk_flag']       = int(kyc == 'otp_ekyc' and age < 90)
    features['cibil_high_txn_flag'] = int(s_ie.get('credit_score', 700) < 550 and amt > 100_000)

    return features


if __name__ == '__main__':
    from features.graph_features import load_graph_features
    print('Testing v3 feature engineering on 5000 rows...')
    df = pd.read_csv(PROCESSED_DATA_PATH, nrows=5000)
    gf = load_graph_features()
    print(f'  Graph features loaded: {len(gf)} accounts')
    out = engineer_features(df, graph_features=gf)
    cols = get_feature_columns()
    print(f'  Output shape: {out.shape}')
    print(f'  Feature count: {len(cols)}')
    missing = [c for c in cols if c not in out.columns]
    print(f'  Missing features: {missing}')
    print(f'  Fraud rows: {out["is_fraud"].sum()}')
    print('  OK' if not missing else 'FAIL — missing features!')
