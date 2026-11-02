
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, func, case
from sqlalchemy.orm import Session

from models import Tray, ScanEvent
from services.pipeline_service import get_pipeline_config, get_stuck_limits
from core.timeutil import as_aware


# ── Bottleneck detection ──────────────────────────────────────────────────────

def detect_bottlenecks(db: Session, tenant_id: str = "default") -> list:

    now = datetime.now(timezone.utc)

    # Limits come from the tenant's pipeline config, so custom stages and the
    # thresholds edited in the Admin UI are honoured.
    limits = get_stuck_limits(get_pipeline_config(db, tenant_id))

    stage_clauses = []
    for stage, limit_seconds in limits.items():
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
        arrival = as_aware(arrival)
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

    # ── Totals via SQL aggregation (portable: SQLite + Postgres) ──────────────
    row = db.query(
        func.count(Tray.id).label("total"),
        func.sum(case((Tray.is_done == True, 1), else_=0)).label("completed"),
    ).filter(Tray.tenant_id == tenant_id, Tray.stage != "SPLIT").one()

    total     = int(row.total or 0)
    completed = int(row.completed or 0)
    wip       = total - completed

    # Average cycle time over the 10k most recent completions, computed in
    # Python so it works on every database (extract(epoch) is not portable).
    done_rows = (
        db.query(Tray.created_at, Tray.completed_at)
        .filter(Tray.tenant_id == tenant_id, Tray.completed_at.isnot(None),
                Tray.created_at.isnot(None))
        .order_by(Tray.completed_at.desc())
        .limit(10_000)
        .all()
    )
    cycles = [
        (as_aware(c).timestamp() - as_aware(cr).timestamp())
        for cr, c in done_rows
    ]
    cycles = [x for x in cycles if x >= 0]
    avg_cycle = round(sum(cycles) / len(cycles), 1) if cycles else 0.0

    # Stage dwell: the 20k MOST RECENT events (not "first 10k by tray id"),
    # regrouped per tray and walked in time order.
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tenant_id)
        .order_by(ScanEvent.timestamp.desc())
        .limit(20_000)
        .all()
    )
    events.sort(key=lambda e: (e.tray_id or "", e.timestamp or datetime.min))

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
