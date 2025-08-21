# backend/app/db_selections.py

import sqlite3
from datetime import datetime
from typing import List, Dict

# Table creator (idempotent). Call this from init_db() if you want,
# but you already create the table there; leaving here for reuse.
def ensure_table(conn: sqlite3.Connection) -> None:
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS selections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, dataset_id, question_id)
        )
    """)
    conn.commit()

def add_selection(conn: sqlite3.Connection, user_id: str, dataset_id: str, question_id: str) -> None:
    now = datetime.utcnow().isoformat()
    c = conn.cursor()
    c.execute(
        """INSERT OR IGNORE INTO selections (user_id, dataset_id, question_id, created_at)
           VALUES (?, ?, ?, ?)""",
        (user_id, dataset_id, question_id, now)
    )
    conn.commit()

def remove_selection(conn: sqlite3.Connection, user_id: str, dataset_id: str, question_id: str) -> None:
    c = conn.cursor()
    c.execute(
        "DELETE FROM selections WHERE user_id=? AND dataset_id=? AND question_id=?",
        (user_id, dataset_id, question_id)
    )
    conn.commit()

def list_selections(conn: sqlite3.Connection, user_id: str, dataset_id: str) -> List[Dict[str, str]]:
    c = conn.cursor()
    c.execute(
        "SELECT question_id, created_at FROM selections WHERE user_id=? AND dataset_id=? ORDER BY created_at DESC",
        (user_id, dataset_id)
    )
    return [{"question_id": qid, "created_at": ts} for (qid, ts) in c.fetchall()]
