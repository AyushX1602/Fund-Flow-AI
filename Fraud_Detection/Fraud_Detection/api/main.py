"""
FundFlow AI — FastAPI Backend
Main application with all routes, WebSocket, and static file serving.
"""
import os
import sys
import json
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DB_PATH, PROCESSED_DATA_PATH
from ingestion.loader import get_db_connection, init_db

# ── Global State ──────────────────────────────────────────────────────────────
_graph         = None
_mule_scores   = None
_rings         = None
_india_extras: dict = {}   # {account_id: {kyc_type, account_age_days, credit_score, vpa}}
_graph_features: dict = {} # {account_id: graph feature dict}
_ws_clients: list[WebSocket] = []

# Simulation state
_sim_running: bool = False
_sim_task            = None
_sim_stats: dict     = {"processed": 0, "fraud_detected": 0}


def get_graph():
    global _graph
    return _graph


def get_mule_scores():
    global _mule_scores
    return _mule_scores


def get_rings():
    global _rings
    return _rings


def get_india_extras() -> dict:
    global _india_extras
    return _india_extras


def get_graph_features() -> dict:
    global _graph_features
    return _graph_features


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: build graph from database on boot."""
    global _graph, _mule_scores, _rings, _india_extras
    print("[STARTUP] Initialising FundFlow AI...")

    conn = get_db_connection()
    conn.close()

    # ── Load India extras (VPA / KYC / CIBIL) ────────────────────────────────
    try:
        import pickle
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        extras_path = os.path.join(base, 'data', 'processed', 'india_extras.pkl')
        gf_path     = os.path.join(base, 'data', 'processed', 'graph_features.pkl')

        if os.path.exists(extras_path):
            with open(extras_path, 'rb') as f:
                _india_extras = pickle.load(f)
            print(f"[STARTUP] India extras loaded: {len(_india_extras):,} accounts")
        else:
            print("[STARTUP] India extras not found — run scripts/generate_india_extras.py")

        if os.path.exists(gf_path):
            with open(gf_path, 'rb') as f:
                _graph_features = pickle.load(f)
            print(f"[STARTUP] Graph features loaded: {len(_graph_features):,} accounts")
        else:
            print("[STARTUP] Graph features not found — run python -m features.graph_features")
    except Exception as e:
        print(f"[STARTUP WARNING] Extras load failed: {e}")

    # ── Build transaction graph ───────────────────────────────────────────────
    try:
        print("[STARTUP] Building transaction graph...")
        from graph.fund_flow import FundFlowGraph
        from graph.ring_detector import find_cycles
        from graph.mule_detector import compute_mule_scores

        conn = get_db_connection()
        rows = conn.execute("""
            SELECT txn_id, sender_account, receiver_account, amount,
                   timestamp, is_fraud, txn_type, step,
                   COALESCE(fraud_probability, 0.0) as fraud_probability
            FROM transactions
            WHERE step >= 600
            LIMIT 50000
        """).fetchall()
        conn.close()

        df_graph = pd.DataFrame([dict(r) for r in rows])
        _graph = FundFlowGraph()
        _graph.build_from_df(df_graph)
        print(f"[STARTUP] Graph built: {_graph.get_graph_stats()}")

        _rings = find_cycles(_graph.G, max_length=5, time_window_hours=24)
        print(f"[STARTUP] Rings detected: {len(_rings)}")

        # Pass KYC data to mule scorer
        _mule_scores = compute_mule_scores(_graph.G, df_graph,
                                           kyc_data=_india_extras)
        print(f"[STARTUP] Mule scores computed: {len(_mule_scores)} accounts")

    except Exception as e:
        print(f"[STARTUP WARNING] Graph init failed: {e}")
        _graph = None
        _mule_scores = pd.DataFrame()
        _rings = []

    print("[STARTUP] FundFlow AI ready.")
    yield
    print("[SHUTDOWN] FundFlow AI shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="FundFlow AI",
    description="Real-Time Fraud Intelligence & Fund Flow Tracking System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static dashboard files — mount css and js so paths like /css/style.css work
dashboard_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dashboard")
if os.path.exists(dashboard_dir):
    css_dir = os.path.join(dashboard_dir, "css")
    js_dir  = os.path.join(dashboard_dir, "js")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js",  StaticFiles(directory=js_dir),  name="js")
    assets_dir = os.path.join(dashboard_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


# ── Routes ────────────────────────────────────────────────────────────────────

# ── Node.js Adapter Endpoints ─────────────────────────────────────────────────
# These endpoints allow the Node.js backend (server/) to talk to this service.

@app.get("/health")
def health_check():
    """Health check for Node.js server auto-detection."""
    return {"status": "ok", "model": "xgboost_fraud", "version": "v1", "features": 49}


@app.post("/predict")
def predict_for_nodejs(txn: dict):
    """
    Adapter: Score a transaction for Node.js server.
    Node.js sends: { amount, type, channel, sender_account, receiver_account, ... }
    We return: { fraud_score, is_fraud, reasons[], model_version }
    """
    try:
        from models.predictor import predict_single as _predict

        # Map Node.js field names to what our model expects
        mapped_txn = {
            "txn_id": txn.get("transaction_id", txn.get("txn_id", "")),
            "amount": float(txn.get("amount", 0)),
            "txn_type": txn.get("type", txn.get("txn_type", "UPI")),
            "channel": txn.get("channel", "mobile"),
            "sender_account": txn.get("sender_account", ""),
            "receiver_account": txn.get("receiver_account", ""),
            "timestamp": txn.get("timestamp", datetime.now().isoformat()),
            "step": txn.get("step", 1),
            "is_fraud": txn.get("is_fraud", 0),
            "sender_balance_before": float(txn.get("sender_balance_before", 0)),
            "sender_balance_after": float(txn.get("sender_balance_after", 0)),
            "sender_branch": txn.get("sender_branch", "BR_MUMBAI_001"),
            "receiver_branch": txn.get("receiver_branch", "BR_DELHI_001"),
        }

        result = _predict(
            mapped_txn,
            graph_features=_graph_features,
            india_extras=_india_extras,
        )

        return {
            "fraud_score": result["fraud_probability"],
            "is_fraud": result["fraud_label"] == 1,
            "reasons": [
                {
                    "feature": f["feature"],
                    "impact": abs(f["contribution"]),
                    "value": f["contribution"],
                    "description": f["feature"].replace("_", " ").title(),
                }
                for f in result["top_features"]
            ],
            "risk_tier": result["risk_tier"],
            "model_version": "xgboost-v1",
        }
    except Exception as e:
        print(f"[PREDICT] Error scoring transaction: {e}")
        raise HTTPException(500, f"Scoring error: {str(e)}")


@app.get("/model-info")
def model_info_for_nodejs():
    """Adapter: Return model info for Node.js server."""
    try:
        perf = model_performance()
        return {
            "modelName": "xgboost-fraud-detector",
            "version": "v1",
            "type": "XGBoost",
            "description": f"XGBoost with {perf.get('feature_count', 49)} features, AUC-ROC {perf.get('metrics', {}).get('auc_roc', 'N/A')}",
            "rulesCount": perf.get("feature_count", 49),
            "isMLActive": True,
            "metrics": perf.get("metrics", {}),
            "feature_importance": perf.get("feature_importance", {}),
            "features": perf.get("feature_columns", []),
        }
    except Exception as e:
        return {
            "modelName": "xgboost-fraud-detector",
            "version": "v1",
            "type": "XGBoost",
            "isMLActive": True,
            "error": str(e),
        }


@app.get("/explain/{txn_id}")
def explain_for_nodejs(txn_id: str):
    """Adapter: Return SHAP explanation for Node.js server."""
    return explain_transaction(txn_id)


# ── Original Routes ───────────────────────────────────────────────────────────

@app.get("/")
def root():
    """Serve dashboard."""
    index_path = os.path.join(dashboard_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "FundFlow AI API running. Dashboard not built yet."}


@app.get("/api/stats/dashboard")
def dashboard_stats():
    """Aggregate statistics for the main dashboard."""
    conn = get_db_connection()
    try:
        total     = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        fraud_cnt = conn.execute("SELECT COUNT(*) FROM transactions WHERE is_fraud=1").fetchone()[0]
        alerts    = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='NEW'").fetchone()[0]
        cases     = conn.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
        high_risk = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE fraud_probability >= 0.8"
        ).fetchone()[0]

        # Risk distribution
        risk_dist = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
        for row in conn.execute("""
            SELECT
              CASE
                WHEN COALESCE(fraud_probability,0) < 0.3 THEN 'LOW'
                WHEN COALESCE(fraud_probability,0) < 0.6 THEN 'MEDIUM'
                WHEN COALESCE(fraud_probability,0) < 0.8 THEN 'HIGH'
                ELSE 'CRITICAL'
              END as tier,
              COUNT(*) as cnt
            FROM transactions
            GROUP BY tier
        """).fetchall():
            risk_dist[row[0]] = row[1]

        # Fraud by type
        fraud_by_type = {}
        for row in conn.execute("""
            SELECT txn_type, COUNT(*) as cnt
            FROM transactions WHERE is_fraud=1
            GROUP BY txn_type
        """).fetchall():
            fraud_by_type[row[0]] = row[1]

        return {
            "total_transactions":  total,
            "fraud_count":         fraud_cnt,
            "fraud_rate":          round(fraud_cnt / total * 100, 3) if total else 0,
            "active_alerts":       alerts,
            "total_cases":         cases,
            "high_risk_count":     high_risk,
            "risk_distribution":   risk_dist,
            "fraud_by_type":       fraud_by_type,
            "rings_detected":      len(_rings) if _rings else 0,
            "mules_detected":      (
                int((_mule_scores['is_suspected_mule'] == 1).sum())
                if _mule_scores is not None and len(_mule_scores) > 0 else 0
            ),
        }
    finally:
        conn.close()


@app.get("/api/transactions")
def list_transactions(
    page: int = 1, limit: int = 50,
    fraud_only: bool = False,
    risk_tier: str = None,
):
    """List transactions with pagination and filters."""
    conn = get_db_connection()
    try:
        offset = (page - 1) * limit
        where_clauses = []
        if fraud_only:
            where_clauses.append("is_fraud = 1")
        if risk_tier:
            tier_map = {"LOW":"< 0.3", "MEDIUM":"BETWEEN 0.3 AND 0.6",
                        "HIGH":"BETWEEN 0.6 AND 0.8", "CRITICAL":">= 0.8"}
            if risk_tier in tier_map:
                where_clauses.append(f"COALESCE(fraud_probability,0) {tier_map[risk_tier]}")
        where = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
        rows = conn.execute(f"""
            SELECT * FROM transactions {where}
            ORDER BY timestamp DESC LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()
        total = conn.execute(f"SELECT COUNT(*) FROM transactions {where}").fetchone()[0]
        return {
            "transactions": [dict(r) for r in rows],
            "total": total, "page": page, "limit": limit,
        }
    finally:
        conn.close()


@app.get("/api/transactions/{txn_id}")
def get_transaction(txn_id: str):
    """Single transaction detail with fraud score."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT * FROM transactions WHERE txn_id=?", (txn_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Transaction {txn_id} not found")
        return dict(row)
    finally:
        conn.close()


@app.get("/api/fund-flow/{account_id}")
def trace_fund_flow(account_id: str, max_hops: int = 6, time_window_hours: int = 24):
    """Trace fund flow from an account."""
    graph = get_graph()
    if not graph:
        raise HTTPException(503, "Graph not initialised yet")
    result = graph.trace_fund_flow(account_id, max_hops, time_window_hours)
    profile = graph.get_account_profile(account_id)
    return {"fund_flow": result, "account_profile": profile}


@app.get("/api/rings")
def get_rings():
    """Get all detected fraud rings."""
    rings = _rings or []
    return {
        "rings": rings[:50],
        "total": len(rings),
        "high_risk": sum(1 for r in rings if r['risk_score'] > 0.6),
    }


@app.get("/api/mules")
def get_mules(limit: int = 50):
    """Get suspected mule accounts."""
    if _mule_scores is None or len(_mule_scores) == 0:
        return {"mules": [], "total": 0}
    suspected = _mule_scores[_mule_scores['is_suspected_mule'] == 1]
    return {
        "mules": suspected.head(limit).to_dict(orient='records'),
        "total": len(suspected),
    }


@app.get("/api/mule-network")
def get_mule_network():
    """Get mule network subgraph for visualization."""
    graph = get_graph()
    if not graph or _mule_scores is None or len(_mule_scores) == 0:
        return {"nodes": [], "edges": [], "suspected_mules": 0}
    from graph.mule_detector import get_mule_network
    return get_mule_network(_mule_scores, graph.G)


@app.get("/api/alerts")
def list_alerts(status: str = None, limit: int = 50):
    """List alerts, optionally filtered by status."""
    conn = get_db_connection()
    try:
        if status:
            rows = conn.execute(
                "SELECT * FROM alerts WHERE status=? ORDER BY timestamp DESC LIMIT ?",
                (status, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?", (limit,)
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            for f in ('accounts_involved', 'evidence'):
                if d.get(f):
                    try: d[f] = json.loads(d[f])
                    except: pass
            result.append(d)
        return {"alerts": result, "total": len(result)}
    finally:
        conn.close()


@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str):
    """Get single alert detail."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT * FROM alerts WHERE alert_id=?", (alert_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Alert {alert_id} not found")
        d = dict(row)
        for f in ('accounts_involved', 'evidence'):
            if d.get(f):
                try: d[f] = json.loads(d[f])
                except: pass
        return d
    finally:
        conn.close()


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: str, status: str):
    """Update alert status."""
    valid = {"NEW","INVESTIGATING","CLOSED","FALSE_POSITIVE"}
    if status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of {valid}")
    conn = get_db_connection()
    try:
        conn.execute("UPDATE alerts SET status=? WHERE alert_id=?", (status, alert_id))
        conn.commit()
        return {"alert_id": alert_id, "status": status}
    finally:
        conn.close()


@app.get("/api/cases")
def list_cases(status: str = None, limit: int = 50):
    """List investigation cases."""
    from investigation.case_manager import list_cases as _list
    conn = get_db_connection()
    try:
        return {"cases": _list(conn, status=status, limit=limit)}
    finally:
        conn.close()


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    """Get case detail."""
    from investigation.case_manager import get_case as _get
    conn = get_db_connection()
    try:
        case = _get(case_id, conn)
        if not case:
            raise HTTPException(404, f"Case {case_id} not found")
        return case
    finally:
        conn.close()


@app.patch("/api/cases/{case_id}/status")
def update_case_status(case_id: str, status: str, actor: str = "investigator"):
    """Update case status."""
    from investigation.case_manager import update_case_status as _update
    conn = get_db_connection()
    try:
        return _update(case_id, status, actor=actor, db_conn=conn)
    finally:
        conn.close()


@app.post("/api/cases/{case_id}/notes")
def add_note(case_id: str, note: str, actor: str = "investigator"):
    """Add note to a case."""
    from investigation.case_manager import add_note as _add
    conn = get_db_connection()
    try:
        return _add(case_id, note, actor=actor, db_conn=conn)
    finally:
        conn.close()


@app.post("/api/simulate/freeze/{account_id}")
def simulate_freeze(account_id: str):
    """Simulate freezing an account — impact analysis."""
    graph = get_graph()
    if not graph:
        raise HTTPException(503, "Graph not initialised")
    from investigation.freeze_simulator import simulate_freeze as _sim
    fraud_scores = {}
    mule_scores_dict = {}
    if _mule_scores is not None and len(_mule_scores) > 0:
        mule_scores_dict = dict(zip(_mule_scores['account'], _mule_scores['mule_score']))
    return _sim(graph.G, account_id,
                mule_scores=mule_scores_dict,
                fraud_scores=fraud_scores)


@app.get("/api/account/{account_id}")
def get_account_profile(account_id: str):
    """Full account risk profile: graph metrics + KYC + CIBIL + VPA."""
    graph  = get_graph()
    extras = get_india_extras()

    # Graph-level stats
    graph_stats = {}
    if graph and account_id in graph.G:
        node = graph.G.nodes[account_id]
        graph_stats = {
            "total_sent":     round(node.get('total_sent', 0), 2),
            "total_received": round(node.get('total_received', 0), 2),
            "in_degree":      graph.G.in_degree(account_id),
            "out_degree":     graph.G.out_degree(account_id),
        }

    # Mule score
    mule_info = {}
    if _mule_scores is not None and len(_mule_scores) > 0:
        row = _mule_scores[_mule_scores['account'] == account_id]
        if len(row) > 0:
            mule_info = row.iloc[0].to_dict()

    # India extras: KYC, CIBIL, VPA
    ie = extras.get(account_id, {})

    # Recent transactions from DB
    conn = get_db_connection()
    try:
        recent = conn.execute("""
            SELECT txn_id, timestamp, amount, txn_type, receiver_account,
                   COALESCE(fraud_probability, 0.0) as fraud_probability
            FROM transactions
            WHERE sender_account = ?
            ORDER BY timestamp DESC LIMIT 10
        """, (account_id,)).fetchall()
        recent_txns = [dict(r) for r in recent]

        # DB-level risk score (highest seen)
        max_prob_row = conn.execute("""
            SELECT MAX(COALESCE(fraud_probability, 0)) FROM transactions
            WHERE sender_account=? OR receiver_account=?
        """, (account_id, account_id)).fetchone()
        max_fraud_prob = round(float(max_prob_row[0] or 0), 4)
    finally:
        conn.close()

    # KYC risk assessment
    kyc_type    = ie.get('kyc_type', 'unknown')
    age_days    = ie.get('account_age_days', None)
    credit_score = ie.get('credit_score', None)
    kyc_risk    = (kyc_type == 'otp_ekyc' and age_days is not None and age_days < 90)

    return {
        "account_id":        account_id,
        "vpa":               ie.get('vpa', f"{account_id[-8:]}@upi"),
        "bank_handle":       ie.get('bank_handle', 'upi'),
        "kyc_type":          kyc_type,
        "account_age_days":  age_days,
        "credit_score":      credit_score,
        "kyc_risk_flag":     kyc_risk,
        "cibil_risk_flag":   (credit_score is not None and credit_score < 550),
        "max_fraud_probability": max_fraud_prob,
        "mule_score":        mule_info.get('mule_score', 0.0),
        "is_suspected_mule": bool(mule_info.get('is_suspected_mule', 0)),
        "passthrough_ratio": mule_info.get('passthrough_ratio', 0.0),
        "graph_stats":       graph_stats,
        "recent_transactions": recent_txns,
    }


@app.get("/api/explain/{txn_id}")
def explain_transaction(txn_id: str):
    """SHAP explanation for a transaction."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT * FROM transactions WHERE txn_id=?", (txn_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Transaction {txn_id} not found")
        txn = dict(row)
    finally:
        conn.close()

    try:
        from features.engineering import engineer_single, get_feature_columns
        from explainability.explain import explain_transaction_ml, explain_graph
        features = engineer_single(txn)
        ml_exp = explain_transaction_ml(features, get_feature_columns())
        graph_exp = explain_graph(
            {"paths": [], "nodes": [], "edges": [], "summary": {}})
        return {"txn_id": txn_id, "ml_explanation": ml_exp, "graph_explanation": graph_exp}
    except Exception as e:
        return {"txn_id": txn_id, "error": str(e), "ml_explanation": {}, "graph_explanation": {}}


@app.get("/api/model/performance")
def model_performance():
    """Return model metrics and feature importance."""
    try:
        from models.predictor import get_model_metadata
        return get_model_metadata()
    except FileNotFoundError:
        raise HTTPException(503, "Model not trained yet. Run `python -m models.trainer`")


@app.post("/api/score")
def score_manual_transaction(txn: dict):
    """Score a manual transaction input on the fly."""
    from models.predictor import predict_single
    try:
        if "txn_id" not in txn:
            import time
            txn["txn_id"] = f"MANUAL_{int(time.time()*100)}"
        if "timestamp" not in txn:
            from datetime import datetime
            txn["timestamp"] = datetime.now().isoformat()
        
        # Ensure correct types
        txn["amount"] = float(txn.get("amount", 0))
        
        res = predict_single(
            txn, 
            graph_features=get_graph_features(), 
            india_extras=get_india_extras()
        )
        return res
    except Exception as e:
        raise HTTPException(400, f"Scoring error: {str(e)}")

@app.post("/api/transactions/upload")
async def upload_transactions(file: UploadFile = File(...)):
    """Upload a CSV/JSON file of transactions."""
    content = await file.read()
    try:
        import io
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.StringIO(content.decode()))
        else:
            df = pd.read_json(io.StringIO(content.decode()))
        return {"rows_received": len(df), "columns": list(df.columns), "status": "ok"}
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {e}")


# ── WebSocket Live Feed ───────────────────────────────────────────────────────

@app.websocket("/ws/live-feed")
async def websocket_live_feed(ws: WebSocket):
    """Real-time transaction stream via WebSocket."""
    await ws.accept()
    _ws_clients.append(ws)
    try:
        while True:
            await asyncio.sleep(30)  # Keep-alive ping
            await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        _ws_clients.remove(ws)


async def broadcast_transaction(txn: dict):
    """Broadcast a new transaction to all WebSocket clients."""
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json({"type": "transaction", "data": txn})
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)


# ── Replay Simulator ──────────────────────────────────────────────────────────

async def _simulation_loop(rate: int = 2):
    """
    Background task: replay DB transactions through the real-time scoring
    pipeline and broadcast each result via WebSocket.
    Loops through a 170-row highlight reel (50 fraud + 120 legit).
    """
    global _sim_running, _sim_stats

    from models.predictor import predict_single as _predict

    # Build highlight reel — three separate queries (SQLite blocks ORDER BY inside UNION)
    conn = get_db_connection()
    try:
        cols = """txn_id, sender_account, receiver_account, amount,
                  timestamp, is_fraud, txn_type, step, channel,
                  sender_branch, receiver_branch,
                  COALESCE(sender_balance_before, 0) AS sender_balance_before,
                  COALESCE(sender_balance_after,  0) AS sender_balance_after"""

        fraud_rows = conn.execute(
            f"SELECT {cols} FROM transactions WHERE is_fraud = 1 ORDER BY RANDOM() LIMIT 60"
        ).fetchall()

        edge_rows = conn.execute(
            f"SELECT {cols} FROM transactions "
            "WHERE is_fraud = 0 AND COALESCE(fraud_probability,0) > 0.5 "
            "ORDER BY RANDOM() LIMIT 40"
        ).fetchall()

        clean_rows = conn.execute(
            f"SELECT {cols} FROM transactions "
            "WHERE is_fraud = 0 AND COALESCE(fraud_probability,0) < 0.1 "
            "ORDER BY RANDOM() LIMIT 100"
        ).fetchall()

        import random as _rand
        combined = [dict(r) for r in list(fraud_rows) + list(edge_rows) + list(clean_rows)]
        _rand.shuffle(combined)
        rows = combined

    except Exception as e:
        print(f"[SIM] Highlight reel query failed: {e}")
        rows = []
    finally:
        conn.close()

    txns = rows
    if not txns:
        print("[SIM] No transactions loaded \u2014 stopping.")
        _sim_running = False
        return


    print(f"[SIM] Highlight reel ready: {len(txns)} transactions")
    idx   = 0
    delay = 1.0 / max(rate, 1)

    while _sim_running:
        txn = txns[idx % len(txns)]
        idx += 1

        try:
            result = _predict(
                txn,
                graph_features=_graph_features,
                india_extras=_india_extras,
            )
            payload = {
                "txn_id":           txn.get("txn_id", ""),
                "sender_account":   txn.get("sender_account", ""),
                "receiver_account": txn.get("receiver_account", ""),
                "amount":           round(float(txn.get("amount", 0)), 2),
                "txn_type":         txn.get("txn_type", ""),
                "timestamp":        str(txn.get("timestamp", "")),
                "fraud_probability": result["fraud_probability"],
                "risk_tier":         result["risk_tier"],
                "is_fraud":          int(txn.get("is_fraud", 0)),
                "top_features":      result["top_features"][:3],
            }
            _sim_stats["processed"] += 1
            if result["fraud_probability"] >= 0.7:
                _sim_stats["fraud_detected"] += 1

            await broadcast_transaction(payload)

        except Exception as e:
            print(f"[SIM] Scoring error on {txn.get('txn_id')}: {e}")

        await asyncio.sleep(delay)

    print("[SIM] Simulation stopped.")


@app.post("/api/simulate/start")
async def start_simulation(rate: int = 2):
    """Start replaying transactions through the real-time scoring pipeline."""
    global _sim_running, _sim_task, _sim_stats
    if _sim_running:
        return {"status": "already_running", **_sim_stats}
    _sim_running = True
    _sim_stats   = {"processed": 0, "fraud_detected": 0}
    _sim_task    = asyncio.create_task(_simulation_loop(rate=rate))
    return {"status": "started", "rate_per_sec": rate}


@app.post("/api/simulate/stop")
async def stop_simulation():
    """Stop the replay simulator."""
    global _sim_running, _sim_task
    _sim_running = False
    if _sim_task:
        _sim_task.cancel()
        _sim_task = None
    return {"status": "stopped", **_sim_stats}


@app.get("/api/simulate/stats")
async def simulation_stats():
    """Current simulator state and counters."""
    return {"running": _sim_running, **_sim_stats}
