"""
FundFlow AI — Data Loader
Loads processed CSV into SQLite database for fast querying.
"""
import pandas as pd
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DB_PATH, PROCESSED_DATA_PATH


def init_db(db_path: str = None) -> sqlite3.Connection:
    """Initialize SQLite database with schema."""
    db_path = db_path or DB_PATH
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Transactions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            txn_id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            sender_account TEXT NOT NULL,
            receiver_account TEXT NOT NULL,
            amount REAL NOT NULL,
            txn_type TEXT NOT NULL,
            sender_branch TEXT,
            receiver_branch TEXT,
            sender_balance_before REAL,
            sender_balance_after REAL,
            receiver_balance_before REAL,
            receiver_balance_after REAL,
            channel TEXT,
            is_fraud INTEGER DEFAULT 0,
            is_flagged_fraud INTEGER DEFAULT 0,
            step INTEGER,
            fraud_probability REAL DEFAULT NULL,
            risk_score REAL DEFAULT NULL
        )
    """)

    # Alerts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            alert_id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            severity TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            accounts_involved TEXT,
            total_amount REAL,
            risk_score REAL,
            description TEXT,
            recommended_action TEXT,
            status TEXT DEFAULT 'NEW',
            evidence TEXT
        )
    """)

    # Cases table (investigation)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cases (
            case_id TEXT PRIMARY KEY,
            status TEXT DEFAULT 'NEW',
            priority TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            assigned_to TEXT,
            linked_alerts TEXT,
            linked_accounts TEXT,
            total_exposure REAL DEFAULT 0.0,
            timeline TEXT DEFAULT '[]',
            notes TEXT DEFAULT '[]',
            evidence TEXT DEFAULT '{}'
        )
    """)

    # Indices for fast queries
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_txn_sender ON transactions(sender_account)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_txn_receiver ON transactions(receiver_account)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_txn_timestamp ON transactions(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_txn_fraud ON transactions(is_fraud)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(txn_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_alert_status ON alerts(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_case_status ON cases(status)")

    conn.commit()
    return conn


def load_csv_to_db(csv_path: str = None, db_path: str = None, batch_size: int = 20000) -> int:
    """
    Load processed CSV into SQLite database.

    Args:
        csv_path: Path to processed CSV.
        db_path: Path to SQLite database.
        batch_size: Number of rows to insert per batch.

    Returns:
        Number of rows loaded.
    """
    csv_path = csv_path or PROCESSED_DATA_PATH
    db_path = db_path or DB_PATH

    # Remove old database to start fresh
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Removed old database: {db_path}")

    print(f"Loading data from: {csv_path}")
    print(f"Database: {db_path}")

    conn = init_db(db_path)

    # Enable WAL mode for better write performance and avoid disk I/O errors
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
    conn.execute("PRAGMA temp_store=MEMORY")

    # Drop indices during bulk load for speed
    conn.execute("DROP INDEX IF EXISTS idx_txn_sender")
    conn.execute("DROP INDEX IF EXISTS idx_txn_receiver")
    conn.execute("DROP INDEX IF EXISTS idx_txn_timestamp")
    conn.execute("DROP INDEX IF EXISTS idx_txn_fraud")
    conn.execute("DROP INDEX IF EXISTS idx_txn_type")
    conn.commit()

    # Define dtypes to reduce memory usage
    dtypes = {
        'txn_id': 'str',
        'sender_account': 'str',
        'receiver_account': 'str',
        'amount': 'float32',
        'txn_type': 'category',
        'sender_branch': 'category',
        'receiver_branch': 'category',
        'sender_balance_before': 'float32',
        'sender_balance_after': 'float32',
        'receiver_balance_before': 'float32',
        'receiver_balance_after': 'float32',
        'channel': 'category',
        'is_fraud': 'int8',
        'is_flagged_fraud': 'int8',
        'step': 'int16',
    }

    # Load in chunks for memory efficiency
    import gc
    total_rows = 0
    reader = pd.read_csv(csv_path, chunksize=batch_size, dtype=dtypes, low_memory=True)
    for chunk_idx, chunk in enumerate(reader):
        chunk.to_sql('transactions', conn, if_exists='append', index=False)
        conn.commit()  # Commit after each chunk
        total_rows += len(chunk)
        if (chunk_idx + 1) % 25 == 0:
            print(f"  Loaded {total_rows:,} rows...")
        del chunk
        if (chunk_idx + 1) % 50 == 0:
            gc.collect()
    del reader
    gc.collect()

    # Recreate indices after bulk load
    print("  Creating indices...")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_txn_sender ON transactions(sender_account)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_txn_receiver ON transactions(receiver_account)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_txn_timestamp ON transactions(timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_txn_fraud ON transactions(is_fraud)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(txn_type)")
    conn.commit()

    # Verify
    cursor = conn.cursor()
    count = cursor.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    fraud_count = cursor.execute("SELECT COUNT(*) FROM transactions WHERE is_fraud = 1").fetchone()[0]

    print(f"\nDatabase loaded successfully:")
    print(f"  Total rows:  {count:,}")
    print(f"  Fraud rows:  {fraud_count:,}")
    print(f"  DB size:     {os.path.getsize(db_path) / (1024*1024):.1f} MB")

    conn.close()
    return total_rows


def get_db_connection(db_path: str = None) -> sqlite3.Connection:
    """Get a database connection. Use for queries throughout the app."""
    db_path = db_path or DB_PATH
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


if __name__ == "__main__":
    load_csv_to_db()
