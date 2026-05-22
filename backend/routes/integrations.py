# backend/routes/integrations.py
"""
FastAPI routes for the Cogiscan + WATS integration layer.

Endpoints:
  GET  /api/integrations/config          — fetch current config
  POST /api/integrations/config          — save config
  POST /api/integrations/cogiscan/test   — test Cogiscan connection
  POST /api/integrations/cogiscan/sync   — manual panel sync
  POST /api/integrations/wats/test       — test WATS connection
  POST /api/integrations/wats/sync       — manual result sync
  POST /api/webhooks/cogiscan            — push endpoint for Cogiscan event forwarding

Register in main.py:
  from routes.integrations import router as integrations_router
  app.include_router(integrations_router)
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from core.auth import require_admin          # reuse existing admin guard
from database import get_db
from models.integration import IntegrationConfig, SmtEvent
from schemas.integration import (
    CogiscanSyncResult,
    ConnectionTestResult,
    IntegrationConfigIn,
    IntegrationConfigOut,
    WatsSyncResult,
)
from services import cogiscan as cogiscan_svc
from services import wats as wats_svc

log    = logging.getLogger("routes.integrations")
router = APIRouter(tags=["integrations"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_or_create_config(db: Session) -> IntegrationConfig:
    """Always returns a config row, creating one with defaults if absent."""
    cfg = db.query(IntegrationConfig).filter(IntegrationConfig.id == 1).first()
    if not cfg:
        cfg = IntegrationConfig(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ── Config CRUD ────────────────────────────────────────────────────────────────

@router.get(
    "/api/integrations/config",
    response_model=IntegrationConfigOut,
    dependencies=[Depends(require_admin)],
)
def get_config(db: Session = Depends(get_db)):
    return _get_or_create_config(db)


@router.post(
    "/api/integrations/config",
    response_model=IntegrationConfigOut,
    dependencies=[Depends(require_admin)],
)
def save_config(body: IntegrationConfigIn, db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)

    # Never overwrite API keys with empty strings (user left the masked field alone)
    update = body.model_dump()
    if not update["cogiscan_api_key"]:
        update.pop("cogiscan_api_key")
    if not update["wats_api_key"]:
        update.pop("wats_api_key")

    for key, val in update.items():
        setattr(cfg, key, val)

    db.commit()
    db.refresh(cfg)
    log.info("Integration config saved by admin")
    return cfg


# ── Cogiscan ───────────────────────────────────────────────────────────────────

@router.post(
    "/api/integrations/cogiscan/test",
    response_model=ConnectionTestResult,
    dependencies=[Depends(require_admin)],
)
async def test_cogiscan(db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    result = await cogiscan_svc.test_connection(cfg.cogiscan_url, cfg.cogiscan_api_key)
    return result


@router.post(
    "/api/integrations/cogiscan/sync",
    response_model=CogiscanSyncResult,
    dependencies=[Depends(require_admin)],
)
async def sync_cogiscan(db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    if not cfg.cogiscan_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cogiscan integration is not enabled.",
        )
    result = await cogiscan_svc.run_sync(db, cfg)
    return result


# ── WATS ───────────────────────────────────────────────────────────────────────

@router.post(
    "/api/integrations/wats/test",
    response_model=ConnectionTestResult,
    dependencies=[Depends(require_admin)],
)
async def test_wats(db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    result = await wats_svc.test_connection(cfg.wats_url, cfg.wats_api_key)
    return result


@router.post(
    "/api/integrations/wats/sync",
    response_model=WatsSyncResult,
    dependencies=[Depends(require_admin)],
)
async def sync_wats(db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    if not cfg.wats_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WATS integration is not enabled.",
        )
    result = await wats_svc.run_sync(db, cfg)
    return result


# ── Cogiscan webhook (push mode) ───────────────────────────────────────────────

@router.post("/api/webhooks/cogiscan", status_code=status.HTTP_204_NO_CONTENT)
async def cogiscan_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receives a push notification from Cogiscan when a panel exits the SMT line.
    Cogiscan should be configured to POST the panel JSON to this URL.
    No auth required (Cogiscan uses shared-secret in body or header —
    add signature verification here if your Cogiscan server supports it).
    """
    cfg = _get_or_create_config(db)
    if not cfg.cogiscan_enabled or not cfg.smt_auto_create:
        # Integration disabled — acknowledge but do nothing
        return

    try:
        panel = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Cogiscan sometimes sends a single panel or a list
    panels = panel if isinstance(panel, list) else [panel]

    for p in panels:
        try:
            cogiscan_svc.auto_create_tray_from_panel(db, p)
        except Exception as exc:
            log.error("Webhook: failed to process panel %s: %s", p.get("panel_id", "?"), exc)
            # Don't raise — acknowledge the webhook even on partial failures