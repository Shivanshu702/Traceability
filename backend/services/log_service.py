from models import ScanEvent

def log_scan(db, tray_id, stage, operator="SYSTEM"):
    event = ScanEvent(
        tray_id=tray_id,
        stage=stage,
        operator=operator
    )
    db.add(event)