"""
FundFlow AI — Real-Time Transaction Simulator
Generates live transactions and broadcasts them via WebSocket.
Run with: python -m ingestion.simulator
"""
import asyncio
import random
import string
import sqlite3
import json
import sys
import os
from datetime import datetime
import pandas as pd
import numpy as np
import websockets

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    DB_PATH, INDIAN_BRANCHES, CHANNELS, CHANNEL_WEIGHTS,
    SIMULATION_RATE, SIMULATION_FRAUD_PROBABILITY, API_PORT, API_HOST,
)


def _load_account_pool(db_path: str) -> list:
    """Load existing account IDs from DB for realistic simulation."""
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT DISTINCT sender_account FROM transactions LIMIT 5000"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def _load_account_stats(db_path: str) -> dict:
    """Load per-account average amounts for realistic generation."""
    conn = sqlite3.connect(db_path)
    rows = conn.execute("""
        SELECT sender_account, AVG(amount) as avg_amt, MAX(amount) as max_amt
        FROM transactions
        GROUP BY sender_account
        LIMIT 5000
    """).fetchall()
    conn.close()
    return {r[0]: {"avg": r[1], "max": r[2]} for r in rows}


def generate_transaction(accounts: list, account_stats: dict,
                          inject_fraud: bool = False) -> dict:
    """Generate a single realistic transaction."""
    sender   = random.choice(accounts)
    receiver = random.choice([a for a in accounts if a != sender])
    stats    = account_stats.get(sender, {"avg": 10000, "max": 50000})

    # Amount: normally distributed around account average
    if inject_fraud:
        amount = stats["avg"] * random.uniform(5, 15)  # Anomalously large
    else:
        amount = max(100, abs(random.gauss(stats["avg"], stats["avg"] * 0.3)))

    amount = round(amount, 2)
    txn_type = random.choices(
        ['NEFT', 'UPI', 'ATM', 'DEPOSIT', 'IMPS'],
        weights=[20, 40, 25, 10, 5]
    )[0]

    now = datetime.utcnow()
    txn_id = f"LIVE_{now.strftime('%Y%m%d%H%M%S')}_{random.randint(1000,9999)}"

    return {
        "txn_id":                txn_id,
        "timestamp":             now.isoformat(),
        "sender_account":        sender,
        "receiver_account":      receiver,
        "amount":                amount,
        "txn_type":              txn_type,
        "sender_branch":         random.choice(INDIAN_BRANCHES),
        "receiver_branch":       random.choice(INDIAN_BRANCHES),
        "sender_balance_before": stats["avg"] * random.uniform(2, 10),
        "sender_balance_after":  stats["avg"] * random.uniform(1, 8),
        "receiver_balance_before": stats["avg"] * random.uniform(1, 5),
        "receiver_balance_after":  stats["avg"] * random.uniform(1, 6),
        "channel":               random.choices(CHANNELS, weights=[45,35,20])[0],
        "is_fraud":              1 if inject_fraud else 0,
        "is_flagged_fraud":      0,
        "step":                  743,  # Beyond original dataset
        "fraud_probability":     random.uniform(0.75, 0.99) if inject_fraud else random.uniform(0.01, 0.25),
        "risk_tier":             "CRITICAL" if inject_fraud else "LOW",
    }


async def simulate_live(ws_url: str = None, rate: float = None, db_path: str = None):
    """
    Continuously generate transactions and push to WebSocket.
    Falls back to stdout if WebSocket is unavailable.
    """
    db_path = db_path or DB_PATH
    rate    = rate or SIMULATION_RATE
    ws_url  = ws_url or f"ws://{API_HOST}:{API_PORT}/ws/live-feed"

    print(f"Loading account pool from {db_path}...")
    accounts      = _load_account_pool(db_path)
    account_stats = _load_account_stats(db_path)
    print(f"  Loaded {len(accounts)} accounts")
    print(f"  Simulating {rate} transactions/second")
    print(f"  Fraud injection: {SIMULATION_FRAUD_PROBABILITY*100:.0f}% of transactions")
    print(f"  WebSocket target: {ws_url}")
    print("  Press Ctrl+C to stop\n")

    txn_count = 0
    fraud_count = 0

    try:
        async with websockets.connect(ws_url) as ws:
            print("WebSocket connected. Streaming transactions...")
            while True:
                inject_fraud = random.random() < SIMULATION_FRAUD_PROBABILITY
                txn = generate_transaction(accounts, account_stats, inject_fraud)

                await ws.send(json.dumps({"type": "transaction", "data": txn}))

                txn_count += 1
                if inject_fraud:
                    fraud_count += 1

                if txn_count % 20 == 0:
                    tier = txn['risk_tier']
                    print(f"  [{txn['timestamp'][:19]}] {txn['sender_account'][:12]} "
                          f"-> {txn['receiver_account'][:12]} | "
                          f"{txn['amount']:>12,.0f} | {txn['txn_type']:8s} | {tier}")

                await asyncio.sleep(1.0 / rate)

    except Exception as e:
        print(f"WebSocket unavailable ({e}), printing to stdout instead...")
        while True:
            inject_fraud = random.random() < SIMULATION_FRAUD_PROBABILITY
            txn = generate_transaction(accounts, account_stats, inject_fraud)
            txn_count += 1
            if inject_fraud:
                fraud_count += 1
            tier = txn['risk_tier']
            print(f"  [{txn['timestamp'][:19]}] {txn['sender_account'][:12]} "
                  f"-> {txn['receiver_account'][:12]} | "
                  f"{txn['amount']:>12,.0f} | {txn['txn_type']:8s} | {tier}")
            await asyncio.sleep(1.0 / rate)


if __name__ == "__main__":
    asyncio.run(simulate_live())
