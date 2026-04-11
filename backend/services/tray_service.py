from models import Tray
from core.stages import (
    STAGES, SPLIT_STAGE, SPLIT_NEXT_STAGE, SPLIT_MARKER,
    BRANCH_STAGE, BRANCH_OPTIONS, get_stage_def, get_units_for_project
)
from services.fifo_service import check_fifo_violation
from services.log_service import log_scan
from datetime import datetime


def advance_tray(db, tray: Tray, operator: str = "SYSTEM",
                 next_stage_override: str = None) -> dict:
    """
    Advance a tray one step in the pipeline.
    Handles: normal flow, branch selection, split trigger.
    FIFO violations are LOGGED and RETURNED as a warning — not a blocker.
    """

    # ── Block: parent tray after split ────────────────────────────────────────
    if tray.stage == SPLIT_MARKER:
        return {
            "error": "This tray has been split. Scan Part A or Part B QR codes.",
            "is_split_parent_blocked": True,
        }

    # ── Block: already complete ────────────────────────────────────────────────
    sd = get_stage_def(tray.stage)
    if tray.stage == "COMPLETE":
        return {"error": f"{tray.id} is already complete.", "already_done": True}

    # ── FIFO check (warn, never block) ─────────────────────────────────────────
    fifo = check_fifo_violation(db, tray)
    fifo_vio = fifo["violation"]

    # ── Intercept split trigger ────────────────────────────────────────────────
    if tray.stage == SPLIT_STAGE:
        return _split_tray(db, tray, operator, fifo_vio, fifo["older_trays"])

    # ── Branch stage — operator must supply a choice ───────────────────────────
    now = datetime.utcnow()
    if tray.stage == BRANCH_STAGE:
        valid_ids = [b["id"] for b in BRANCH_OPTIONS]
        if not next_stage_override or next_stage_override not in valid_ids:
            return {"error": "Please select a branch option (Robot or Manual)."}
        next_stage_id = next_stage_override
    else:
        if not sd or not sd.get("next"):
            return {"error": f"{tray.id} is already complete.", "already_done": True}
        next_stage_id = sd["next"]

    from_stage = tray.stage

    # ── Write new state ────────────────────────────────────────────────────────
    tray.stage        = next_stage_id
    tray.last_updated = now
    tray.fifo_violated = fifo_vio or tray.fifo_violated

    if next_stage_id == "COMPLETE":
        tray.is_done     = True
        tray.completed_at = now

    note = f"{from_stage} → {next_stage_id}"
    log_scan(db, tray.id, from_stage, next_stage_id, operator, fifo_vio, note)

    nd = get_stage_def(next_stage_id)
    return {
        "ok":        True,
        "id":        tray.id,
        "from_stage": from_stage,
        "to_stage":  next_stage_id,
        "to_label":  nd["label"] if nd else next_stage_id,
        "fifo_vio":  fifo_vio,
        "older_trays": fifo["older_trays"],
        "tray":      _tray_dict(tray),
    }


def _split_tray(db, tray: Tray, operator: str,
                fifo_vio: bool, older_trays: list) -> dict:
    """Mark parent as SPLIT and create child trays A and B."""
    now        = datetime.utcnow()
    from_stage = tray.stage

    tray.is_split_parent = True
    tray.stage           = SPLIT_MARKER
    tray.last_updated    = now
    tray.fifo_violated   = fifo_vio or tray.fifo_violated

    half_a = (tray.total_units + 1) // 2
    half_b = tray.total_units - half_a

    for part, units in (("A", half_a), ("B", half_b)):
        child = Tray(
            id            = f"{tray.id}-{part}",
            stage         = SPLIT_NEXT_STAGE,
            project       = tray.project,
            shift         = tray.shift,
            created_by    = tray.created_by,
            batch_no      = tray.batch_no,
            total_units   = units,
            parent_id     = tray.id,
            fifo_violated = tray.fifo_violated,
            created_at    = tray.created_at,
            last_updated  = now,
        )
        db.add(child)
        log_scan(db, child.id, "CREATED", SPLIT_NEXT_STAGE, operator, False,
                 f"Split from {tray.id} — Part {part}")

    log_scan(db, tray.id, from_stage, SPLIT_MARKER, operator, fifo_vio,
             f"Split into {tray.id}-A and {tray.id}-B")

    nd = get_stage_def(SPLIT_NEXT_STAGE)
    return {
        "ok":        True,
        "id":        tray.id,
        "is_split":  True,
        "from_stage": from_stage,
        "to_stage":  SPLIT_NEXT_STAGE,
        "to_label":  nd["label"] if nd else SPLIT_NEXT_STAGE,
        "child_a":   f"{tray.id}-A",
        "child_b":   f"{tray.id}-B",
        "fifo_vio":  fifo_vio,
        "older_trays": older_trays,
        "tray":      _tray_dict(tray),
    }


def _tray_dict(tray: Tray) -> dict:
    return {
        "id":              tray.id,
        "stage":           tray.stage,
        "is_done":         tray.is_done,
        "is_split_parent": tray.is_split_parent,
        "parent_id":       tray.parent_id,
        "project":         tray.project,
        "shift":           tray.shift,
        "created_by":      tray.created_by,
        "batch_no":        tray.batch_no,
        "total_units":     tray.total_units,
        "fifo_violated":   tray.fifo_violated,
        "created_at":      tray.created_at.isoformat() if tray.created_at else None,
        "last_updated":    tray.last_updated.isoformat() if tray.last_updated else None,
        "completed_at":    tray.completed_at.isoformat() if tray.completed_at else None,
    }