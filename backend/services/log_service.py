import uuid
from models import ScanEvent
from datetime import datetime


def log_scan(db, tray_id: str, from_stage: str, to_stage: str,
             operator: str = "SYSTEM", fifo_flag: bool = False, note: str = ""):
    event = ScanEvent(
        id         = str(uuid.uuid4()),
        tray_id    = tray_id,
        from_stage = from_stage,
        stage      = to_stage,
        operator   = operator,
        fifo_flag  = fifo_flag,
        note       = note,
        timestamp  = datetime.utcnow(),
    )
    db.add(event)