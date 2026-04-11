"""
FundFlow AI — Alert Generator
Creates structured alerts for suspicious activity.
"""
import uuid
import json
from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


ALERT_TYPES = {
    "HIGH_RISK_TRANSACTION":    "Single transaction with risk score > 0.8",
    "FRAUD_RING_DETECTED":      "Circular fund flow pattern detected",
    "RAPID_FUND_MOVEMENT":      "Multi-hop fund movement completed in < 1 hour",
    "SMURFING_DETECTED":        "Multiple small transactions structuring a large sum",
    "MULE_ACCOUNT_FLAGGED":     "Account exhibits money mule behaviour",
    "DORMANT_ACCOUNT_ACTIVATED":"Previously inactive account with sudden burst",
    "UNUSUAL_PATTERN":          "Transaction unusual for this account's history",
}

SEVERITY_MAP = {
    "LOW":      0,
    "MEDIUM":   1,
    "HIGH":     2,
    "CRITICAL": 3,
}

RECOMMENDED_ACTIONS = {
    "HIGH_RISK_TRANSACTION":    "Flag for manual review. Contact account holder if score > 0.9.",
    "FRAUD_RING_DETECTED":      "Freeze all ring accounts immediately. Escalate to fraud team.",
    "RAPID_FUND_MOVEMENT":      "Trace all hops. Freeze final destination account.",
    "SMURFING_DETECTED":        "File Suspicious Transaction Report (STR). Monitor all receivers.",
    "MULE_ACCOUNT_FLAGGED":     "Freeze account. Identify original sender and ultimate receiver.",
    "DORMANT_ACCOUNT_ACTIVATED":"Verify account holder identity. Freeze if unverified.",
    "UNUSUAL_PATTERN":          "Send verification to account holder. Monitor next 24 hours.",
}


def create_alert(
    alert_type: str,
    severity: str,
    accounts_involved: list,
    total_amount: float,
    risk_score: float,
    description: str,
    evidence: dict = None,
    db_conn=None,
) -> dict:
    """
    Create a structured alert and optionally persist to database.

    Returns alert dict.
    """
    alert_id = f"ALT_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6].upper()}"
    ts = datetime.utcnow().isoformat()

    alert = {
        "alert_id":           alert_id,
        "timestamp":          ts,
        "severity":           severity,
        "alert_type":         alert_type,
        "alert_type_desc":    ALERT_TYPES.get(alert_type, ""),
        "accounts_involved":  accounts_involved,
        "total_amount":       round(total_amount, 2),
        "risk_score":         round(risk_score, 4),
        "description":        description,
        "recommended_action": RECOMMENDED_ACTIONS.get(alert_type, "Review manually."),
        "status":             "NEW",
        "evidence":           evidence or {},
    }

    if db_conn:
        _save_alert(alert, db_conn)

    return alert


def _save_alert(alert: dict, conn):
    """Persist alert to SQLite."""
    conn.execute("""
        INSERT OR REPLACE INTO alerts
        (alert_id, timestamp, severity, alert_type, accounts_involved,
         total_amount, risk_score, description, recommended_action, status, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        alert['alert_id'],
        alert['timestamp'],
        alert['severity'],
        alert['alert_type'],
        json.dumps(alert['accounts_involved']),
        alert['total_amount'],
        alert['risk_score'],
        alert['description'],
        alert['recommended_action'],
        alert['status'],
        json.dumps(alert['evidence']),
    ))
    conn.commit()


def generate_high_risk_alert(txn: dict, risk_score: float, db_conn=None) -> dict:
    """Generate alert for a single high-risk transaction."""
    return create_alert(
        alert_type="HIGH_RISK_TRANSACTION",
        severity="CRITICAL" if risk_score >= 0.8 else "HIGH",
        accounts_involved=[txn['sender_account'], txn['receiver_account']],
        total_amount=txn['amount'],
        risk_score=risk_score,
        description=(
            f"Transaction {txn['txn_id']} flagged with risk score {risk_score:.2f}. "
            f"Amount: {txn['amount']:,.0f} via {txn.get('txn_type','N/A')} "
            f"at {txn.get('timestamp','N/A')}."
        ),
        evidence={"txn_id": txn['txn_id'], "risk_score": risk_score},
        db_conn=db_conn,
    )


def generate_ring_alert(ring: dict, db_conn=None) -> dict:
    """Generate alert for a detected fraud ring."""
    accounts = ring['accounts']
    chain_str = " -> ".join(accounts) + f" -> {accounts[0]}"
    return create_alert(
        alert_type="FRAUD_RING_DETECTED",
        severity="CRITICAL",
        accounts_involved=accounts,
        total_amount=ring['total_amount'],
        risk_score=ring['risk_score'],
        description=(
            f"Circular fund flow detected: {chain_str}. "
            f"Total: {ring['total_amount']:,.0f}. "
            f"Completed in {ring['time_span_hrs']:.1f} hours."
        ),
        evidence=ring,
        db_conn=db_conn,
    )


def generate_mule_alert(mule_row: dict, db_conn=None) -> dict:
    """Generate alert for a suspected mule account."""
    return create_alert(
        alert_type="MULE_ACCOUNT_FLAGGED",
        severity="HIGH",
        accounts_involved=[mule_row['account']],
        total_amount=mule_row['total_received'],
        risk_score=mule_row['mule_score'],
        description=(
            f"Account {mule_row['account']} exhibits money mule behaviour. "
            f"Pass-through ratio: {mule_row['passthrough_ratio']:.0%}. "
            f"Avg forwarding delay: {mule_row.get('avg_fwd_delay_min', 'N/A')} min. "
            f"Unique senders: {mule_row['unique_senders']}."
        ),
        evidence=mule_row,
        db_conn=db_conn,
    )
