"""
services/fifo_service.py
────────────────────────
FIFO violation detection.

BUG FIXED: The original implementation compared `Tray.last_updated`, which is
refreshed on every scan advance — not just on entry to the current stage.
A fast-moving tray that passed through many prior stages quickly would appear
to have arrived *later* than a slow tray, producing false negatives and
false positives.

FIX: We now compare `Tray.stage_entered_at`, which is set once when the tray
transitions *into* its current stage (see tray_service.advance_tray).
This correctly reflects the order in which trays joined the queue at
this specific station.

FIFO violations WARN and LOG — they do NOT block the scan.
"""
from models import Tray


def check_fifo_violation(db, tray: Tray) -> dict:
    """
    Return trays at the SAME stage, same project, same tenant that
    arrived (stage_entered_at) before this tray.

    Falls back to last_updated if stage_entered_at is NULL on older rows
    that pre-date the migration — this is safe because the fallback only
    affects rows created before the fix was deployed.
    """
    # Prefer stage_entered_at; fall back to last_updated for pre-migration rows.
    tray_arrival = tray.stage_entered_at or tray.last_updated

    if tray_arrival is None:
        # Cannot determine arrival time — skip FIFO check to avoid false positives.
        return {"violation": False, "older_trays": []}

    from sqlalchemy import or_, and_

    older = (
        db.query(Tray)
        .filter(
            Tray.tenant_id == tray.tenant_id,
            Tray.stage     == tray.stage,
            Tray.project   == tray.project,
            Tray.id        != tray.id,
            Tray.is_done   == False,
            # Compare stage_entered_at when available, last_updated otherwise.
            or_(
                and_(
                    Tray.stage_entered_at.isnot(None),
                    Tray.stage_entered_at < tray_arrival,
                ),
                and_(
                    Tray.stage_entered_at.is_(None),
                    Tray.last_updated < tray_arrival,
                ),
            ),
        )
        .order_by(Tray.stage_entered_at.asc().nulls_last())
        .limit(5)
        .all()
    )

    return {
        "violation":   len(older) > 0,
        "older_trays": [t.id for t in older],
    }