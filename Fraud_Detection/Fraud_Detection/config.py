"""
FundFlow AI — Central Configuration
"""
import os

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
MODEL_DIR = os.path.join(BASE_DIR, "models", "saved")

# Database
DB_PATH = os.path.join(BASE_DIR, "fundflow.db")

# PaySim raw file
PAYSIM_RAW_PATH = os.path.join(BASE_DIR, "paysim dataset.csv")
PROCESSED_DATA_PATH = os.path.join(PROCESSED_DIR, "transactions_processed.csv")

# Indian banking context
TRANSACTION_TYPE_MAP = {
    "TRANSFER": "NEFT",
    "CASH_OUT": "ATM",
    "PAYMENT": "UPI",
    "CASH_IN": "DEPOSIT",
    "DEBIT": "IMPS",
}

INDIAN_BRANCHES = [
    "BR_MUMBAI_001", "BR_MUMBAI_002", "BR_MUMBAI_003",
    "BR_DELHI_001", "BR_DELHI_002", "BR_DELHI_003",
    "BR_CHENNAI_001", "BR_CHENNAI_002",
    "BR_BANGALORE_001", "BR_BANGALORE_002",
    "BR_HYDERABAD_001", "BR_HYDERABAD_002",
    "BR_KOLKATA_001", "BR_KOLKATA_002",
    "BR_PUNE_001", "BR_PUNE_002",
    "BR_AHMEDABAD_001",
    "BR_JAIPUR_001",
    "BR_LUCKNOW_001",
    "BR_CHANDIGARH_001",
    "BR_BHOPAL_001",
    "BR_PATNA_001",
    "BR_KOCHI_001",
    "BR_GUWAHATI_001",
    "BR_SURAT_001",
]

BRANCH_CITY_MAP = {
    "BR_MUMBAI": "Mumbai", "BR_DELHI": "Delhi", "BR_CHENNAI": "Chennai",
    "BR_BANGALORE": "Bangalore", "BR_HYDERABAD": "Hyderabad",
    "BR_KOLKATA": "Kolkata", "BR_PUNE": "Pune", "BR_AHMEDABAD": "Ahmedabad",
    "BR_JAIPUR": "Jaipur", "BR_LUCKNOW": "Lucknow",
    "BR_CHANDIGARH": "Chandigarh", "BR_BHOPAL": "Bhopal",
    "BR_PATNA": "Patna", "BR_KOCHI": "Kochi",
    "BR_GUWAHATI": "Guwahati", "BR_SURAT": "Surat",
}

CHANNELS = ["mobile", "internet", "branch"]
CHANNEL_WEIGHTS = [0.45, 0.35, 0.20]  # Mobile-first India

# Model parameters
XGBOOST_PARAMS = {
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.1,
    "min_child_weight": 5,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "objective": "binary:logistic",
    "eval_metric": "aucpr",
    "random_state": 42,
    "n_jobs": -1,
}

# Risk scoring weights
RISK_WEIGHTS = {
    "ml_fraud_probability": 0.35,
    "graph_risk_score": 0.20,
    "ring_involvement_score": 0.15,
    "mule_account_score": 0.15,
    "velocity_anomaly_score": 0.10,
    "amount_anomaly_score": 0.05,
}

# Risk tiers
RISK_TIERS = {
    "LOW": (0.0, 0.3),
    "MEDIUM": (0.3, 0.6),
    "HIGH": (0.6, 0.8),
    "CRITICAL": (0.8, 1.0),
}

# Simulation
SIMULATION_RATE = 2  # transactions per second
SIMULATION_FRAUD_PROBABILITY = 0.05  # 5% fraud injection in live sim

# API
API_HOST = "127.0.0.1"
API_PORT = 8000

# Base date for timestamp conversion
BASE_DATE = "2026-03-01"
