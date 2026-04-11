from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import SessionLocal
from models import Tray, ScanEvent, User, AuditLog
from services.tray_service import advance_tray
from services.audit_service import log_action
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

router = APIRouter()

SECRET_KEY = "MYSECRETKEY"
ALGORITHM = "HS256"

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str):
    return pwd_context.hash(password[:72])


def verify_password(plain, hashed):
    return pwd_context.verify(plain[:72], hashed)


def create_token(user: User):
    payload = {
        "sub": user.username,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(minutes=60)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# 🔐 AUTH

@router.post("/register")
def register(payload: dict):
    db = SessionLocal()

    if db.query(User).filter(User.username == payload["username"]).first():
        return {"error": "User already exists"}

    user = User(
        username=payload["username"],
        password=hash_password(payload["password"]),
        role=payload.get("role", "operator")
    )

    db.add(user)
    db.commit()

    log_action(db, payload["username"], "REGISTER")
    db.commit()

    return {"message": "User created"}


@router.post("/login")
def login(payload: dict):
    db = SessionLocal()

    user = db.query(User).filter(User.username == payload["username"]).first()

    if not user or not verify_password(payload["password"], user.password):
        return {"error": "Invalid credentials"}

    token = create_token(user)

    log_action(db, user.username, "LOGIN")
    db.commit()

    return {"access_token": token, "role": user.role}


# 📦 TRAY

@router.get("/tray/{tray_id}")
def get_tray(tray_id: str, user=Depends(get_current_user)):
    db = SessionLocal()

    tray = db.query(Tray).filter(Tray.id == tray_id).first()

    if not tray:
        tray = Tray(id=tray_id)
        db.add(tray)
        db.commit()
        db.refresh(tray)

    return tray


@router.post("/scan")
def scan(payload: dict, user=Depends(get_current_user)):
    db = SessionLocal()

    tray = db.query(Tray).filter(Tray.id == payload["id"]).first()
    if not tray:
        return {"error": "Tray not found"}

    result = advance_tray(db, tray, user["sub"])

    db.commit()
    db.refresh(tray)

    log_action(db, user["sub"], "SCAN", f"{tray.id}:{tray.stage}")
    db.commit()

    return tray if not isinstance(result, dict) else result


# 🔥 ANALYTICS WITH TIME

@router.get("/analytics")
def analytics(user=Depends(require_admin)):
    db = SessionLocal()

    trays = db.query(Tray).all()

    total = len(trays)
    completed = [t for t in trays if t.completed_at]
    wip = total - len(completed)

    # 🔥 AVG CYCLE TIME
    cycle_times = []
    for t in completed:
        if t.started_at and t.completed_at:
            diff = (t.completed_at - t.started_at).total_seconds()
            cycle_times.append(diff)

    avg_cycle = sum(cycle_times) / len(cycle_times) if cycle_times else 0

    # 🔥 STAGE TIME (approx via scan logs)
    stage_time = {}
    events = db.query(ScanEvent).order_by(ScanEvent.timestamp).all()

    for i in range(len(events) - 1):
        curr = events[i]
        nxt = events[i + 1]

        if curr.tray_id == nxt.tray_id:
            diff = (nxt.timestamp - curr.timestamp).total_seconds()
            stage_time[curr.stage] = stage_time.get(curr.stage, 0) + diff

    return {
        "total": total,
        "completed": len(completed),
        "wip": wip,
        "avg_cycle_time_sec": avg_cycle,
        "stage_time": stage_time
    }