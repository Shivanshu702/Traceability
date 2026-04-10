from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import SessionLocal
from models import Tray, ScanEvent, User
from services.tray_service import advance_tray
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

router = APIRouter()

# 🔐 CONFIG
SECRET_KEY = "MYSECRETKEY"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# 🔐 UTILS

def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)


def create_token(username: str):
    payload = {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


# 🔐 REGISTER
@router.post("/register")
def register(payload: dict):
    db = SessionLocal()

    existing = db.query(User).filter(
        User.username == payload["username"]
    ).first()

    if existing:
        return {"error": "User already exists"}

    user = User(
        username=payload["username"],
        password=hash_password(payload["password"])
    )

    db.add(user)
    db.commit()

    return {"message": "User created"}


# 🔐 LOGIN → returns JWT
@router.post("/login")
def login(payload: dict):
    db = SessionLocal()

    user = db.query(User).filter(
        User.username == payload["username"]
    ).first()

    if not user or not verify_password(payload["password"], user.password):
        return {"error": "Invalid credentials"}

    token = create_token(user.username)

    return {
        "access_token": token,
        "token_type": "bearer"
    }


# 🟢 GET TRAY (protected)
@router.get("/tray/{tray_id}")
def get_tray(tray_id: str, user: str = Depends(get_current_user)):
    db = SessionLocal()

    tray = db.query(Tray).filter(Tray.id == tray_id).first()

    if not tray:
        tray = Tray(id=tray_id)
        db.add(tray)
        db.commit()
        db.refresh(tray)

    return tray


# 🟢 SCAN (protected)
@router.post("/scan")
def scan(payload: dict, user: str = Depends(get_current_user)):
    db = SessionLocal()

    tray = db.query(Tray).filter(Tray.id == payload["id"]).first()

    if not tray:
        return {"error": "Tray not found"}

    result = advance_tray(db, tray, user)

    db.commit()
    db.refresh(tray)

    return tray if not isinstance(result, dict) else result


# 🟢 HISTORY (protected)
@router.get("/history/{tray_id}")
def get_history(tray_id: str, user: str = Depends(get_current_user)):
    db = SessionLocal()

    events = db.query(ScanEvent).filter(
        ScanEvent.tray_id == tray_id
    ).all()

    return events


# 🟢 DASHBOARD (protected)
@router.get("/trays")
def get_all_trays(user: str = Depends(get_current_user)):
    db = SessionLocal()
    return db.query(Tray).all()