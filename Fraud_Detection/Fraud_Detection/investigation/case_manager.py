"""
FundFlow AI — Investigation Case Manager
Manages fraud investigation cases with timeline tracking and evidence collection.
"""
import json
import uuid
from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def create_case(alert: dict, assigned_to: str = "Unassigned",
                db_conn=None) -> dict:
    """Create a new investigation case from an alert."""
    case_id  = f"CF-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    now      = datetime.utcnow().isoformat()
    priority = alert.get('severity', 'MEDIUM')

    timeline_event = {
        "time":  now,
        "event": f"Alert triggered: {alert.get('alert_type', '')} — {alert.get('description', '')[:100]}",
        "actor": "system",
    }

    case = {
        "case_id":         case_id,
        "status":          "NEW",
        "priority":        priority,
        "created_at":      now,
        "updated_at":      now,
        "assigned_to":     assigned_to,
        "linked_alerts":   [alert.get('alert_id', '')],
        "linked_accounts": alert.get('accounts_involved', []),
        "total_exposure":  alert.get('total_amount', 0.0),
        "timeline":        [timeline_event],
        "notes":           [],
        "evidence": {
            "transactions":       0,
            "fund_flow_chains":   0,
            "ring_patterns":      0,
            "alert_type":         alert.get('alert_type', ''),
            "risk_score":         alert.get('risk_score', 0.0),
        },
    }

    if db_conn:
        _save_case(case, db_conn)

    return case


def update_case_status(case_id: str, new_status: str,
                       actor: str = "investigator", db_conn=None) -> dict:
    """
    Update a case's status and log to timeline.
    Valid statuses: NEW, INVESTIGATING, CONFIRMED_FRAUD, FALSE_POSITIVE, CLOSED
    """
    valid = {"NEW", "INVESTIGATING", "CONFIRMED_FRAUD", "FALSE_POSITIVE", "CLOSED"}
    if new_status not in valid:
        raise ValueError(f"Invalid status: {new_status}. Must be one of {valid}")

    now = datetime.utcnow().isoformat()
    event = {
        "time": now,
        "event": f"Status changed to {new_status}",
        "actor": actor,
    }

    if db_conn:
        row = db_conn.execute(
            "SELECT * FROM cases WHERE case_id = ?", (case_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Case {case_id} not found")
        timeline = json.loads(row['timeline'])
        timeline.append(event)
        db_conn.execute("""
            UPDATE cases SET status=?, updated_at=?, timeline=?
            WHERE case_id=?
        """, (new_status, now, json.dumps(timeline), case_id))
        db_conn.commit()

    return {"case_id": case_id, "new_status": new_status, "updated_at": now}


def add_note(case_id: str, note_text: str,
             actor: str = "investigator", db_conn=None) -> dict:
    """Add an investigator note to a case."""
    now = datetime.utcnow().isoformat()
    note = {"time": now, "text": note_text, "actor": actor}
    event = {"time": now, "event": f'Note added: "{note_text[:80]}"', "actor": actor}

    if db_conn:
        row = db_conn.execute(
            "SELECT * FROM cases WHERE case_id = ?", (case_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Case {case_id} not found")
        notes    = json.loads(row['notes'])
        timeline = json.loads(row['timeline'])
        notes.append(note)
        timeline.append(event)
        db_conn.execute("""
            UPDATE cases SET notes=?, timeline=?, updated_at=?
            WHERE case_id=?
        """, (json.dumps(notes), json.dumps(timeline), now, case_id))
        db_conn.commit()

    return {"case_id": case_id, "note": note}


def get_case(case_id: str, db_conn) -> dict:
    """Retrieve a case by ID from the database."""
    row = db_conn.execute(
        "SELECT * FROM cases WHERE case_id = ?", (case_id,)
    ).fetchone()
    if not row:
        return {}
    return _row_to_dict(row)


def list_cases(db_conn, status: str = None, limit: int = 50) -> list:
    """List all cases, optionally filtered by status."""
    if status:
        rows = db_conn.execute(
            "SELECT * FROM cases WHERE status=? ORDER BY created_at DESC LIMIT ?",
            (status, limit)
        ).fetchall()
    else:
        rows = db_conn.execute(
            "SELECT * FROM cases ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def _save_case(case: dict, conn):
    """Persist case to SQLite."""
    conn.execute("""
        INSERT OR REPLACE INTO cases
        (case_id, status, priority, created_at, updated_at, assigned_to,
         linked_alerts, linked_accounts, total_exposure, timeline, notes, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        case['case_id'], case['status'], case['priority'],
        case['created_at'], case['updated_at'], case['assigned_to'],
        json.dumps(case['linked_alerts']),
        json.dumps(case['linked_accounts']),
        case['total_exposure'],
        json.dumps(case['timeline']),
        json.dumps(case['notes']),
        json.dumps(case['evidence']),
    ))
    conn.commit()


def _row_to_dict(row) -> dict:
    """Convert SQLite Row to dict with JSON fields parsed."""
    d = dict(row)
    for field in ('linked_alerts', 'linked_accounts', 'timeline', 'notes', 'evidence'):
        if d.get(field):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                pass
    return d
