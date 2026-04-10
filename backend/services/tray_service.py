from models import Tray
from core.stages import STAGES, SPLIT_STAGE
from services.fifo_service import check_fifo_violation
from services.log_service import log_scan

def advance_tray(db, tray: Tray, operator="SYSTEM"):

    # 🚫 FIFO CHECK
    fifo = check_fifo_violation(db, tray)
    if fifo["violation"]:
        return {
            "error": "FIFO violation",
            "older_trays": fifo["older_trays"]
        }

    # ❌ prevent parent scan
    if tray.is_split_parent:
        return {"error": "Parent tray cannot be processed"}

    # 🔥 SPLIT LOGIC
    if tray.stage == SPLIT_STAGE:
        tray.is_split_parent = True
        tray.stage = "SPLIT_DONE"

        trayA = Tray(
            id=f"{tray.id}-A",
            stage="BAT_MOUNT",
            parent_id=tray.id
        )

        trayB = Tray(
            id=f"{tray.id}-B",
            stage="BAT_MOUNT",
            parent_id=tray.id
        )

        db.add_all([trayA, trayB])

        log_scan(db, tray.id, "SPLIT", operator)
        return tray

    # 🔄 NORMAL FLOW
    current_index = STAGES.index(tray.stage)

    if current_index < len(STAGES) - 1:
        tray.stage = STAGES[current_index + 1]

        if tray.stage == "COMPLETE":
            tray.is_done = True

    # ✅ LOG EVERY SCAN
    log_scan(db, tray.id, tray.stage, operator)

    return tray