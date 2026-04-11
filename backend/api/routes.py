from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, ScanEvent, User, AuditLog
from services.tray_service import advance_tray, _tray_dict
from services.audit_service import log_action
from services.analytics_service import detect_bottlenecks, stage_load, get_analytics
from core.stages import STAGES, STAGE_COLORS, PROJECTS, BRANCH_OPTIONS, get_units_for_project
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from typing import Optional
import os
import uuid

router = APIRouter()

# ── Auth config ────────────────────────────────────────────────────────────────
# Set SECRET_KEY in your environment (Render → Environment Variables)
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-in-production")
ALGORITHM  = "HS256"
TOKEN_TTL  = 60  # minutes

security     = HTTPBearer()
pwd_context  = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Auth helpers ───────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)


def create_token(user: User) -> str:
    payload = {
        "sub":  user.username,
        "role": user.role,
        "exp":  datetime.utcnow() + timedelta(minutes=TOKEN_TTL),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/register")
def register(payload: dict, db: Session = Depends(get_db)):
    name = (payload.get("username") or "").strip()
    pw   = payload.get("password") or ""

    if not name or not pw:
        raise HTTPException(status_code=400, detail="username and password required")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="Username too long")

    if db.query(User).filter(User.username == name).first():
        return {"error": "User already exists"}

    user = User(
        username = name,
        password = hash_password(pw),
        role     = payload.get("role", "operator"),
    )
    db.add(user)
    log_action(db, name, "REGISTER")
    db.commit()
    return {"message": "User created", "role": user.role}


@router.post("/login")
def login(payload: dict, db: Session = Depends(get_db)):
    name = (payload.get("username") or "").strip()
    pw   = payload.get("password") or ""

    user = db.query(User).filter(User.username == name).first()
    if not user or not verify_password(pw, user.password):
        return {"error": "Invalid credentials"}

    token = create_token(user)
    log_action(db, name, "LOGIN")
    db.commit()

    return {"access_token": token, "role": user.role, "username": user.username}


# ══════════════════════════════════════════════════════════════════════════════
#  PIPELINE INFO
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/pipeline")
def get_pipeline():
    return {
        "stages":         STAGES,
        "stage_colors":   STAGE_COLORS,
        "branch_options": BRANCH_OPTIONS,
        "projects":       PROJECTS,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  TRAYS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/trays")
def get_all_trays(
    stage:   Optional[str] = None,
    project: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Tray)
    if stage:
        q = q.filter(Tray.stage == stage)
    if project:
        q = q.filter(Tray.project == project)
    return [_tray_dict(t) for t in q.order_by(Tray.created_at.desc()).all()]


@router.post("/trays/create")
def create_trays(payload: dict, user: dict = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    trays_in = payload.get("trays", [])
    created  = []

    for t in trays_in:
        tray_id = str(t.get("id", "")).strip().upper()
        if not tray_id:
            continue
        if db.query(Tray).filter(Tray.id == tray_id).first():
            continue  # skip duplicates

        units = t.get("total_units") or get_units_for_project(t.get("project", ""))
        now   = datetime.utcnow()
        tray  = Tray(
            id          = tray_id,
            stage       = "CREATED",
            project     = t.get("project", ""),
            shift       = t.get("shift", ""),
            created_by  = t.get("created_by", user["sub"]),
            batch_no    = t.get("batch_no", ""),
            total_units = units,
            created_at  = now,
            last_updated= now,
        )
        db.add(tray)
        created.append(tray_id)

    db.commit()
    return {"ok": True, "created": created, "count": len(created)}


@router.get("/tray/{tray_id}")
def get_tray(tray_id: str, user: dict = Depends(get_current_user),
             db: Session = Depends(get_db)):
    tray = db.query(Tray).filter(Tray.id == tray_id.strip().upper()).first()
    if not tray:
        raise HTTPException(status_code=404, detail=f"Tray not found: {tray_id}")
    return _tray_dict(tray)


@router.delete("/tray/{tray_id}")
def delete_tray(tray_id: str, user: dict = Depends(require_admin),
                db: Session = Depends(get_db)):
    tray = db.query(Tray).filter(Tray.id == tray_id.strip().upper()).first()
    if not tray:
        raise HTTPException(status_code=404, detail="Tray not found")
    db.delete(tray)
    log_action(db, user["sub"], "DELETE_TRAY", tray_id)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
#  SCAN
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/scan")
def scan(payload: dict, user: dict = Depends(get_current_user),
         db: Session = Depends(get_db)):
    tray_id = str(payload.get("id", "")).strip().upper()
    tray    = db.query(Tray).filter(Tray.id == tray_id).first()

    if not tray:
        return {"error": f"Tray not found: {tray_id}"}

    result = advance_tray(
        db,
        tray,
        operator            = user["sub"],
        next_stage_override = payload.get("next_stage_override"),
    )

    if result.get("ok"):
        log_action(db, user["sub"], "SCAN", f"{tray_id}:{tray.stage}")

    db.commit()
    return result


@router.post("/scan/bulk")
def bulk_scan(payload: dict, user: dict = Depends(get_current_user),
              db: Session = Depends(get_db)):
    ids      = payload.get("ids", [])
    override = payload.get("next_stage_override")
    results  = []

    for raw_id in ids:
        tray_id = str(raw_id).strip().upper()
        tray    = db.query(Tray).filter(Tray.id == tray_id).first()

        if not tray:
            results.append({"id": tray_id, "error": "Not found"})
            continue

        r = advance_tray(db, tray, user["sub"], override)
        db.commit()
        results.append(r)

    ok_n   = sum(1 for r in results if r.get("ok"))
    fail_n = len(results) - ok_n
    fifo_n = sum(1 for r in results if r.get("ok") and r.get("fifo_vio"))

    return {"ok": True, "total": len(results), "success": ok_n,
            "failed": fail_n, "fifo_violations": fifo_n, "results": results}


# ══════════════════════════════════════════════════════════════════════════════
#  HISTORY
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/history/{tray_id}")
def get_history(tray_id: str, user: dict = Depends(get_current_user),
                db: Session = Depends(get_db)):
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tray_id == tray_id.strip().upper())
        .order_by(ScanEvent.timestamp.asc())
        .all()
    )
    return [
        {
            "id":         e.id,
            "tray_id":    e.tray_id,
            "from_stage": e.from_stage,
            "stage":      e.stage,
            "operator":   e.operator,
            "fifo_flag":  e.fifo_flag,
            "note":       e.note,
            "timestamp":  e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in events
    ]


@router.get("/scan-log")
def get_scan_log(
    limit: int = 200,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(ScanEvent)
        .order_by(ScanEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id":         e.id,
            "tray_id":    e.tray_id,
            "from_stage": e.from_stage,
            "stage":      e.stage,
            "operator":   e.operator,
            "fifo_flag":  e.fifo_flag,
            "note":       e.note,
            "timestamp":  e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in events
    ]


# ══════════════════════════════════════════════════════════════════════════════
#  STATS / ALERTS / ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/stats")
def get_stats(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import date
    all_trays       = db.query(Tray).filter(Tray.stage != "SPLIT").all()
    today           = date.today()
    total_active    = sum(1 for t in all_trays if t.stage != "COMPLETE")
    total_complete  = sum(1 for t in all_trays if t.stage == "COMPLETE")
    fifo_count      = sum(1 for t in all_trays if t.fifo_violated)
    completed_today = sum(
        1 for t in all_trays
        if t.stage == "COMPLETE" and t.completed_at and t.completed_at.date() == today
    )
    stage_counts: dict = {}
    for t in all_trays:
        if t.stage != "COMPLETE":
            stage_counts[t.stage] = stage_counts.get(t.stage, 0) + 1

    stuck_count = len(detect_bottlenecks(db))

    return {
        "total_active":    total_active,
        "total_complete":  total_complete,
        "fifo_violated":   fifo_count,
        "completed_today": completed_today,
        "stuck_count":     stuck_count,
        "stage_counts":    stage_counts,
    }


@router.get("/alerts")
def get_alerts(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    bottlenecks = detect_bottlenecks(db)
    return {"alerts": bottlenecks, "count": len(bottlenecks)}


@router.get("/stage-load")
def get_stage_load(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return stage_load(db)


@router.get("/analytics")
def analytics(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return get_analytics(db)


# ══════════════════════════════════════════════════════════════════════════════
#  AUDIT LOG (admin only)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/audit-log")
def get_audit_log(
    limit: int = 100,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "username":  l.username,
            "action":    l.action,
            "details":   l.details,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        }
        for l in logs
    ]