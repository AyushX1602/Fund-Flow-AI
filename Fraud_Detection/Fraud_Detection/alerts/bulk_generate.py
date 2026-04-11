"""
FundFlow AI — Bulk Alert Generation
Scans DB for high-risk transactions and creates alerts.
Run after update_db_scores.py
"""
import sqlite3
import sys
import os
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_PATH
from alerts.generator import generate_high_risk_alert, create_alert
from ingestion.loader import get_db_connection


def generate_bulk_alerts(threshold: float = 0.75, limit: int = 200):
    print("=" * 60)
    print("  FundFlow AI — Bulk Alert Generation")
    print("=" * 60)

    conn = get_db_connection()

    # Clear old alerts
    conn.execute("DELETE FROM alerts")
    conn.commit()

    # Fetch high-risk transactions
    rows = conn.execute(f"""
        SELECT * FROM transactions
        WHERE COALESCE(fraud_probability, 0) >= {threshold}
        ORDER BY fraud_probability DESC
        LIMIT {limit}
    """).fetchall()

    print(f"\nFound {len(rows)} high-risk transactions (prob >= {threshold})")

    alert_count = 0
    for row in rows:
        txn = dict(row)
        risk = float(txn.get('fraud_probability') or 0)
        generate_high_risk_alert(txn, risk, db_conn=conn)
        alert_count += 1

    # Add ring alerts (synthetic for demo)
    rings_demo = [
        {
            "ring_id": "RING_0001",
            "accounts": ["C1231006815", "C422409467", "C553264065"],
            "ring_size": 3,
            "total_amount": 750000.0,
            "time_span_hrs": 1.2,
            "risk_score": 0.92,
            "edges": [],
        },
        {
            "ring_id": "RING_0002",
            "accounts": ["C840083671", "C2083117811", "C1666544295", "C1828508781"],
            "ring_size": 4,
            "total_amount": 1250000.0,
            "time_span_hrs": 2.5,
            "risk_score": 0.85,
            "edges": [],
        },
    ]

    from alerts.generator import generate_ring_alert
    for ring in rings_demo:
        generate_ring_alert(ring, db_conn=conn)
        alert_count += 1

    # Add mule alert (demo)
    from alerts.generator import generate_mule_alert
    mule_demo = {
        "account": "C_DORMANT_0001",
        "mule_score": 0.87,
        "passthrough_ratio": 0.94,
        "avg_fwd_delay_min": 12.0,
        "unique_senders": 8,
        "total_received": 850000.0,
        "total_sent": 799000.0,
    }
    generate_mule_alert(mule_demo, db_conn=conn)
    alert_count += 1

    conn.close()
    print(f"\nGenerated {alert_count} alerts total.")
    print("=" * 60)


def create_demo_cases():
    """Create a few demo investigation cases for the dashboard."""
    print("\nCreating demo investigation cases...")
    conn = get_db_connection()

    # Fetch first few alerts
    alerts = conn.execute(
        "SELECT * FROM alerts ORDER BY risk_score DESC LIMIT 3"
    ).fetchall()

    from investigation.case_manager import create_case
    from alerts.generator import create_alert

    case_count = 0
    for alert_row in alerts:
        alert = dict(alert_row)
        for f in ('accounts_involved', 'evidence'):
            if alert.get(f):
                try: alert[f] = json.loads(alert[f])
                except: pass
        create_case(alert, assigned_to="investigator_01", db_conn=conn)
        case_count += 1

    conn.close()
    print(f"  Created {case_count} demo cases.")


if __name__ == "__main__":
    generate_bulk_alerts()
    create_demo_cases()
