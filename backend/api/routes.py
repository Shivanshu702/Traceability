from fastapi import APIRouter
from database import SessionLocal
from models import Tray, ScanEvent
from services.tray_service import advance_tray

router = APIRouter()

@router.get("/tray/{tray_id}")
def get_tray(tray_id: str):
    db = SessionLocal()

    tray = db.query(Tray).filter(Tray.id == tray_id).first()

    if not tray:
        tray = Tray(id=tray_id)
        db.add(tray)
        db.commit()
        db.refresh(tray)

    return tray


@router.post("/scan")
def scan(payload: dict):
    db = SessionLocal()

    tray = db.query(Tray).filter(Tray.id == payload["id"]).first()

    if not tray:
        return {"error": "Tray not found"}

    operator = payload.get("operator", "SYSTEM")

    result = advance_tray(db, tray, operator)

    db.commit()
    db.refresh(tray)

    return tray if not isinstance(result, dict) else result


# 🔥 NEW: GET HISTORY
@router.get("/history/{tray_id}")
def get_history(tray_id: str):
    db = SessionLocal()

    events = db.query(ScanEvent).filter(
        ScanEvent.tray_id == tray_id
    ).all()

    return events