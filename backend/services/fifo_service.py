from models import Tray


def check_fifo_violation(db, tray: Tray) -> dict:
    """
    Returns trays at the SAME stage AND same project AND same tenant that
    arrived before this tray (older last_updated timestamp).

    Scoped per-project and per-tenant so different tenants / projects never
    interfere with each other.
    FIFO violations WARN and LOG — they do NOT block the scan.
    """
    older = db.query(Tray).filter(
        Tray.tenant_id    == tray.tenant_id,
        Tray.stage        == tray.stage,
        Tray.project      == tray.project,
        Tray.id           != tray.id,
        Tray.last_updated <  tray.last_updated,
    ).all()

    return {
        "violation":   len(older) > 0,
        "older_trays": [t.id for t in older[:5]],
    }
