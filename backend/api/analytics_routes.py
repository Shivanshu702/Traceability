"""
api/analytics_routes.py
───────────────────────
Stats, alerts, stage load, and analytics endpoints.
Includes new operator productivity and weekly trend endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, and_, distinct
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, AuditLog, ScanEvent
from core.auth import get_current_user, require_admin, tenant
from core.cache import stats_cache, stage_load_cache
from services.analytics_service import detect_bottlenecks, stage_load, get_analytics
from datetime import date, datetime, timedelta
from typing import Optional

router = APIRouter(tags=["analytics"])


@router.get("/stats")
def get_stats(
    project: Optional[str] = Query(None),
    user:    dict          = Depends(get_current_user),
    db:      Session       = Depends(get_db),
):
    tid       = tenant(user)
    cache_key = f"stats:{tid}:{project or 'all'}"
    cached    = stats_cache.get(cache_key)
    if cached:
        return cached

    base = [Tray.tenant_id == tid, Tray.stage != "SPLIT"]
    if project:
        base.append(Tray.project == project)

    today_start = datetime.combine(date.today(), datetime.min.time())

    row = db.query(
        func.sum(case((Tray.stage != "COMPLETE", 1), else_=0)).label("total_active"),
        func.sum(case((Tray.stage != "COMPLETE", func.coalesce(Tray.total_units, 0)), else_=0)).label("total_active_units"),
        func.sum(case((Tray.stage == "COMPLETE", 1), else_=0)).label("total_complete"),
        func.sum(case((Tray.stage == "COMPLETE", func.coalesce(Tray.total_units, 0)), else_=0)).label("total_complete_units"),
        func.sum(case((Tray.fifo_violated == True, 1), else_=0)).label("fifo_violated"),
        func.sum(case(
            (and_(Tray.stage == "COMPLETE", Tray.completed_at >= today_start), 1),
            else_=0,
        )).label("completed_today"),
        func.sum(case(
            (and_(Tray.stage == "COMPLETE", Tray.completed_at >= today_start),
             func.coalesce(Tray.total_units, 0)),
            else_=0,
        )).label("completed_today_units"),
    ).filter(*base).one()

    stage_rows = db.query(
        Tray.stage,
        func.count(Tray.id).label("cnt"),
        func.sum(func.coalesce(Tray.total_units, 0)).label("units"),
    ).filter(*base, Tray.stage != "COMPLETE").group_by(Tray.stage).all()

    stage_counts = {r.stage: r.cnt   for r in stage_rows}
    stage_units  = {r.stage: r.units for r in stage_rows}

    result = {
        "total_active":          int(row.total_active          or 0),
        "total_complete":        int(row.total_complete         or 0),
        "total_active_units":    int(row.total_active_units     or 0),
        "total_complete_units":  int(row.total_complete_units   or 0),
        "fifo_violated":         int(row.fifo_violated          or 0),
        "completed_today":       int(row.completed_today        or 0),
        "completed_today_units": int(row.completed_today_units  or 0),
        "stuck_count":           len(detect_bottlenecks(db, tid)),
        "stage_counts":          stage_counts,
        "stage_units":           stage_units,
    }
    stats_cache.set(cache_key, result)
    return result


@router.get("/alerts")
def get_alerts(
    user: dict    = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    tid   = tenant(user)
    items = detect_bottlenecks(db, tid)
    return {"alerts": items, "count": len(items)}


@router.get("/stage-load")
def get_stage_load(
    user: dict    = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    tid       = tenant(user)
    cache_key = f"stage_load:{tid}"
    cached    = stage_load_cache.get(cache_key)
    if cached:
        return cached
    result = stage_load(db, tid)
    stage_load_cache.set(cache_key, result)
    return result


@router.get("/analytics")
def analytics(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    return get_analytics(db, tenant(user))


@router.get("/analytics/operators")
def operator_stats(
    days: int  = Query(default=30, ge=1, le=365),
    user: dict = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    """
    Per-operator productivity report.
    Returns scan counts, unique trays touched, FIFO violations triggered,
    and a per-stage breakdown for each operator over the last `days` days.
    """
    tid    = tenant(user)
    since  = datetime.utcnow() - timedelta(days=days)

    # Total scans + FIFO flags per operator
    rows = db.query(
        ScanEvent.operator,
        func.count(ScanEvent.id).label("total_scans"),
        func.count(distinct(ScanEvent.tray_id)).label("unique_trays"),
        func.sum(case((ScanEvent.fifo_flag == True, 1), else_=0)).label("fifo_flags"),
    ).filter(
        ScanEvent.tenant_id == tid,
        ScanEvent.timestamp >= since,
        ScanEvent.operator  != "SYSTEM",
    ).group_by(ScanEvent.operator).order_by(func.count(ScanEvent.id).desc()).all()

    # Per-stage breakdown per operator
    stage_rows = db.query(
        ScanEvent.operator,
        ScanEvent.stage,
        func.count(ScanEvent.id).label("cnt"),
    ).filter(
        ScanEvent.tenant_id == tid,
        ScanEvent.timestamp >= since,
        ScanEvent.operator  != "SYSTEM",
    ).group_by(ScanEvent.operator, ScanEvent.stage).all()

    stage_map: dict = {}
    for r in stage_rows:
        stage_map.setdefault(r.operator, {})[r.stage] = r.cnt

    # Daily scan activity per operator (last 7 days for sparkline)
    seven_ago = datetime.utcnow() - timedelta(days=7)
    daily_rows = db.query(
        ScanEvent.operator,
        func.date(ScanEvent.timestamp).label("day"),
        func.count(ScanEvent.id).label("cnt"),
    ).filter(
        ScanEvent.tenant_id == tid,
        ScanEvent.timestamp >= seven_ago,
        ScanEvent.operator  != "SYSTEM",
    ).group_by(ScanEvent.operator, func.date(ScanEvent.timestamp)).all()

    daily_map: dict = {}
    for r in daily_rows:
        daily_map.setdefault(r.operator, {})[str(r.day)] = r.cnt

    operators = [
        {
            "operator":     r.operator,
            "total_scans":  r.total_scans,
            "unique_trays": r.unique_trays,
            "fifo_flags":   int(r.fifo_flags or 0),
            "stages":       stage_map.get(r.operator, {}),
            "daily":        daily_map.get(r.operator, {}),
        }
        for r in rows
    ]

    return {
        "period_days": days,
        "since":       since.isoformat(),
        "operators":   operators,
    }


@router.get("/analytics/weekly")
def weekly_stats(
    weeks: int = Query(default=4, ge=1, le=12),
    user:  dict    = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    """
    Weekly throughput trends and shift comparison.
    Returns:
      - daily_scans: scan count per day for the last (weeks * 7) days
      - shift_comparison: trays per shift per week
      - completions_by_day: trays completed per day
    """
    tid   = tenant(user)
    since = datetime.utcnow() - timedelta(weeks=weeks)

    # Daily scan counts
    daily_scans = db.query(
        func.date(ScanEvent.timestamp).label("day"),
        func.count(ScanEvent.id).label("scans"),
    ).filter(
        ScanEvent.tenant_id == tid,
        ScanEvent.timestamp >= since,
    ).group_by(func.date(ScanEvent.timestamp)).order_by(func.date(ScanEvent.timestamp)).all()

    # Daily completions
    daily_completions = db.query(
        func.date(Tray.completed_at).label("day"),
        func.count(Tray.id).label("completions"),
        func.sum(func.coalesce(Tray.total_units, 0)).label("units"),
    ).filter(
        Tray.tenant_id == tid,
        Tray.stage     == "COMPLETE",
        Tray.completed_at >= since,
    ).group_by(func.date(Tray.completed_at)).order_by(func.date(Tray.completed_at)).all()

    # Shift comparison — trays created per shift per week
    shift_rows = db.query(
        Tray.shift,
        func.date_trunc("week", Tray.created_at).label("week_start"),
        func.count(Tray.id).label("cnt"),
    ).filter(
        Tray.tenant_id  == tid,
        Tray.created_at >= since,
        Tray.shift      != "",
        Tray.stage      != "SPLIT",
    ).group_by(Tray.shift, func.date_trunc("week", Tray.created_at)).order_by(func.date_trunc("week", Tray.created_at)).all()

    # Aggregate shift data by week
    shifts: dict = {}
    for r in shift_rows:
        wk = str(r.week_start)[:10] if r.week_start else "unknown"
        shifts.setdefault(wk, {})[r.shift or "Unknown"] = r.cnt

    return {
        "period_weeks": weeks,
        "since":        since.isoformat(),
        "daily_scans": [
            {"day": str(r.day), "scans": r.scans}
            for r in daily_scans
        ],
        "daily_completions": [
            {"day": str(r.day), "completions": r.completions, "units": int(r.units or 0)}
            for r in daily_completions
        ],
        "shift_by_week": shifts,
    }


@router.get("/audit-log")
def get_audit_log(
    limit: int     = 100,
    user:  dict    = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    tid  = tenant(user)
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == tid)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "username":  l.username,
            "action":    l.action,
            "details":   l.details,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        }
        for l in logs
    ]