"""
FundFlow AI — Model Trainer
Trains XGBoost fraud detection model on the processed + featured dataset.
Handles class imbalance, evaluates, and saves the model.
"""
import pandas as pd
import numpy as np
import os
import sys
import json
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, roc_auc_score, confusion_matrix,
    precision_score, recall_score, f1_score, average_precision_score
)
import xgboost as xgb

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import PROCESSED_DATA_PATH, MODEL_DIR, XGBOOST_PARAMS
from features.engineering import engineer_features, get_feature_columns
from features.graph_features import load_graph_features, GRAPH_FEATURES_PATH


def train(data_path: str = None, model_dir: str = None, sample_size: int = None):
    """
    Full training pipeline:
    1. Load data
    2. Engineer features
    3. Train XGBoost
    4. Evaluate
    5. Save model + metadata
    """
    data_path = data_path or PROCESSED_DATA_PATH
    model_dir = model_dir or MODEL_DIR
    os.makedirs(model_dir, exist_ok=True)

    # ── 1. LOAD ───────────────────────────────────────────────────────────────
    print("=" * 60)
    print("  FundFlow AI — Model Training")
    print("=" * 60)
    print("\n[1/5] Loading data...")
    if sample_size:
        df = pd.read_csv(data_path, nrows=sample_size)
    else:
        df = pd.read_csv(data_path)
    print(f"       Rows: {len(df):,}  |  Fraud: {df['is_fraud'].sum():,}  ({df['is_fraud'].mean()*100:.3f}%)")

    # ── 2. FEATURE ENGINEERING ────────────────────────────────────────────────
    print("\n[2/5] Engineering features (graph-enhanced)...")
    print("       Loading precomputed graph features...")
    gf = load_graph_features()
    if gf:
        print(f"       Graph features: {len(gf):,} accounts covered")
    else:
        print("       WARNING: No graph features found. Run `python -m features.graph_features` first.")
        print("       Continuing without graph features (22 features only)...")
    print("       Computing rolling aggregates (vectorised)...")
    df_feat = engineer_features(df, graph_features=gf)
    feature_cols = get_feature_columns()

    X = df_feat[feature_cols].fillna(0)
    y = df_feat['is_fraud']
    print(f"       Features: {len(feature_cols)}")
    print(f"       X shape:  {X.shape}")

    # ── 3. TRAIN/TEST SPLIT ───────────────────────────────────────────────────
    print("\n[3/5] Splitting data (80/20 stratified)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"       Train: {len(X_train):,}  |  Test: {len(X_test):,}")
    print(f"       Train fraud: {y_train.sum():,}  |  Test fraud: {y_test.sum():,}")

    # Class imbalance ratio for scale_pos_weight
    neg = (y_train == 0).sum()
    pos = (y_train == 1).sum()
    scale_pos_weight = neg / pos
    print(f"       scale_pos_weight: {scale_pos_weight:.1f}")

    # ── 4. TRAIN ──────────────────────────────────────────────────────────────
    print("\n[4/5] Training XGBoost...")
    params = {**XGBOOST_PARAMS, 'scale_pos_weight': scale_pos_weight}
    model = xgb.XGBClassifier(**params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    # ── 5. EVALUATE ───────────────────────────────────────────────────────────
    print("\n[5/5] Evaluating model...")
    y_prob  = model.predict_proba(X_test)[:, 1]
    auc_roc = roc_auc_score(y_test, y_prob)
    auc_pr  = average_precision_score(y_test, y_prob)
    print(f"\n       AUC-ROC: {auc_roc:.4f}  |  AUC-PR: {auc_pr:.4f}")
    print(f"\n       === Threshold = 0.50 (High Recall) ===")
    y_pred_50  = (y_prob >= 0.50).astype(int)
    prec_50    = precision_score(y_test, y_pred_50, zero_division=0)
    rec_50     = recall_score(y_test, y_pred_50, zero_division=0)
    f1_50      = f1_score(y_test, y_pred_50, zero_division=0)
    cm_50      = confusion_matrix(y_test, y_pred_50).tolist()
    print(f"       Precision: {prec_50:.4f}  Recall: {rec_50:.4f}  F1: {f1_50:.4f}")
    print(f"       TN={cm_50[0][0]:,}  FP={cm_50[0][1]:,}  FN={cm_50[1][0]:,}  TP={cm_50[1][1]:,}")

    print(f"\n       === Threshold = 0.70 (Balanced) ===")
    y_pred_70  = (y_prob >= 0.70).astype(int)
    prec_70    = precision_score(y_test, y_pred_70, zero_division=0)
    rec_70     = recall_score(y_test, y_pred_70, zero_division=0)
    f1_70      = f1_score(y_test, y_pred_70, zero_division=0)
    cm_70      = confusion_matrix(y_test, y_pred_70).tolist()
    print(f"       Precision: {prec_70:.4f}  Recall: {rec_70:.4f}  F1: {f1_70:.4f}")
    print(f"       TN={cm_70[0][0]:,}  FP={cm_70[0][1]:,}  FN={cm_70[1][0]:,}  TP={cm_70[1][1]:,}")

    # Use threshold=0.70 as canonical metrics
    y_pred  = y_pred_70
    prec, rec, f1, cm = prec_70, rec_70, f1_70, cm_70

    # Feature importances
    feat_imp = dict(sorted(
        zip(feature_cols, model.feature_importances_.tolist()),
        key=lambda x: x[1], reverse=True
    ))

    # ── SAVE ──────────────────────────────────────────────────────────────────
    model_path = os.path.join(model_dir, "xgboost_fraud.pkl")
    meta_path  = os.path.join(model_dir, "model_metadata.json")

    joblib.dump(model, model_path)

    metadata = {
        "model_type":       "XGBClassifier",
        "feature_columns":  feature_cols,
        "feature_count":    len(feature_cols),
        "decision_threshold": 0.70,
        "metrics": {
            "auc_roc":    round(auc_roc, 4),
            "auc_pr":     round(auc_pr, 4),
            "precision":  round(prec, 4),
            "recall":     round(rec, 4),
            "f1":         round(f1, 4),
            "confusion_matrix": cm,
        },
        "metrics_threshold_050": {
            "precision": round(prec_50, 4),
            "recall":    round(rec_50, 4),
            "f1":        round(f1_50, 4),
        },
        "graph_features_used": bool(gf),
        "graph_feature_accounts": len(gf),
        "feature_importance": feat_imp,
        "training_rows":  len(X_train),
        "test_rows":      len(X_test),
        "fraud_rate":     round(float(y.mean()), 6),
        "scale_pos_weight": round(float(scale_pos_weight), 2),
        "params":         params,
    }
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\n  Model saved:    {model_path}")
    print(f"  Metadata saved: {meta_path}")
    print("=" * 60)
    print("  TRAINING COMPLETE")
    print("=" * 60)

    return model, metadata


if __name__ == "__main__":
    train()
