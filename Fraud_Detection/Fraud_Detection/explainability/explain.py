"""
FundFlow AI — Explainability Module
Two-level explanations for why a transaction was flagged:
  Level 1: SHAP feature importance (ML model)
  Level 2: Graph-based narrative explanation
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import MODEL_DIR

_explainer = None


def _get_explainer():
    """Lazy-load SHAP TreeExplainer (only after model is trained)."""
    global _explainer
    if _explainer is None:
        import shap
        import joblib
        model_path = os.path.join(MODEL_DIR, "xgboost_fraud.pkl")
        if not os.path.exists(model_path):
            return None
        model = joblib.load(model_path)
        _explainer = shap.TreeExplainer(model)
    return _explainer


def explain_transaction_ml(features: dict, feature_cols: list) -> dict:
    """
    Generate SHAP-based explanation for a transaction.

    Args:
        features: dict of feature_name -> value (from engineer_single)
        feature_cols: ordered list of feature column names

    Returns:
        dict with top_factors (list of {feature, value, contribution, direction})
    """
    try:
        import shap
        import numpy as np

        explainer = _get_explainer()
        if explainer is None:
            return _fallback_explanation(features, feature_cols)

        X = np.array([[features.get(col, 0.0) for col in feature_cols]])
        shap_values = explainer.shap_values(X)

        # For binary classification, shap_values may be a list [neg, pos]
        if isinstance(shap_values, list):
            vals = shap_values[1][0]
        else:
            vals = shap_values[0]

        # Build explanation pairs
        contributions = [
            {
                "feature":      col,
                "value":        round(float(features.get(col, 0)), 4),
                "contribution": round(float(v), 6),
                "direction":    "increases_risk" if v > 0 else "decreases_risk",
            }
            for col, v in zip(feature_cols, vals)
        ]
        contributions.sort(key=lambda x: abs(x['contribution']), reverse=True)

        return {
            "method":      "SHAP",
            "top_factors": contributions[:8],
            "narrative":   _build_narrative(contributions[:5]),
        }
    except Exception as e:
        return _fallback_explanation(features, feature_cols)


def _fallback_explanation(features: dict, feature_cols: list) -> dict:
    """Fallback when SHAP is unavailable: uses raw feature values as heuristic."""
    import json
    with open(os.path.join(MODEL_DIR, "model_metadata.json")) as f:
        meta = json.load(f)
    feat_imp = meta.get('feature_importance', {})

    contributions = [
        {
            "feature":      col,
            "value":        round(float(features.get(col, 0)), 4),
            "contribution": round(float(features.get(col, 0)) * float(feat_imp.get(col, 0)), 6),
            "direction":    "increases_risk",
        }
        for col in feature_cols
    ]
    contributions.sort(key=lambda x: abs(x['contribution']), reverse=True)
    return {
        "method":      "feature_importance",
        "top_factors": contributions[:8],
        "narrative":   _build_narrative(contributions[:5]),
    }


def _build_narrative(top_factors: list) -> list:
    """Convert SHAP factors into human-readable sentences."""
    LABELS = {
        "amount_log":              "Transaction amount",
        "hour_of_day":             "Time of transaction",
        "is_night":                "Night-time transaction (12AM–6AM)",
        "is_cross_branch":         "Cross-branch transfer",
        "amount_to_balance_ratio": "Amount relative to account balance",
        "balance_change_ratio":    "Balance drain ratio",
        "balance_increase_flag":   "Suspicious balance increase",
        "sender_txn_count_1h":     "Transactions in last 1 hour",
        "sender_txn_count_24h":    "Transactions in last 24 hours",
        "amount_deviation":        "Deviation from sender's normal amount",
        "sender_unique_receivers_1h": "Unique receivers in last 1 hour",
        "type_NEFT":               "NEFT transfer type",
        "type_ATM":                "ATM withdrawal",
        "type_IMPS":               "IMPS transfer (high speed)",
    }
    sentences = []
    for f in top_factors:
        if abs(f['contribution']) < 0.001:
            continue
        label = LABELS.get(f['feature'], f['feature'].replace('_', ' ').title())
        direction = "elevated" if f['direction'] == 'increases_risk' else "reduced"
        sentences.append(
            f"{label} (value: {f['value']}) {direction} fraud risk"
            f" (contribution: {f['contribution']:+.4f})"
        )
    return sentences


def explain_graph(fund_flow_result: dict, ring: dict = None,
                  mule_info: dict = None) -> dict:
    """
    Build a graph-based narrative explanation.

    Args:
        fund_flow_result: Output from FundFlowGraph.trace_fund_flow()
        ring: Detected ring dict (optional)
        mule_info: Mule account info (optional)

    Returns:
        dict with graph_narrative (list of strings), graph_summary
    """
    narrative = []
    summary   = fund_flow_result.get('summary', {})

    if summary.get('total_hops', 0) > 0:
        narrative.append(
            f"Fund flow traced through {summary['total_hops']} hops "
            f"involving {summary['nodes_involved']} accounts."
        )
        if summary.get('time_span_min', 0) < 60:
            narrative.append(
                f"All transfers completed within {summary['time_span_min']} minutes — "
                f"highly suspicious rapid movement."
            )
        if summary.get('fraud_edges', 0) > 0:
            narrative.append(
                f"{summary['fraud_edges']} of the traced edges are flagged as fraud."
            )

    if ring:
        accounts = ring.get('accounts', [])
        chain    = " -> ".join(accounts) + f" -> {accounts[0]}" if accounts else ""
        narrative.append(
            f"Circular pattern detected: {chain}. "
            f"Total amount: {ring.get('total_amount', 0):,.0f}. "
            f"Completed in {ring.get('time_span_hrs', 0):.1f} hours. "
            f"This matches known round-tripping behaviour."
        )

    if mule_info:
        acct = mule_info.get('account', '')
        score = mule_info.get('mule_score', 0)
        ratio = mule_info.get('passthrough_ratio', 0)
        narrative.append(
            f"Account {acct} is a suspected money mule (score: {score:.0%}). "
            f"Pass-through ratio: {ratio:.0%} — receives and immediately forwards funds."
        )

    return {
        "graph_narrative": narrative,
        "graph_summary":   summary,
    }
