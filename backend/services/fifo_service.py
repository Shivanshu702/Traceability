from models import Tray


def check_fifo_violation(db, tray: Tray) -> dict:
    """
    Returns trays at the SAME stage AND same project that arrived before
    this tray (i.e. have an older last_updated timestamp).

    Scoped per-project: trays from different projects never affect each other.
    FIFO violations WARN and LOG — they do NOT block the scan.
    """
    older = db.query(Tray).filter(
        Tray.stage       == tray.stage,
        Tray.project     == tray.project,
        Tray.id          != tray.id,
        Tray.last_updated < tray.last_updated,
    ).all()

    return {
        "violation":   len(older) > 0,
        "older_trays": [t.id for t in older[:5]],
    }