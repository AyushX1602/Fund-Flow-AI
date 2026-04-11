"""
FundFlow AI — Post-Training: Update DB with Fraud Predictions
Uses direct batch inference without re-running slow feature engineering.
Loads graph features, scores all rows, writes back to SQLite in batches.
"""
import pandas as pd
import numpy as np
import sqlite3
import sys
import os
import json
import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_PATH, PROCESSED_DATA_PATH
from features.engineering import engineer_features, get_feature_columns
from features.graph_features import load_graph_features

MODEL_PATH = os.path.join("models", "saved", "xgboost_fraud.pkl")
META_PATH  = os.path.join("models", "saved", "model_metadata.json")


def update_db_with_predictions(batch_size: int = 50000):
    print("=" * 60)
    print("  FundFlow AI — Populating DB with Fraud Scores (v2)")
    print("=" * 60)

    # ── 1. Load model ─────────────────────────────────────────────────────────
    print("\n[1/5] Loading model...")
    model = joblib.load(MODEL_PATH)
    with open(META_PATH) as f:
        meta = json.load(f)
    feature_cols = meta['feature_columns']
    threshold    = meta.get('decision_threshold', 0.70)
    print(f"       AUC-ROC: {meta['metrics']['auc_roc']}")
    print(f"       Features: {len(feature_cols)}")
    print(f"       Decision threshold: {threshold}")

    # ── 2. Load graph features ────────────────────────────────────────────────
    print("\n[2/5] Loading graph features...")
    gf = load_graph_features()
    print(f"       Loaded {len(gf):,} account-level graph features")

    # ── 3. Load CSV + engineer features ───────────────────────────────────────
    print("\n[3/5] Loading transactions + engineering features...")
    df = pd.read_csv(PROCESSED_DATA_PATH)
    print(f"       Rows: {len(df):,}")

    df_feat = engineer_features(df, graph_features=gf)
    X = df_feat[feature_cols].fillna(0)
    print(f"       Feature matrix: {X.shape}")

    # ── 4. Predict ────────────────────────────────────────────────────────────
    print("\n[4/5] Running batch inference...")
    probs = model.predict_proba(X)[:, 1]
    df['fraud_probability'] = np.round(probs, 4)
    df['risk_score']        = np.round(probs, 4)  # Use ML prob as risk score directly
    df['risk_tier'] = pd.cut(
        df['fraud_probability'],
        bins=[-0.001, 0.3, 0.6, 0.8, 1.001],
        labels=['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    ).astype(str)

    high_risk    = (df['fraud_probability'] >= 0.8).sum()
    critical     = (df['fraud_probability'] >= threshold).sum()
    print(f"       High-risk (>=0.8):      {high_risk:,}")
    print(f"       Critical (>={threshold}): {critical:,}")

    # ── 5. Write back to SQLite ───────────────────────────────────────────────
    print("\n[5/5] Updating SQLite database...")
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    # Add risk_tier column if it doesn't exist yet
    try:
        conn.execute("ALTER TABLE transactions ADD COLUMN risk_tier TEXT DEFAULT 'LOW'")
        conn.commit()
        print("       Added risk_tier column.")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-65536")  # 64MB cache

    # Batch update using executemany for speed
    updated = 0
    for i in range(0, len(df), batch_size):
        chunk = df.iloc[i:i+batch_size]
        data  = list(zip(
            chunk['fraud_probability'].tolist(),
            chunk['risk_score'].tolist(),
            chunk['risk_tier'].tolist(),
            chunk['txn_id'].tolist(),
        ))
        conn.executemany(
            "UPDATE transactions SET fraud_probability=?, risk_score=?, risk_tier=? WHERE txn_id=?",
            data
        )
        conn.commit()
        updated += len(chunk)
        print(f"  Updated {updated:,} / {len(df):,} rows...")

    conn.close()

    print("\n" + "=" * 60)
    print("  DB UPDATE COMPLETE")
    print("=" * 60)
    print(f"  High-risk flagged (>=0.8):      {high_risk:,}")
    print(f"  Avg fraud probability:          {df['fraud_probability'].mean():.4f}")
    tier_counts = df['risk_tier'].value_counts()
    for tier in ['CRITICAL','HIGH','MEDIUM','LOW']:
        print(f"  {tier:10s}: {tier_counts.get(tier, 0):>8,}")
    print("=" * 60)


if __name__ == "__main__":
    update_db_with_predictions()
