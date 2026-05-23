# backend/services/cogiscan.py
"""
Cogiscan SMT traceability integration service.

Responsibilities:
  - Poll the Cogiscan REST API for new panels that have exited the SMT line.
  - For each new panel, auto-create a tray record in the traceability DB
    and mark the SMT event as processed.
  - Provide a connection-test helper for the admin UI.

Cogiscan API used here follows the standard Cogiscan Web API format.
Adjust endpoint paths to match your specific Cogiscan server version.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from models.integration import IntegrationConfig, SmtEvent

log = logging.getLogger("cogiscan")


# ── Connection test ────────────────────────────────────────────────────────────

async def test_connection(url: str, api_key: str) -> Dict[str, Any]:
    """
    Ping the Cogiscan API and return {"status": "ok"} or {"status": "error", ...}.
    Adjust the endpoint to whatever your Cogiscan server exposes for a health-check.
    """
    if not url:
        return {"status": "error", "message": "Cogiscan URL is not configured."}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{url.rstrip('/')}/api/v1/status",
                headers={"X-Api-Key": api_key},
            )
        if r.status_code < 400:
            return {"status": "ok", "message": f"Connected (HTTP {r.status_code})"}
        return {"status": "error", "message": f"HTTP {r.status_code}: {r.text[:120]}"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


# ── Panel fetcher ─────────────────────────────────────────────────────────────

async def fetch_new_panels(
    url: str,
    api_key: str,
    since: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch panels that exited the SMT line after `since`.
    Returns a list of panel dicts. Adapt the endpoint and field names
    to match your Cogiscan server's actual REST API.

    Expected response shape:
      [
        {
          "panel_id":    "PCB-2024-001",
          "barcode":     "XYZ123456",          ← DataMatrix code
          "exit_time":   "2024-01-01T08:00:00Z",
          "unit_count":  9,
          "project":     "CD2_PRO",
          "units": [
            {"serial": "XYZ123456-01", "position": "U1"},
            ...
          ]
        }
      ]
    """
    params: Dict[str, Any] = {"status": "completed"}
    if since:
        params["since"] = since.isoformat()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{url.rstrip('/')}/api/v1/panels",
                headers={"X-Api-Key": api_key},
                params=params,
            )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("panels", [])
    except httpx.HTTPStatusError as exc:
        log.error("Cogiscan API error: %s — %s", exc.response.status_code, exc.response.text[:200])
        raise
    except Exception as exc:
        log.error("Cogiscan fetch error: %s", exc)
        raise


# ── Tray auto-creator ─────────────────────────────────────────────────────────

def auto_create_tray_from_panel(db: Session, panel: Dict[str, Any]) -> Optional[str]:
    """
    Record panel + individual unit SMT events.
    No tray created — SMT and QR flows are fully separate.
    """
    from models.integration import SmtUnitEvent

    panel_id   = panel.get("panel_id") or panel.get("id")
    barcode    = panel.get("barcode")  or panel.get("datamatrix_code")
    project_id = panel.get("project")
    unit_count = panel.get("unit_count", 1)
    units      = panel.get("units", [])  # [{"serial": "XYZ-01", "position": "U1"}, ...]

    existing = db.query(SmtEvent).filter(SmtEvent.panel_id == panel_id).first()
    if existing and existing.processed:
        log.debug("Panel %s already processed — skipping", panel_id)
        return None

    def _parse_dt(val):
        if not val:
            return None
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))

    smt_exit_at  = _parse_dt(panel.get("exit_time")  or panel.get("smt_exit_at"))
    smt_entry_at = _parse_dt(panel.get("entry_time") or panel.get("smt_entry_at"))

    try:
        # Panel-level record
        db.add(SmtEvent(
            panel_id             = panel_id,
            datamatrix_code      = barcode or "",
            smt_exit_at          = smt_exit_at,
            unit_count           = unit_count,
            project_id           = project_id,
            tray_id              = None,
            processed            = True,
            raw_cogiscan_payload = panel,
        ))

        # Unit-level records
        if units:
            # Cogiscan sent individual unit data
            for u in units:
                db.add(SmtUnitEvent(
                    panel_id     = panel_id,
                    unit_serial  = u.get("serial", ""),
                    position     = u.get("position"),
                    project_id   = project_id,
                    smt_entry_at = smt_entry_at,
                    smt_exit_at  = smt_exit_at,
                ))
        else:
            # Derive serials from barcode — e.g. XYZ123456-01 … XYZ123456-09
            for i in range(1, unit_count + 1):
                serial = f"{barcode}-{i:02d}" if barcode else f"{panel_id}-{i:02d}"
                db.add(SmtUnitEvent(
                    panel_id     = panel_id,
                    unit_serial  = serial,
                    position     = f"U{i}",
                    project_id   = project_id,
                    smt_entry_at = smt_entry_at,
                    smt_exit_at  = smt_exit_at,
                ))

        db.commit()
        log.info("Recorded panel %s — %d units", panel_id, unit_count)
        return panel_id

    except Exception as exc:
        db.rollback()
        log.error("Failed to record panel %s: %s", panel_id, exc)
        raise


# ── Full sync ─────────────────────────────────────────────────────────────────

async def run_sync(db: Session, config: IntegrationConfig) -> Dict[str, Any]:
    """
    Pull all new panels since last_sync and create tray records.
    Updates config.cogiscan_last_sync on success.
    Returns a dict matching CogiscanSyncResult schema.
    """
    panels_found   = 0
    panels_created = 0
    panels_skipped = 0
    errors: List[str] = []

    panels = await fetch_new_panels(
        url     = config.cogiscan_url,
        api_key = config.cogiscan_api_key,
        since   = config.cogiscan_last_sync,
    )
    panels_found = len(panels)

    for panel in panels:
        try:
            tray_id = auto_create_tray_from_panel(db, panel)
            if tray_id:
                panels_created += 1
            else:
                panels_skipped += 1
        except Exception as exc:
            panels_skipped += 1
            errors.append(f"Panel {panel.get('panel_id', '?')}: {exc}")

    # Update last sync timestamp
    config.cogiscan_last_sync = datetime.now(timezone.utc)
    db.commit()

    return {
        "panels_found":   panels_found,
        "panels_created": panels_created,
        "panels_skipped": panels_skipped,
        "errors":         errors,
    }