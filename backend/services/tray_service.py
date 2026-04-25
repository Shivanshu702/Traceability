
from models import Tray
from services.fifo_service import check_fifo_violation
from services.log_service import log_scan
from services.pipeline_service import (
    get_stage_def, get_branch_options, is_split_enabled,
)
from datetime import datetime

SPLIT_MARKER = "SPLIT"


# ── Public entry point ──────────────────────────────────────────────────────

def advance_tray(
    db,
    tray: Tray,
    operator: str = "SYSTEM",
    next_stage_override: str = None,
    config: dict = None,
) -> dict:
    """Advance a tray one step in the pipeline.

    IMPORTANT: The caller must acquire a row-level lock on the tray before
    calling this function:
        tray = db.query(Tray).filter(...).with_for_update().first()
    This prevents race conditions when two operators scan the same tray
    simultaneously.
    """
    if config is None:
        from services.pipeline_service import build_default_config
        config = build_default_config()

    split_cfg      = config.get("split", {})
    branch_cfg     = config.get("branch", {})
    project_id     = tray.project or None

    split_stage    = split_cfg.get("atStage") if is_split_enabled(project_id, config) else None
    branch_options = get_branch_options(project_id, config)
    branch_stage   = branch_cfg.get("atStage") if branch_options else None

    # ── Block: parent after split ───────────────────────────────────────────
    if tray.stage == SPLIT_MARKER:
        return {
            "error": "This tray has been split. Scan Part A or Part B QR codes.",
            "is_split_parent_blocked": True,
        }

    # ── Block: already complete ─────────────────────────────────────────────
    if tray.stage == "COMPLETE":
        return {"error": f"{tray.id} is already complete.", "already_done": True}

    # ── FIFO check (warn + log, never block) ────────────────────────────────
    fifo     = check_fifo_violation(db, tray)
    fifo_vio = fifo["violation"]

    # ── Intercept split trigger ─────────────────────────────────────────────
    if split_stage and tray.stage == split_stage:
        return _split_tray(db, tray, operator, fifo_vio, fifo["older_trays"], config)

    # ── Branch stage — operator must supply a choice ────────────────────────
    now = datetime.utcnow()
    if branch_stage and tray.stage == branch_stage:
        valid_ids = [b["id"] for b in branch_options]
        if not next_stage_override or next_stage_override not in valid_ids:
            return {"error": "Please select a branch option (Robot or Manual)."}
        next_stage_id = next_stage_override
    else:
        sd = get_stage_def(tray.stage, config, project_id)
        if not sd or not sd.get("next"):
            return {"error": f"{tray.id} is already complete.", "already_done": True}
        next_stage_id = sd["next"]

    from_stage = tray.stage
    scan_note  = _build_scan_note(from_stage, next_stage_id, config)

    # ── Write new state ─────────────────────────────────────────────────────
    tray.stage            = next_stage_id
    tray.last_updated     = now
    tray.stage_entered_at = now          # ← records when tray joined this station queue
    tray.fifo_violated    = fifo_vio or tray.fifo_violated

    if next_stage_id == "COMPLETE":
        tray.is_done      = True
        tray.completed_at = now

    log_scan(
        db, tray.id, from_stage, next_stage_id, operator,
        fifo_vio, scan_note, tray.tenant_id,
    )

    nd = get_stage_def(next_stage_id, config, project_id)
    return {
        "ok":          True,
        "id":          tray.id,
        "from_stage":  from_stage,
        "to_stage":    next_stage_id,
        "to_label":    nd["label"] if nd else next_stage_id,
        "scan_note":   scan_note,
        "fifo_vio":    fifo_vio,
        "older_trays": fifo["older_trays"],
        "tray":        _tray_dict(tray),
    }


# ── Split helper ────────────────────────────────────────────────────────────

def _split_tray(
    db, tray: Tray, operator: str,
    fifo_vio: bool, older_trays: list, config: dict,
) -> dict:
    """Mark parent as SPLIT and create child trays A and B."""
    split_cfg    = config.get("split", {})
    resume_stage = split_cfg.get("resumeAtStage", "BAT_MOUNT")
    now          = datetime.utcnow()
    from_stage   = tray.stage

    tray.is_split_parent  = True
    tray.stage            = SPLIT_MARKER
    tray.last_updated     = now
    tray.stage_entered_at = now
    tray.fifo_violated    = fifo_vio or tray.fifo_violated

    half_a = (tray.total_units + 1) // 2
    half_b = tray.total_units - half_a

    for part, units in (("A", half_a), ("B", half_b)):
        child = Tray(
            id               = f"{tray.id}-{part}",
            tenant_id        = tray.tenant_id,
            stage            = resume_stage,
            project          = tray.project,
            shift            = tray.shift,
            created_by       = tray.created_by,
            batch_no         = tray.batch_no,
            total_units      = units,
            parent_id        = tray.id,
            fifo_violated    = tray.fifo_violated,
            created_at       = tray.created_at,
            last_updated     = now,
            stage_entered_at = now,   # child arrives at resume_stage right now
        )
        db.add(child)
        log_scan(
            db, child.id, "CREATED", resume_stage, operator,
            False, f"Split from {tray.id} — Part {part}", tray.tenant_id,
        )

    log_scan(
        db, tray.id, from_stage, SPLIT_MARKER, operator, fifo_vio,
        f"Split into {tray.id}-A and {tray.id}-B", tray.tenant_id,
    )

    nd = get_stage_def(resume_stage, config)
    return {
        "ok":          True,
        "id":          tray.id,
        "is_split":    True,
        "from_stage":  from_stage,
        "to_stage":    resume_stage,
        "to_label":    nd["label"] if nd else resume_stage,
        "scan_note":   f"Tray split into Part A & Part B — both now at {resume_stage}",
        "child_a":     f"{tray.id}-A",
        "child_b":     f"{tray.id}-B",
        "fifo_vio":    fifo_vio,
        "older_trays": older_trays,
        "tray":        _tray_dict(tray),
    }


# ── Helpers ─────────────────────────────────────────────────────────────────

def _build_scan_note(from_stage: str, to_stage: str, config: dict) -> str:
    for s in config.get("stages", []):
        if s["id"] == from_stage:
            note = s.get("scanNote", "")
            if note:
                return note

    for b in config.get("branch", {}).get("options", []):
        if b["id"] == from_stage:
            note = b.get("scanNote", "")
            if note:
                return note

    return f"{from_stage} → {to_stage}"


def _tray_dict(tray: Tray) -> dict:
    return {
        "id":               tray.id,
        "tenant_id":        tray.tenant_id,
        "stage":            tray.stage,
        "is_done":          tray.is_done,
        "is_split_parent":  tray.is_split_parent,
        "parent_id":        tray.parent_id,
        "project":          tray.project,
        "shift":            tray.shift,
        "created_by":       tray.created_by,
        "batch_no":         tray.batch_no,
        "total_units":      tray.total_units,
        "fifo_violated":    tray.fifo_violated,
        "created_at":       tray.created_at.isoformat() if tray.created_at else None,
        "last_updated":     tray.last_updated.isoformat() if tray.last_updated else None,
        "stage_entered_at": tray.stage_entered_at.isoformat() if tray.stage_entered_at else None,
        "completed_at":     tray.completed_at.isoformat() if tray.completed_at else None,
    }