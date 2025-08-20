# backend/app/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime
import shutil
import uuid
import sqlite3

app = FastAPI(title="PublicPulsePortal API V4")

# ----- CORS (frontend local dev) -----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Storage paths -----
ROOT = Path(__file__).resolve().parents[1]          # .../backend
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "ppp.db"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ----- SQLite helpers -----
def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS datasets (
              id TEXT PRIMARY KEY,
              filename TEXT NOT NULL,
              stored_path TEXT NOT NULL,
              uploaded_at TEXT NOT NULL
            );
        """)
        conn.commit()

@app.on_event("startup")
def _startup():
    init_db()

# ----- Basic routes -----
@app.get("/")
def read_root():
    return {"message": "Welcome to PublicPulsePortal backend 🚀"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

# ----- Upload dataset (save file + register in DB) -----
@app.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Save the uploaded CSV/XLSX to data/uploads and register it in SQLite.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    dataset_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{dataset_id}_{file.filename}"

    # stream file to disk
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    # register in DB
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO datasets (id, filename, stored_path, uploaded_at) VALUES (?,?,?,?)",
            (dataset_id, file.filename, str(dest), datetime.utcnow().isoformat(timespec="seconds") + "Z"),
        )
        conn.commit()

    return {
        "ok": True,
        "dataset_id": dataset_id,
        "filename": file.filename,
        "stored_path": str(dest),
    }

# ----- List datasets -----
@app.get("/datasets")
def list_datasets(limit: int = 50, offset: int = 0):
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM datasets").fetchone()["n"]
        rows = conn.execute(
            """
            SELECT id, filename, stored_path, uploaded_at
            FROM datasets
            ORDER BY uploaded_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
    return {
        "total": total,
        "items": [dict(r) for r in rows],
        "limit": limit,
        "offset": offset,
    }
