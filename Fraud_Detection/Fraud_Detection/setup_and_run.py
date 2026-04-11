"""
FundFlow AI — One-Shot Setup Script
Run this once to:
1. Verify environment
2. Install dependencies
3. Load data into SQLite (if not done)
4. Train model (if not done)
5. Populate fraud scores
6. Generate alerts and demo cases
7. Launch the dashboard
"""
import os
import sys
import subprocess


def run(cmd, check=True):
    print(f"\n  $ {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=os.path.dirname(os.path.abspath(__file__)))
    if check and result.returncode != 0:
        print(f"  ERROR: Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result.returncode


def check_file(path, label):
    exists = os.path.exists(path)
    status = "OK" if exists else "MISSING"
    print(f"  [{status}] {label}: {path}")
    return exists


def main():
    print("=" * 60)
    print("  FundFlow AI — Setup & Launch")
    print("  PSBs Hackathon Series 2026")
    print("=" * 60)

    base = os.path.dirname(os.path.abspath(__file__))

    # ── Step 1: Check prerequisites ───────────────────────────────────────────
    print("\n[STEP 1] Checking prerequisites...")
    processed_csv = os.path.join(base, "data", "processed", "transactions_processed.csv")
    model_pkl     = os.path.join(base, "models", "saved", "xgboost_fraud.pkl")
    db_path       = os.path.join(base, "fundflow.db")

    has_csv   = check_file(processed_csv, "Processed CSV")
    has_model = check_file(model_pkl,     "Trained Model")
    has_db    = check_file(db_path,       "SQLite Database")

    if not has_csv:
        print("\n  ERROR: Processed CSV not found.")
        print("  Please run the Kaggle notebook (kaggle_preprocess.py) first")
        print("  and place the output at: data/processed/transactions_processed.csv")
        sys.exit(1)

    # ── Step 2: Install dependencies ──────────────────────────────────────────
    print("\n[STEP 2] Installing dependencies...")
    run("pip install -r requirements.txt -q")

    # ── Step 3: Load into SQLite (if not already done) ────────────────────────
    if not has_db:
        print("\n[STEP 3] Loading data into SQLite...")
        run("python -m ingestion.loader")
    else:
        print("\n[STEP 3] SQLite database already exists. Skipping.")

    # ── Step 4: Train model (if not already done) ─────────────────────────────
    if not has_model:
        print("\n[STEP 4] Training XGBoost model (this takes ~5 minutes)...")
        run("python -m models.trainer")
    else:
        print("\n[STEP 4] Model already trained. Skipping.")

    # ── Step 5: Populate fraud scores in DB ───────────────────────────────────
    print("\n[STEP 5] Populating DB with fraud scores...")
    run("python -m models.update_db_scores")

    # ── Step 6: Generate alerts and demo cases ────────────────────────────────
    print("\n[STEP 6] Generating alerts and investigation cases...")
    run("python -m alerts.bulk_generate")

    # ── Step 7: Launch ────────────────────────────────────────────────────────
    print("\n[STEP 7] Launching FundFlow AI...")
    print("\n" + "=" * 60)
    print("  Dashboard : http://127.0.0.1:8000")
    print("  API Docs  : http://127.0.0.1:8000/docs")
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    run("python run.py", check=False)


if __name__ == "__main__":
    main()
