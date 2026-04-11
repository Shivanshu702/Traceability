from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, ScanEvent, User, AuditLog
from services.tray_service import advance_tray, _tray_dict
from services.audit_service import log_action
from services.analytics_service import detect_bottlenecks, stage_load, get_analytics
from services.qr_service import generate_qr_base64, generate_qr_bytes
from core.stages import STAGES, STAGE_COLORS, PROJECTS, BRANCH_OPTIONS, get_units_for_project
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from typing import Optional
import os
import uuid

router = APIRouter()
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-in-production")
ALGORITHM  = "HS256"
TOKEN_TTL  = 60
security    = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p): return pwd_context.hash(p[:72])
def verify_password(plain, hashed): return pwd_context.verify(plain[:72], hashed)

def create_token(user):
    return jwt.encode({"sub": user.username, "role": user.role,
        "exp": datetime.utcnow() + timedelta(minutes=TOKEN_TTL)}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try: return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError: raise HTTPException(status_code=401, detail="Invalid or expired token")

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin": raise HTTPException(status_code=403, detail="Admin only")
    return user

@router.post("/register")
def register(payload: dict, db: Session = Depends(get_db)):
    name = (payload.get("username") or "").strip()
    pw   = payload.get("password") or ""
    if not name or not pw: raise HTTPException(400, "username and password required")
    if db.query(User).filter(User.username == name).first(): return {"error": "User already exists"}
    user = User(username=name, password=hash_password(pw), role=payload.get("role", "operator"))
    db.add(user); log_action(db, name, "REGISTER"); db.commit()
    return {"message": "User created", "role": user.role}

@router.post("/login")
def login(payload: dict, db: Session = Depends(get_db)):
    name = (payload.get("username") or "").strip()
    user = db.query(User).filter(User.username == name).first()
    if not user or not verify_password(payload.get("password",""), user.password):
        return {"error": "Invalid credentials"}
    token = create_token(user); log_action(db, name, "LOGIN"); db.commit()
    return {"access_token": token, "role": user.role, "username": user.username}

@router.get("/pipeline")
def get_pipeline():
    return {"stages": STAGES, "stage_colors": STAGE_COLORS,
            "branch_options": BRANCH_OPTIONS, "projects": PROJECTS}

@router.get("/trays")
def get_all_trays(stage: Optional[str]=None, project: Optional[str]=None,
                  user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    q = db.query(Tray)
    if stage:   q = q.filter(Tray.stage == stage)
    if project: q = q.filter(Tray.project == project)
    return [_tray_dict(t) for t in q.order_by(Tray.created_at.desc()).all()]

@router.post("/trays/create")
def create_trays(payload: dict, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    created = []
    for t in payload.get("trays", []):
        tray_id = str(t.get("id","")).strip().upper()
        if not tray_id or db.query(Tray).filter(Tray.id==tray_id).first(): continue
        units = t.get("total_units") or get_units_for_project(t.get("project",""))
        now   = datetime.utcnow()
        tray  = Tray(id=tray_id, stage="CREATED", project=t.get("project",""),
                     shift=t.get("shift",""), created_by=t.get("created_by", user["sub"]),
                     batch_no=t.get("batch_no",""), total_units=units,
                     created_at=now, last_updated=now)
        db.add(tray)
        created.append({**_tray_dict(tray), "qr_base64": generate_qr_base64(tray_id)})
    db.commit()
    log_action(db, user["sub"], "CREATE_TRAYS", f"count={len(created)}"); db.commit()
    return {"ok": True, "count": len(created), "trays": created}

@router.get("/tray/{tray_id}")
def get_tray(tray_id: str, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    tray = db.query(Tray).filter(Tray.id==tray_id.strip().upper()).first()
    if not tray: raise HTTPException(404, f"Tray not found: {tray_id}")
    return _tray_dict(tray)

@router.get("/tray/{tray_id}/qr")
def get_tray_qr(tray_id: str, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    tray = db.query(Tray).filter(Tray.id==tray_id.strip().upper()).first()
    if not tray: raise HTTPException(404, "Tray not found")
    return Response(content=generate_qr_bytes(tray.id), media_type="image/png")

@router.get("/tray/{tray_id}/qr/base64")
def get_tray_qr_b64(tray_id: str, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    tray = db.query(Tray).filter(Tray.id==tray_id.strip().upper()).first()
    if not tray: raise HTTPException(404, "Tray not found")
    return {"tray_id": tray.id, "qr_base64": generate_qr_base64(tray.id)}

@router.delete("/tray/{tray_id}")
def delete_tray(tray_id: str, user: dict=Depends(require_admin), db: Session=Depends(get_db)):
    tray = db.query(Tray).filter(Tray.id==tray_id.strip().upper()).first()
    if not tray: raise HTTPException(404, "Tray not found")
    db.delete(tray); log_action(db, user["sub"], "DELETE_TRAY", tray_id); db.commit()
    return {"ok": True}

@router.post("/scan")
def scan(payload: dict, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    tray_id = str(payload.get("id","")).strip().upper()
    tray    = db.query(Tray).filter(Tray.id==tray_id).first()
    if not tray: return {"error": f"Tray not found: {tray_id}"}
    result = advance_tray(db, tray, operator=user["sub"],
                          next_stage_override=payload.get("next_stage_override"))
    if result.get("ok"): log_action(db, user["sub"], "SCAN", f"{tray_id}:{tray.stage}")
    db.commit(); return result

@router.post("/scan/bulk")
def bulk_scan(payload: dict, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    results = []
    for raw_id in payload.get("ids",[]):
        tray_id = str(raw_id).strip().upper()
        tray    = db.query(Tray).filter(Tray.id==tray_id).first()
        if not tray: results.append({"id":tray_id,"error":"Not found"}); continue
        r = advance_tray(db, tray, user["sub"], payload.get("next_stage_override"))
        db.commit(); results.append(r)
    ok_n = sum(1 for r in results if r.get("ok"))
    return {"ok":True,"total":len(results),"success":ok_n,
            "failed":len(results)-ok_n,"results":results}

@router.get("/history/{tray_id}")
def get_history(tray_id: str, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    events = db.query(ScanEvent).filter(ScanEvent.tray_id==tray_id.strip().upper())\
               .order_by(ScanEvent.timestamp.asc()).all()
    return [{"id":e.id,"tray_id":e.tray_id,"from_stage":e.from_stage,"stage":e.stage,
             "operator":e.operator,"fifo_flag":e.fifo_flag,"note":e.note,
             "timestamp":e.timestamp.isoformat() if e.timestamp else None} for e in events]

@router.get("/scan-log")
def get_scan_log(limit: int=200, user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    events = db.query(ScanEvent).order_by(ScanEvent.timestamp.desc()).limit(limit).all()
    return [{"id":e.id,"tray_id":e.tray_id,"from_stage":e.from_stage,"stage":e.stage,
             "operator":e.operator,"fifo_flag":e.fifo_flag,"note":e.note,
             "timestamp":e.timestamp.isoformat() if e.timestamp else None} for e in events]

@router.get("/stats")
def get_stats(user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    from datetime import date
    all_trays = db.query(Tray).filter(Tray.stage!="SPLIT").all()
    today = date.today()
    stage_counts = {}
    for t in all_trays:
        if t.stage != "COMPLETE": stage_counts[t.stage] = stage_counts.get(t.stage,0)+1
    return {"total_active": sum(1 for t in all_trays if t.stage!="COMPLETE"),
            "total_complete": sum(1 for t in all_trays if t.stage=="COMPLETE"),
            "fifo_violated": sum(1 for t in all_trays if t.fifo_violated),
            "completed_today": sum(1 for t in all_trays if t.stage=="COMPLETE"
                and t.completed_at and t.completed_at.date()==today),
            "stuck_count": len(detect_bottlenecks(db)), "stage_counts": stage_counts}

@router.get("/alerts")
def get_alerts(user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    return {"alerts": detect_bottlenecks(db), "count": len(detect_bottlenecks(db))}

@router.get("/stage-load")
def get_stage_load(user: dict=Depends(get_current_user), db: Session=Depends(get_db)):
    return stage_load(db)

@router.get("/analytics")
def analytics(user: dict=Depends(require_admin), db: Session=Depends(get_db)):
    return get_analytics(db)

@router.get("/audit-log")
def get_audit_log(limit: int=100, user: dict=Depends(require_admin), db: Session=Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [{"username":l.username,"action":l.action,"details":l.details,
             "timestamp":l.timestamp.isoformat() if l.timestamp else None} for l in logs]