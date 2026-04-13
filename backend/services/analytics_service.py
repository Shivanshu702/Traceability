from models import Tray, ScanEvent
from core.stages import STAGE_STUCK_LIMITS
from datetime import datetime


def detect_bottlenecks(db, tenant_id: str = "default") -> list:
    """
    Returns trays that have been sitting at their current stage longer than
    the defined threshold for that stage.
    """
    trays = db.query(Tray).filter(
        Tray.tenant_id == tenant_id,
        Tray.is_done   == False,
        Tray.stage     != "SPLIT",
    ).all()

    now         = datetime.utcnow()
    bottlenecks = []

    for t in trays:
        limit = STAGE_STUCK_LIMITS.get(t.stage)
        if not limit or not t.last_updated:
            continue
        elapsed = (now - t.last_updated).total_seconds()
        if elapsed > limit:
            bottlenecks.append({
                "tray_id":       t.id,
                "stage":         t.stage,
                "project":       t.project,
                "delay_seconds": int(elapsed),
                "delay_hours":   round(elapsed / 3600, 1),
            })

    return bottlenecks


def stage_load(db, tenant_id: str = "default") -> dict:
    """Returns count of active trays per stage."""
    trays = db.query(Tray).filter(
        Tray.tenant_id == tenant_id,
        Tray.is_done   == False,
        Tray.stage     != "SPLIT",
    ).all()

    load = {}
    for t in trays:
        load[t.stage] = load.get(t.stage, 0) + 1
    return load


def get_analytics(db, tenant_id: str = "default") -> dict:
    """
    Returns pipeline-wide analytics:
    total, completed, WIP, avg cycle time (seconds),
    per-stage average dwell time from scan events.
    """
    all_trays = db.query(Tray).filter(Tray.tenant_id == tenant_id).all()
    total     = len(all_trays)
    completed = [t for t in all_trays if t.completed_at and t.created_at]
    wip       = total - len(completed)

    cycle_times = [
        (t.completed_at - t.created_at).total_seconds()
        for t in completed
        if t.completed_at and t.created_at
    ]
    avg_cycle = round(sum(cycle_times) / len(cycle_times), 1) if cycle_times else 0

    stage_time:  dict = {}
    stage_count: dict = {}
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tenant_id)
        .order_by(ScanEvent.tray_id, ScanEvent.timestamp)
        .all()
    )

    for i in range(len(events) - 1):
        curr = events[i]
        nxt  = events[i + 1]
        if curr.tray_id != nxt.tray_id:
            continue
        diff = (nxt.timestamp - curr.timestamp).total_seconds()
        if diff < 0:
            continue
        stage_time[curr.stage]  = stage_time.get(curr.stage, 0) + diff
        stage_count[curr.stage] = stage_count.get(curr.stage, 0) + 1

    avg_stage_time = {
        s: round(stage_time[s] / stage_count[s], 1)
        for s in stage_time
        if stage_count.get(s, 0) > 0
    }

    return {
        "total":              total,
        "completed":          len(completed),
        "wip":                wip,
        "avg_cycle_time_sec": avg_cycle,
        "avg_stage_time_sec": avg_stage_time,
    }
