"""
FundFlow AI — Risk Scoring Engine
Combines ML fraud probability + graph signals into a unified risk score.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import RISK_WEIGHTS, RISK_TIERS


def compute_risk_score(
    ml_fraud_probability: float = 0.0,
    graph_risk_score: float = 0.0,
    ring_involvement_score: float = 0.0,
    mule_account_score: float = 0.0,
    velocity_anomaly_score: float = 0.0,
    amount_anomaly_score: float = 0.0,
) -> dict:
    """
    Compute weighted composite risk score from all intelligence signals.

    Weights (from config):
        ml_fraud_probability:  0.35
        graph_risk_score:      0.20
        ring_involvement:      0.15
        mule_account_score:    0.15
        velocity_anomaly:      0.10
        amount_anomaly:        0.05

    Returns:
        dict with final_score, risk_tier, component_scores
    """
    w = RISK_WEIGHTS

    final_score = (
        w['ml_fraud_probability']  * ml_fraud_probability  +
        w['graph_risk_score']      * graph_risk_score       +
        w['ring_involvement_score'] * ring_involvement_score +
        w['mule_account_score']    * mule_account_score     +
        w['velocity_anomaly_score'] * velocity_anomaly_score +
        w['amount_anomaly_score']  * amount_anomaly_score
    )
    final_score = round(min(final_score, 1.0), 4)

    risk_tier = get_risk_tier(final_score)

    return {
        "final_score":   final_score,
        "risk_tier":     risk_tier,
        "components": {
            "ml_fraud_probability":  round(ml_fraud_probability, 4),
            "graph_risk_score":      round(graph_risk_score, 4),
            "ring_involvement_score": round(ring_involvement_score, 4),
            "mule_account_score":    round(mule_account_score, 4),
            "velocity_anomaly_score": round(velocity_anomaly_score, 4),
            "amount_anomaly_score":  round(amount_anomaly_score, 4),
        },
    }


def get_risk_tier(score: float) -> str:
    """Map a score to a risk tier string."""
    for tier, (lo, hi) in RISK_TIERS.items():
        if lo <= score < hi:
            return tier
    return "CRITICAL"


def compute_velocity_anomaly(txn_count_1h: int, txn_count_24h: int) -> float:
    """
    Simple velocity anomaly score.
    High transaction frequency in short windows is suspicious.
    """
    score = 0.0
    if txn_count_1h >= 10:
        score += 0.6
    elif txn_count_1h >= 5:
        score += 0.3
    elif txn_count_1h >= 3:
        score += 0.1

    if txn_count_24h >= 50:
        score += 0.4
    elif txn_count_24h >= 20:
        score += 0.2

    return min(score, 1.0)


def compute_amount_anomaly(amount: float, sender_avg: float,
                           sender_std: float) -> float:
    """
    Compute amount anomaly score based on z-score vs account history.
    """
    if sender_std <= 0 or sender_avg <= 0:
        return 0.0
    z = abs(amount - sender_avg) / sender_std
    if z > 5:
        return 1.0
    elif z > 3:
        return 0.7
    elif z > 2:
        return 0.4
    elif z > 1:
        return 0.2
    return 0.0
