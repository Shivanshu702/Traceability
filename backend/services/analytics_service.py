from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, func, case
from sqlalchemy.orm import Session

from models import Tray, ScanEvent
from core.stages import STAGE_STUCK_LIMITS


# ── Bottleneck detection ──────────────────────────────────────────────────────

def detect_bottlenecks(db: Session, tenant_id: str = "default") -> list:

    now = datetime.now(timezone.utc)

    stage_clauses = []
    for stage, limit_seconds in STAGE_STUCK_LIMITS.items():
        if not limit_seconds:
            continue
        cutoff = now - timedelta(seconds=limit_seconds)

        stage_clauses.append(
            and_(
                Tray.stage == stage,
                or_(
                    and_(
                        Tray.stage_entered_at.isnot(None),
                        Tray.stage_entered_at < cutoff,
                    ),
                    and_(
                        Tray.stage_entered_at.is_(None),
                        Tray.last_updated.isnot(None),
                        Tray.last_updated < cutoff,
                    ),
                ),
            )
        )

    if not stage_clauses:
        return []

    stuck_trays = (
        db.query(Tray)
        .filter(
            Tray.tenant_id == tenant_id,
            Tray.is_done   == False,
            Tray.stage     != "SPLIT",
            or_(*stage_clauses),
        )
        .all()
    )

    bottlenecks = []
    for t in stuck_trays:
        arrival = t.stage_entered_at or t.last_updated
        if not arrival:
            continue
        # CRIT-4 FIX: make arrival timezone-aware if it somehow came back naive
        # (rows inserted before the migration used naive datetimes).
        if arrival.tzinfo is None:
            arrival = arrival.replace(tzinfo=timezone.utc)
        elapsed = (now - arrival).total_seconds()
        bottlenecks.append({
            "tray_id":       t.id,
            "stage":         t.stage,
            "project":       t.project,
            "delay_seconds": int(elapsed),
            "delay_hours":   round(elapsed / 3600, 1),
        })

    return bottlenecks


# ── Stage load ────────────────────────────────────────────────────────────────

def stage_load(db: Session, tenant_id: str = "default") -> dict:
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


# ── Full analytics ────────────────────────────────────────────────────────────

def get_analytics(db: Session, tenant_id: str = "default") -> dict:
    """
    Returns pipeline-wide analytics using aggregation queries.

    MED-1 FIX: the original implementation did:
        all_trays = db.query(Tray).filter(...).all()
        events    = db.query(ScanEvent).filter(...).all()
    which loads ALL rows into Python memory. On a large dataset (tens of
    thousands of trays + hundreds of thousands of scan events) this OOMs
    the server.

    This version uses SQL aggregation for totals/averages, and caps the
    stage-dwell scan event scan at 10,000 rows.
    """

    # ── Totals via SQL aggregation (no Python-side row loading) ───────────────
    row = db.query(
        func.count(Tray.id).label("total"),
        func.sum(
            case((Tray.completed_at.isnot(None), 1), else_=0)
        ).label("completed"),
        func.avg(
            case(
                (
                    and_(
                        Tray.completed_at.isnot(None),
                        Tray.created_at.isnot(None),
                    ),
                    func.extract("epoch", Tray.completed_at - Tray.created_at),
                ),
                else_=None,
            )
        ).label("avg_cycle"),
    ).filter(Tray.tenant_id == tenant_id).one()

    total     = int(row.total or 0)
    completed = int(row.completed or 0)
    wip       = total - completed
    avg_cycle = round(float(row.avg_cycle or 0), 1)


    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tenant_id)
        .order_by(ScanEvent.tray_id, ScanEvent.timestamp)
        .limit(10_000)
        .all()
    )

    stage_time:  dict = {}
    stage_count: dict = {}

    for i in range(len(events) - 1):
        curr = events[i]
        nxt  = events[i + 1]
        if curr.tray_id != nxt.tray_id:
            continue
        if not curr.timestamp or not nxt.timestamp:
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
        "completed":          completed,
        "wip":                wip,
        "avg_cycle_time_sec": avg_cycle,
        "avg_stage_time_sec": avg_stage_time,
    }