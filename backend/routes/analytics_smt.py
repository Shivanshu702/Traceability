# backend/routes/analytics_smt.py
"""
SMT & Test analytics endpoints.

Endpoints:
  GET /api/analytics/smt-summary       — KPI summary for the dashboard header
  GET /api/analytics/yield?days=14     — daily FPY trend
  GET /api/analytics/cycle-time        — SMT→Test and test duration stats
  GET /api/analytics/unit-results      — paginated unit test result table

Register in main.py:
  from routes.analytics_smt import router as smt_analytics_router
  app.include_router(smt_analytics_router)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, Date, distinct, func
from sqlalchemy.orm import Session

from core.auth import require_role             # reuse existing auth guard
from database import get_db
from models.integration import SmtEvent, UnitTestResult
from schemas.integration import (
    CycleTimeStats,
    DailyYield,
    SmtSummary,
    UnitTestResultOut,
)

router = APIRouter(tags=["analytics-smt"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _today_utc() -> datetime:
    return datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)


# ── SMT dashboard summary ─────────────────────────────────────────────────────

@router.get(
    "/api/analytics/smt-summary",
    response_model=SmtSummary,
    dependencies=[Depends(require_role(["admin"]))],
)
def smt_summary(db: Session = Depends(get_db)):
    today = _today_utc()

    # Units and panels today
    units_today = db.query(func.count(UnitTestResult.id)).filter(
        UnitTestResult.test_started_at >= today
    ).scalar() or 0

    panels_today = db.query(func.count(SmtEvent.id)).filter(
        SmtEvent.smt_exit_at >= today
    ).scalar() or 0

    # First pass yield — units with no retests
    fpy_q     = db.query(UnitTestResult).filter(UnitTestResult.retests == 0)
    fpy_total = fpy_q.count()
    fpy_pass  = fpy_q.filter(UnitTestResult.status == "PASS").count()
    fpy_pct   = round((fpy_pass / fpy_total) * 100, 1) if fpy_total > 0 else None

    # Overall yield (all units ever tested)
    all_total  = db.query(func.count(UnitTestResult.id)).scalar() or 0
    all_passed = db.query(func.count(UnitTestResult.id)).filter(
        UnitTestResult.status == "PASS"
    ).scalar() or 0
    overall_yield_pct = round((all_passed / all_total) * 100, 1) if all_total > 0 else None

    # Failures and distinct codes today
    failures_today = db.query(func.count(UnitTestResult.id)).filter(
        UnitTestResult.test_started_at >= today,
        UnitTestResult.status == "FAIL",
    ).scalar() or 0

    failure_codes_today = db.query(
        func.count(distinct(UnitTestResult.failure_code))
    ).filter(
        UnitTestResult.test_started_at >= today,
        UnitTestResult.status == "FAIL",
        UnitTestResult.failure_code.isnot(None),
    ).scalar() or 0

    return SmtSummary(
        units_tested_today   = units_today,
        panels_today         = panels_today,
        fpy_pct              = fpy_pct,
        fpy_pass             = fpy_pass,
        fpy_total            = fpy_total,
        overall_yield_pct    = overall_yield_pct,
        failures_today       = failures_today,
        failure_codes_today  = failure_codes_today,
    )


# ── Daily yield trend ─────────────────────────────────────────────────────────

@router.get(
    "/api/analytics/yield",
    dependencies=[Depends(require_role(["admin"]))],
)
def yield_trend(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """
    Returns daily first-pass yield % for the last `days` days.
    Response: { "daily": [ { "date": "01 Jan", "tested": 82, "passed": 78, "fpy": 95.1 } ] }
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = db.query(
        cast(UnitTestResult.test_started_at, Date).label("day"),
        func.count(UnitTestResult.id).label("tested"),
        func.sum(
            case((UnitTestResult.status == "PASS", 1), else_=0)
        ).label("passed"),
    ).filter(
        UnitTestResult.test_started_at >= cutoff,
        UnitTestResult.retests == 0,    # first-pass only
    ).group_by(
        cast(UnitTestResult.test_started_at, Date)
    ).order_by(
        cast(UnitTestResult.test_started_at, Date)
    ).all()

    daily: List[DailyYield] = []
    for row in rows:
        tested = int(row.tested or 0)
        passed = int(row.passed or 0)
        fpy    = round((passed / tested) * 100, 1) if tested > 0 else 0.0
        # Format date label same as frontend expects: "01 Jan"
        label  = row.day.strftime("%d %b") if row.day else "?"
        daily.append(DailyYield(date=label, tested=tested, passed=passed, fpy=fpy))

    return {"daily": [d.model_dump() for d in daily]}


# ── Cycle time stats ──────────────────────────────────────────────────────────

@router.get(
    "/api/analytics/cycle-time",
    response_model=CycleTimeStats,
    dependencies=[Depends(require_role(["admin"]))],
)
def cycle_time_stats(db: Session = Depends(get_db)):
    """
    Calculates:
      - avg/min/max time from SMT exit → test start (seconds)
      - avg test duration (seconds)
    """
    # Rows where we have both timestamps
    rows = db.query(
        UnitTestResult.smt_exit_at,
        UnitTestResult.test_started_at,
        UnitTestResult.test_duration_sec,
    ).filter(
        UnitTestResult.smt_exit_at.isnot(None),
        UnitTestResult.test_started_at.isnot(None),
    ).all()

    cycle_secs = [
        (r.test_started_at - r.smt_exit_at).total_seconds()
        for r in rows
        if r.test_started_at > r.smt_exit_at
    ]

    dur_secs = [r.test_duration_sec for r in rows if r.test_duration_sec]

    return CycleTimeStats(
        avg_smt_to_test_sec   = round(sum(cycle_secs) / len(cycle_secs), 1) if cycle_secs else None,
        min_smt_to_test_sec   = round(min(cycle_secs), 1) if cycle_secs else None,
        max_smt_to_test_sec   = round(max(cycle_secs), 1) if cycle_secs else None,
        avg_test_duration_sec = round(sum(dur_secs) / len(dur_secs), 1)     if dur_secs  else None,
        sample_size           = len(cycle_secs),
    )


# ── Unit test results table ───────────────────────────────────────────────────

@router.get(
    "/api/analytics/unit-results",
    dependencies=[Depends(require_role(["admin"]))],
)
def unit_results(
    limit:   int           = Query(default=200, ge=1, le=2000),
    offset:  int           = Query(default=0,   ge=0),
    status:  Optional[str] = Query(default=None),
    tray_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Paginated unit test results with optional status / tray_id filter.
    Returns list of UnitTestResultOut with computed smt_to_test_sec.
    """
    q = db.query(UnitTestResult)

    if status:
        q = q.filter(UnitTestResult.status == status.upper())
    if tray_id:
        q = q.filter(UnitTestResult.tray_id == tray_id)

    rows = q.order_by(
        UnitTestResult.test_started_at.desc()
    ).offset(offset).limit(limit).all()

    out = []
    for r in rows:
        smt_to_test = None
        if r.smt_exit_at and r.test_started_at and r.test_started_at > r.smt_exit_at:
            smt_to_test = int((r.test_started_at - r.smt_exit_at).total_seconds())

        out.append(UnitTestResultOut(
            id                = r.id,
            unit_serial       = r.unit_serial,
            tray_id           = r.tray_id,
            smt_exit_at       = r.smt_exit_at,
            test_started_at   = r.test_started_at,
            test_completed_at = r.test_completed_at,
            smt_to_test_sec   = smt_to_test,
            test_duration_sec = r.test_duration_sec,
            status            = r.status,
            failure_code      = r.failure_code,
            retests           = r.retests,
            shift             = r.shift,
            project           = r.project,
        ).model_dump())

    return out