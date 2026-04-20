"""
api/analytics_routes.py
───────────────────────
Stats, alerts, stage load, and analytics endpoints.

FIX: /stats previously fetched every tray row into Python memory then counted
in loops. Replaced with SQL COUNT/SUM using CASE WHEN — the DB does the work
in microseconds regardless of table size.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, and_
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, AuditLog
from core.auth import get_current_user, require_admin, tenant
from core.cache import stats_cache, stage_load_cache
from services.analytics_service import detect_bottlenecks, stage_load, get_analytics
from datetime import date, datetime, timezone
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

    # ── Base filter ───────────────────────────────────────────────────────────
    base = [Tray.tenant_id == tid, Tray.stage != "SPLIT"]
    if project:
        base.append(Tray.project == project)

    today_start = datetime.combine(date.today(), datetime.min.time())

    # ── Single SQL query for all scalar KPIs ──────────────────────────────────
    row = db.query(
        # active count & units
        func.sum(case((Tray.stage != "COMPLETE", 1), else_=0)).label("total_active"),
        func.sum(case((Tray.stage != "COMPLETE", func.coalesce(Tray.total_units, 0)), else_=0)).label("total_active_units"),
        # complete count & units
        func.sum(case((Tray.stage == "COMPLETE", 1), else_=0)).label("total_complete"),
        func.sum(case((Tray.stage == "COMPLETE", func.coalesce(Tray.total_units, 0)), else_=0)).label("total_complete_units"),
        # FIFO violations
        func.sum(case((Tray.fifo_violated == True, 1), else_=0)).label("fifo_violated"),
        # completed today
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

    # ── Per-stage counts and units (active only) ──────────────────────────────
    stage_rows = db.query(
        Tray.stage,
        func.count(Tray.id).label("cnt"),
        func.sum(func.coalesce(Tray.total_units, 0)).label("units"),
    ).filter(*base, Tray.stage != "COMPLETE").group_by(Tray.stage).all()

    stage_counts = {r.stage: r.cnt   for r in stage_rows}
    stage_units  = {r.stage: r.units for r in stage_rows}

    result = {
        "total_active":          int(row.total_active   or 0),
        "total_complete":        int(row.total_complete  or 0),
        "total_active_units":    int(row.total_active_units   or 0),
        "total_complete_units":  int(row.total_complete_units or 0),
        "fifo_violated":         int(row.fifo_violated   or 0),
        "completed_today":       int(row.completed_today or 0),
        "completed_today_units": int(row.completed_today_units or 0),
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