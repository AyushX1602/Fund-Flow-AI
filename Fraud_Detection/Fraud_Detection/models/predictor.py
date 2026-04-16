"""
FundFlow AI — Inference Engine
Loads the trained XGBoost model and runs predictions.
"""
import os
import sys
import json
import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import MODEL_DIR
from features.engineering import engineer_single, get_feature_columns

_model = None
_metadata = None


def _load_model():
    global _model, _metadata
    if _model is None:
        model_path = os.path.join(MODEL_DIR, "xgboost_fraud.pkl")
        meta_path  = os.path.join(MODEL_DIR, "model_metadata.json")
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model not found at {model_path}. Run `python -m models.trainer` first."
            )
        _model = joblib.load(model_path)
        with open(meta_path) as f:
            _metadata = json.load(f)
    return _model, _metadata


def predict_single(txn: dict, account_history: pd.DataFrame = None,
                   graph_features: dict = None,
                   india_extras: dict = None) -> dict:
    """
    Run fraud prediction on a single transaction in real-time.

    Args:
        txn:             Transaction dict with keys matching schema.
        account_history: Recent transactions by same sender (for rolling features).
        graph_features:  Precomputed account-level graph signals.
        india_extras:    VPA / KYC / CIBIL data per account.

    Returns:
        dict with fraud_probability, fraud_label, risk_tier, top_features.
    """
    model, metadata = _load_model()
    feature_cols = metadata['feature_columns']
    feat_imp     = metadata['feature_importance']

    features = engineer_single(
        txn, account_history,
        graph_features=graph_features or {},
        india_extras=india_extras or {},
    )
    X = np.array([[features.get(col, 0) for col in feature_cols]])

    raw_prob = float(model.predict_proba(X)[0][1])

    # ── Platt scaling calibration ──────────────────────────────────
    # XGBoost raw outputs cluster 0.87-0.99 for all transactions due to
    # PaySim training imbalance. Mathematically derived sigmoid params
    # remap to meaningful probabilities:
    #   raw 0.87 → ~0.00 (safe)     raw 0.95 → ~0.35 (uncertain)
    #   raw 0.94 → ~0.18 (low)      raw 0.97 → ~0.77 (high risk)
    #   raw 0.99 → ~0.97 (critical)
    # Derivation: 0.94→0.18 and 0.97→0.77 solved simultaneously.
    import math
    A, B = -92.0, 88.0   # Platt sigmoid tuned to observed raw score range
    calibrated = 1.0 / (1.0 + math.exp(A * raw_prob + B))
    fraud_prob = round(max(0.0, min(1.0, calibrated)), 4)

    fraud_label = int(fraud_prob >= 0.5)

    # Risk tier
    if fraud_prob < 0.3:
        risk_tier = "LOW"
    elif fraud_prob < 0.6:
        risk_tier = "MEDIUM"
    elif fraud_prob < 0.8:
        risk_tier = "HIGH"
    else:
        risk_tier = "CRITICAL"

    # Top contributing features — use importance ranking, not val × imp
    top = sorted(feat_imp.items(), key=lambda x: abs(x[1]), reverse=True)
    # Filter to only features that are non-zero in this transaction
    active_features = [(k, v) for k, v in top if features.get(k, 0) != 0]
    top_features = active_features[:5] if active_features else top[:5]

    return {
        "fraud_probability": fraud_prob,
        "fraud_label":       fraud_label,
        "risk_tier":         risk_tier,
        "top_features":      [{"feature": k, "contribution": round(v, 4)} for k, v in top_features],
        "raw_features":      features,
        "raw_model_prob":    raw_prob,  # For debugging
    }


def predict_batch(df: pd.DataFrame) -> pd.DataFrame:
    """
    Run fraud prediction on a DataFrame of transactions.
    Returns df with added columns: fraud_probability, fraud_label, risk_tier.
    """
    model, metadata = _load_model()
    feature_cols    = metadata['feature_columns']

    from features.engineering import engineer_features
    df_feat = engineer_features(df)
    X = df_feat[feature_cols].fillna(0)

    probs  = model.predict_proba(X)[:, 1]
    labels = (probs >= 0.5).astype(int)

    def tier(p):
        if p < 0.3:   return "LOW"
        if p < 0.6:   return "MEDIUM"
        if p < 0.8:   return "HIGH"
        return "CRITICAL"

    df = df.copy()
    df['fraud_probability'] = probs.round(4)
    df['fraud_label']       = labels
    df['risk_tier']         = [tier(p) for p in probs]
    return df


def get_model_metadata() -> dict:
    """Return model metadata (metrics, feature importance, params)."""
    _, metadata = _load_model()
    return metadata
