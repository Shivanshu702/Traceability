from models import Tray
from datetime import datetime

# ⏱ Thresholds (seconds)
STAGE_LIMITS = {
    "CREATED": 60,
    "RACK1": 120,
    "RACK2": 180,
    "BAT_MOUNT": 240,
}

def detect_bottlenecks(db):
    trays = db.query(Tray).filter(Tray.is_done == False).all()

    now = datetime.utcnow()

    bottlenecks = []

    for t in trays:
        if t.stage in STAGE_LIMITS:
            time_spent = (now - t.last_updated).total_seconds()

            if time_spent > STAGE_LIMITS[t.stage]:
                bottlenecks.append({
                    "tray_id": t.id,
                    "stage": t.stage,
                    "delay_seconds": int(time_spent)
                })

    return bottlenecks


def stage_load(db):
    trays = db.query(Tray).filter(Tray.is_done == False).all()

    load = {}

    for t in trays:
        load[t.stage] = load.get(t.stage, 0) + 1

    return load