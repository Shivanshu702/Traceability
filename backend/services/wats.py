
# backend/services/wats.py
"""
WATS (Worldwide Assembly Test System) integration service.

Responsibilities:
  - Pull UUT (unit-under-test) results from the WATS REST API.
  - Upsert into unit_test_results table.
  - Compute smt_to_test_sec from SmtEvent.smt_exit_at → UnitTestResult.test_started_at.
  - Provide a connection-test helper for the admin UI.

WATS API docs: https://docs.wats.com/
Authentication: Bearer token in Authorization header.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from models.integration import IntegrationConfig, SmtEvent, UnitTestResult

from core.timeutil import shift_for
log = logging.getLogger("wats")


# ── Connection test ────────────────────────────────────────────────────────────

async def test_connection(url: str, api_key: str) -> Dict[str, Any]:
    """Verify WATS credentials by hitting the /api/v1/user/me endpoint."""
    if not url:
        return {"status": "error", "message": "WATS URL is not configured."}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{url.rstrip('/')}/api/v1/user/me",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if r.status_code == 200:
            data = r.json()
            return {"status": "ok", "message": f"Connected as {data.get('name', 'unknown')}"}
        if r.status_code == 401:
            return {"status": "error", "message": "Invalid API key (401 Unauthorized)."}
        return {"status": "error", "message": f"HTTP {r.status_code}: {r.text[:120]}"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


# ── Result fetcher ─────────────────────────────────────────────────────────────

async def fetch_results(
    url:     str,
    api_key: str,
    since:   Optional[datetime] = None,
    limit:   int = 500,
) -> List[Dict[str, Any]]:
    """
    Fetch UUT results from WATS since `since`.

    WATS endpoint: GET /api/v1/result
    Docs: https://docs.wats.com/reference/get-results

    Returns list of result dicts. Each dict contains at minimum:
      {
        "id":          "wats-result-uuid",
        "serialNumber":"XYZ123456-01",
        "status":      "Passed" | "Failed",
        "started":     "2024-01-01T08:05:00Z",
        "duration":    127,                     ← seconds
        "failureCode": "VOLTAGE_OOT" | null,
        "stepResults": [ ... ]                  ← raw measurements
      }
    """
    params: Dict[str, Any] = {"take": limit, "orderBy": "started", "orderDir": "asc"}
    if since:
        params["startedAfter"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{url.rstrip('/')}/api/v1/result",
                headers={"Authorization": f"Bearer {api_key}"},
                params=params,
            )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("items", data.get("results", []))
    except httpx.HTTPStatusError as exc:
        log.error("WATS API error: %s — %s", exc.response.status_code, exc.response.text[:200])
        raise
    except Exception as exc:
        log.error("WATS fetch error: %s", exc)
        raise


# ── Upsert helper ─────────────────────────────────────────────────────────────

def _parse_wats_result(raw: Dict[str, Any], db: Session, tenant_id: str):
    from models.integration import SmtUnitEvent

    serial       = raw.get("serialNumber") or raw.get("serial_number", "")
    wats_id      = str(raw.get("id", ""))
    status_raw   = raw.get("status", "").lower()
    status       = "PASS" if "pass" in status_raw else "FAIL"

    started_str  = raw.get("started") or raw.get("startTime")
    started_at   = datetime.fromisoformat(
                       started_str.replace("Z", "+00:00")
                   ) if started_str else None
    duration_sec = int(raw.get("duration", 0) or 0)
    completed_at = (started_at + timedelta(seconds=duration_sec)) if started_at and duration_sec else None

    fail_code    = raw.get("failureCode") or raw.get("failure_code")
    fail_step    = raw.get("failedStep")  or raw.get("failed_step")
    measurements = raw.get("stepResults") or raw.get("measurements") or []

    # Get SMT exit time from unit-level event (most accurate)
    smt_exit_at = None
    unit_evt = db.query(SmtUnitEvent).filter(
        SmtUnitEvent.tenant_id   == tenant_id,
        SmtUnitEvent.unit_serial == serial,
    ).order_by(SmtUnitEvent.created_at.desc()).first()
    if unit_evt:
        smt_exit_at = unit_evt.smt_exit_at

    # Upsert if already stored
    existing = db.query(UnitTestResult).filter(
        UnitTestResult.tenant_id      == tenant_id,
        UnitTestResult.wats_result_id == wats_id,
    ).first()
    if existing:
        existing.status            = status
        existing.failure_code      = fail_code
        existing.failure_step      = fail_step
        existing.test_duration_sec = duration_sec
        existing.test_started_at   = started_at
        existing.test_completed_at = completed_at
        existing.smt_exit_at       = existing.smt_exit_at or smt_exit_at
        existing.measurements      = measurements
        existing.raw_wats_payload  = raw
        return False, existing

    # Count prior runs for this serial to assign run number
    prior_runs = db.query(UnitTestResult).filter(
        UnitTestResult.tenant_id   == tenant_id,
        UnitTestResult.unit_serial == serial,
    ).count()
    run_number = prior_runs + 1

    # is_final_pass: True only if this run is PASS and no prior PASS exists
    prior_pass = db.query(UnitTestResult).filter(
        UnitTestResult.tenant_id   == tenant_id,
        UnitTestResult.unit_serial == serial,
        UnitTestResult.status      == "PASS",
    ).first()
    is_final_pass = (status == "PASS" and prior_pass is None)

    return True, UnitTestResult(
        tenant_id         = tenant_id,
        unit_serial       = serial,
        tray_id           = None,
        wats_result_id    = wats_id,
        smt_exit_at       = smt_exit_at,
        test_started_at   = started_at,
        test_completed_at = completed_at,
        test_duration_sec = duration_sec,
        status            = status,
        failure_code      = fail_code,
        failure_step      = fail_step,
        run_number        = run_number,
        retests           = run_number - 1,
        shift             = shift_for(started_at),
        is_final_pass     = is_final_pass,
        measurements      = measurements,
        raw_wats_payload  = raw,
    )


# ── Full sync ─────────────────────────────────────────────────────────────────

async def run_sync(db: Session, config: IntegrationConfig) -> Dict[str, Any]:
    """
    Pull all WATS results since last_sync, upsert into unit_test_results.
    Returns a dict matching WatsSyncResult schema.
    """
    results_pulled  = 0
    results_created = 0
    results_updated = 0
    errors: List[str] = []

    raw_results = await fetch_results(
        url     = config.wats_url,
        api_key = config.wats_api_key,
        # 5-min overlap: upserts are idempotent (keyed on wats_result_id), so re-reading
        # a few results is harmless while it closes gaps at the sync boundary.
        since   = (config.wats_last_sync - timedelta(minutes=5)) if config.wats_last_sync else None,
    )
    results_pulled = len(raw_results)

    for raw in raw_results:
        try:
            is_new, record = _parse_wats_result(raw, db, config.tenant_id)
            if is_new:
                db.add(record)
                db.flush()      # so the next result for the same serial sees this run
                results_created += 1
            else:
                results_updated += 1
        except Exception as exc:
            serial = raw.get("serialNumber", "?")
            errors.append(f"Unit {serial}: {exc}")
            log.error("WATS upsert error for %s: %s", serial, exc)

    # Advance the cursor only after a clean run, so failed units are retried next time.
    if not errors:
        config.wats_last_sync = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        errors.append(f"DB commit failed: {exc}")

    return {
        "results_pulled":  results_pulled,
        "results_created": results_created,
        "results_updated": results_updated,
        "errors":          errors,
    }

