"""
api/analytics_routes.py
───────────────────────
Stats, alerts, stage load, and analytics endpoints.
Results are cached to reduce DB load on dashboard polls.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, AuditLog
from core.auth import get_current_user, require_admin, tenant
from core.cache import stats_cache, stage_load_cache
from services.analytics_service import detect_bottlenecks, stage_load, get_analytics
from datetime import date
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

    q = db.query(Tray).filter(Tray.tenant_id == tid, Tray.stage != "SPLIT")
    if project:
        q = q.filter(Tray.project == project)
    all_trays = q.all()
    today     = date.today()

    stage_counts: dict = {}
    stage_units:  dict = {}
    for t in all_trays:
        if t.stage != "COMPLETE":
            stage_counts[t.stage] = stage_counts.get(t.stage, 0) + 1
            stage_units[t.stage]  = stage_units.get(t.stage, 0) + (t.total_units or 0)

    result = {
        "total_active":          sum(1 for t in all_trays if t.stage != "COMPLETE"),
        "total_complete":        sum(1 for t in all_trays if t.stage == "COMPLETE"),
        "total_active_units":    sum(t.total_units or 0 for t in all_trays if t.stage != "COMPLETE"),
        "total_complete_units":  sum(t.total_units or 0 for t in all_trays if t.stage == "COMPLETE"),
        "fifo_violated":         sum(1 for t in all_trays if t.fifo_violated),
        "completed_today":       sum(
            1 for t in all_trays
            if t.stage == "COMPLETE" and t.completed_at and t.completed_at.date() == today
        ),
        "completed_today_units": sum(
            t.total_units or 0 for t in all_trays
            if t.stage == "COMPLETE" and t.completed_at and t.completed_at.date() == today
        ),
        "stuck_count":  len(detect_bottlenecks(db, tid)),
        "stage_counts": stage_counts,
        "stage_units":  stage_units,
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
