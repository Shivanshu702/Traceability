from models import Tray

def check_fifo_violation(db, tray: Tray):
    older_trays = db.query(Tray).filter(
        Tray.created_at < tray.created_at,
        Tray.is_done == False
    ).all()

    if older_trays:
        return {
            "violation": True,
            "older_trays": [t.id for t in older_trays]
        }

    return {"violation": False}