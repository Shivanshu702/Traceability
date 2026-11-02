
# C:\SHIVANSH\Traceability\backend\routes\analytics_smt.py

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, Date, distinct, func
from sqlalchemy.orm import Session

from core.auth import require_admin             # reuse existing auth guard
from database import get_db
from models.integration import SmtEvent, UnitTestResult
import csv, io
from models.integration import SmtUnitEvent
from fastapi.responses import StreamingResponse
from schemas.integration import (
    CycleTimeStats,
    DailyYield,
    SmtSummary,
    UnitTestResultOut,
)

router = APIRouter(tags=["analytics-smt"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _today_utc() -> datetime:
    n = datetime.now(timezone.utc)
    return datetime(n.year, n.month, n.day, tzinfo=timezone.utc)


# ── SMT dashboard summary ─────────────────────────────────────────────────────

@router.get(
    "/api/analytics/smt-summary",
    response_model=SmtSummary,
    dependencies=[Depends(require_admin)],
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
    fpy_q     = db.query(UnitTestResult).filter(UnitTestResult.run_number == 1)
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
    dependencies=[Depends(require_admin)],
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
        UnitTestResult.run_number == 1,    # first-pass only
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
    dependencies=[Depends(require_admin)],
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
    dependencies=[Depends(require_admin)],
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

@router.get("/api/analytics/unit-journey", dependencies=[Depends(require_admin)])
def unit_journey(
    limit:   int           = Query(default=200, ge=1, le=2000),
    offset:  int           = Query(default=0,   ge=0),
    status:  Optional[str] = Query(default=None),
    project: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Full unit journey: SMT entry → exit → all test runs → final pass."""
    q = db.query(SmtUnitEvent)
    if project:
        q = q.filter(SmtUnitEvent.project_id == project)
    units = q.order_by(SmtUnitEvent.smt_exit_at.desc()).offset(offset).limit(limit).all()

    result = []
    for unit in units:
        runs = db.query(UnitTestResult).filter(
            UnitTestResult.unit_serial == unit.unit_serial
        ).order_by(UnitTestResult.test_started_at.asc()).all()

        first_run  = runs[0] if runs else None
        final_pass = next((r for r in runs if r.status == "PASS"), None)
        latest     = runs[-1] if runs else None
        final_status = latest.status if latest else "PENDING"

        if status and final_status != status.upper():
            continue

        def _sec(a, b):
            if a and b and b > a:
                return int((b - a).total_seconds())
            return None

        result.append({
            "unit_serial":           unit.unit_serial,
            "panel_id":              unit.panel_id,
            "position":              unit.position,
            "project_id":            unit.project_id,
            "smt_entry_at":          unit.smt_entry_at.isoformat() if unit.smt_entry_at else None,
            "smt_exit_at":           unit.smt_exit_at.isoformat()  if unit.smt_exit_at  else None,
            "smt_duration_sec":      _sec(unit.smt_entry_at, unit.smt_exit_at),
            "total_runs":            len(runs),
            "first_test_at":         first_run.test_started_at.isoformat() if first_run and first_run.test_started_at else None,
            "smt_to_first_test_sec": _sec(unit.smt_exit_at, first_run.test_started_at if first_run else None),
            "final_status":          final_status,
            "pass_run_number":       final_pass.run_number if final_pass else None,
            "pass_at":               final_pass.test_started_at.isoformat() if final_pass and final_pass.test_started_at else None,
            "smt_to_pass_sec":       _sec(unit.smt_exit_at, final_pass.test_started_at if final_pass else None),
            "test_runs": [
                {
                    "run_number":      r.run_number,
                    "status":          r.status,
                    "test_started_at": r.test_started_at.isoformat() if r.test_started_at else None,
                    "duration_sec":    r.test_duration_sec,
                    "failure_code":    r.failure_code,
                    "failure_step":    r.failure_step,
                }
                for r in runs
            ],
        })

    return result


@router.get("/api/analytics/unit-journey/export", dependencies=[Depends(require_admin)])
def unit_journey_export(
    project: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Download unit journey as CSV."""
    q = db.query(SmtUnitEvent)
    if project:
        q = q.filter(SmtUnitEvent.project_id == project)
    units = q.order_by(SmtUnitEvent.smt_exit_at.desc()).all()

    output = io.StringIO()
    w = csv.writer(output)
    w.writerow([
        "Unit Serial", "Panel ID", "Position", "Project",
        "SMT Entry", "SMT Exit", "SMT Duration (min)",
        "First Test At", "SMT→Test (hrs)",
        "Total Runs", "Final Status",
        "Pass Run #", "Pass At", "SMT→Pass (hrs)",
        "Failure Codes",
    ])

    for unit in units:
        runs       = db.query(UnitTestResult).filter(
            UnitTestResult.unit_serial == unit.unit_serial
        ).order_by(UnitTestResult.test_started_at.asc()).all()
        first_run  = runs[0] if runs else None
        final_pass = next((r for r in runs if r.status == "PASS"), None)
        latest     = runs[-1] if runs else None
        fail_codes = ", ".join({r.failure_code for r in runs if r.failure_code})

        def _hrs(a, b):
            if a and b and b > a:
                return round((b - a).total_seconds() / 3600, 2)
            return ""

        def _min(a, b):
            if a and b and b > a:
                return round((b - a).total_seconds() / 60, 1)
            return ""

        w.writerow([
            unit.unit_serial,
            unit.panel_id,
            unit.position or "",
            unit.project_id or "",
            unit.smt_entry_at.isoformat() if unit.smt_entry_at else "",
            unit.smt_exit_at.isoformat()  if unit.smt_exit_at  else "",
            _min(unit.smt_entry_at, unit.smt_exit_at),
            first_run.test_started_at.isoformat() if first_run and first_run.test_started_at else "",
            _hrs(unit.smt_exit_at, first_run.test_started_at if first_run else None),
            len(runs),
            latest.status if latest else "PENDING",
            final_pass.run_number if final_pass else "",
            final_pass.test_started_at.isoformat() if final_pass and final_pass.test_started_at else "",
            _hrs(unit.smt_exit_at, final_pass.test_started_at if final_pass else None),
            fail_codes,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=unit_journey.csv"},
    )

