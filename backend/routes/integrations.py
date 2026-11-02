
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
  POST /api/integrations/webhook-secret  — generate/rotate this tenant's webhook secret
  POST /api/webhooks/cogiscan/{tenant}   — push endpoint for Cogiscan event forwarding

Register in main.py:
  from routes.integrations import router as integrations_router
  app.include_router(integrations_router)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from core.auth import admin_tenant           # admin guard that also yields the tenant id
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

def _get_or_create_config(db: Session, tid: str) -> IntegrationConfig:
    """Config row for ONE tenant; created with defaults if absent."""
    cfg = db.query(IntegrationConfig).filter(IntegrationConfig.tenant_id == tid).first()
    if not cfg:
        cfg = IntegrationConfig(tenant_id=tid)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


# ── Config CRUD ────────────────────────────────────────────────────────────────

@router.get("/api/integrations/config", response_model=IntegrationConfigOut)
def get_config(tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    return IntegrationConfigOut.from_cfg(_get_or_create_config(db, tid))


@router.post("/api/integrations/config", response_model=IntegrationConfigOut)
def save_config(body: IntegrationConfigIn, tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, tid)

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
    log.info("Integration config saved by admin (tenant=%s)", tid)
    return IntegrationConfigOut.from_cfg(cfg)


@router.post("/api/integrations/webhook-secret")
def rotate_webhook_secret(request: Request, tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    """Generate a new webhook secret for this tenant. The plaintext is returned ONCE;
    only its hash is stored. Configure it in Cogiscan as header `X-Webhook-Secret`."""
    cfg = _get_or_create_config(db, tid)
    secret = secrets.token_urlsafe(32)
    cfg.webhook_secret_hash = _hash_secret(secret)
    db.commit()
    log.info("Webhook secret rotated (tenant=%s)", tid)
    return {
        "secret":      secret,
        "webhook_url": f"{str(request.base_url).rstrip('/')}/api/webhooks/cogiscan/{cfg.tenant_id}",
    }


# ── Cogiscan ───────────────────────────────────────────────────────────────────

@router.post("/api/integrations/cogiscan/test", response_model=ConnectionTestResult)
async def test_cogiscan(tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, tid)
    return await cogiscan_svc.test_connection(cfg.cogiscan_url, cfg.cogiscan_api_key)


@router.post("/api/integrations/cogiscan/sync", response_model=CogiscanSyncResult)
async def sync_cogiscan(tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, tid)
    if not cfg.cogiscan_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cogiscan integration is not enabled.",
        )
    return await cogiscan_svc.run_sync(db, cfg)


# ── WATS ───────────────────────────────────────────────────────────────────────

@router.post("/api/integrations/wats/test", response_model=ConnectionTestResult)
async def test_wats(tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, tid)
    return await wats_svc.test_connection(cfg.wats_url, cfg.wats_api_key)


@router.post("/api/integrations/wats/sync", response_model=WatsSyncResult)
async def sync_wats(tid: str = Depends(admin_tenant), db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, tid)
    if not cfg.wats_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WATS integration is not enabled.",
        )
    return await wats_svc.run_sync(db, cfg)


# ── Cogiscan webhook (push mode) ───────────────────────────────────────────────

def _authorised(cfg: IntegrationConfig | None, provided: str) -> bool:
    """Per-tenant secret (hashed). The legacy global COGISCAN_WEBHOOK_SECRET is honoured
    ONLY for the "default" tenant, so one shared secret can never reach other tenants."""
    if cfg is None or not provided:
        return False
    if cfg.webhook_secret_hash and hmac.compare_digest(_hash_secret(provided), cfg.webhook_secret_hash):
        return True
    legacy = os.getenv("COGISCAN_WEBHOOK_SECRET", "")
    return bool(legacy) and cfg.tenant_id.lower() == "default" and hmac.compare_digest(provided.encode(), legacy.encode())


async def _handle_webhook(tenant_id: str, request: Request, db: Session) -> None:
    from sqlalchemy import func
    cfg = db.query(IntegrationConfig).filter(
        func.lower(IntegrationConfig.tenant_id) == tenant_id.strip().lower()
    ).first()

    # One generic 401 for "no such tenant" and "bad secret" — do not leak which tenants exist.
    if not _authorised(cfg, request.headers.get("X-Webhook-Secret", "")):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    if not cfg.cogiscan_enabled or not cfg.smt_auto_create:
        return          # integration disabled — acknowledge but do nothing

    try:
        panel = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Cogiscan sometimes sends a single panel or a list
    panels = panel if isinstance(panel, list) else [panel]

    for p in panels:
        try:
            cogiscan_svc.auto_create_tray_from_panel(db, p, cfg.tenant_id)
        except Exception as exc:
            log.error("Webhook: failed to process panel %s: %s", p.get("panel_id", "?"), exc)
            # Don't raise — acknowledge the webhook even on partial failures


@router.post("/api/webhooks/cogiscan/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cogiscan_webhook(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Push notification from Cogiscan when a panel exits the SMT line (per-tenant URL)."""
    await _handle_webhook(tenant_id, request, db)


@router.post("/api/webhooks/cogiscan", status_code=status.HTTP_204_NO_CONTENT)
async def cogiscan_webhook_legacy(request: Request, db: Session = Depends(get_db)):
    """Legacy URL without a tenant: maps to the "default" tenant (single-organisation setups)."""
    await _handle_webhook("default", request, db)
