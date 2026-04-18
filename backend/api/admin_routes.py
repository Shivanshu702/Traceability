"""
api/admin_routes.py
───────────────────
Admin-only endpoints: pipeline config, user management,
role management, email settings.
"""
import json as _json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User, EmailSettings, RoleConfig
from core.auth import get_current_user, require_admin, hash_password, tenant
from core.cache import pipeline_cache, stats_cache, stage_load_cache
from services.audit_service import log_action
from services.pipeline_service import (
    get_pipeline_config, save_pipeline_config, build_default_config,
)
from services.email_service import get_email_settings, send_email

router = APIRouter(prefix="/admin", tags=["admin"])

# ── Pipeline config ───────────────────────────────────────────────────────────

@router.get("/pipeline-config")
def get_admin_pipeline_config(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return get_pipeline_config(db, tenant(user))


@router.put("/pipeline-config")
def update_pipeline_config(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid   = tenant(user)
    saved = save_pipeline_config(db, tid, payload)
    # Invalidate pipeline cache for this tenant
    pipeline_cache.delete(f"pipeline:{tid}")
    log_action(db, user["sub"], "UPDATE_PIPELINE_CONFIG", "", tid)
    db.commit()
    return {"ok": True, "config": saved}


@router.post("/pipeline-config/reset")
def reset_pipeline_config(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    from models import PipelineConfig
    tid = tenant(user)
    row = db.query(PipelineConfig).filter(PipelineConfig.tenant_id == tid).first()
    if row:
        db.delete(row); db.commit()
    pipeline_cache.delete(f"pipeline:{tid}")
    log_action(db, user["sub"], "RESET_PIPELINE_CONFIG", "", tid)
    db.commit()
    return {"ok": True, "config": build_default_config()}


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
def list_users(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.tenant_id == tenant(user)).all()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]


@router.post("/users")
def admin_create_user(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid  = tenant(user)
    name = (payload.get("username") or "").strip()
    pw   = payload.get("password") or ""
    role = (payload.get("role") or "operator").strip()
    if not name or not pw:
        raise HTTPException(400, "username and password required")
    if db.query(User).filter(User.tenant_id == tid, User.username == name).first():
        return {"error": "User already exists"}
    new_user = User(tenant_id=tid, username=name, password=hash_password(pw), role=role)
    db.add(new_user)
    log_action(db, user["sub"], "ADMIN_CREATE_USER", f"target={name} role={role}", tid)
    db.commit()
    return {"ok": True, "username": name, "role": role}


@router.put("/users/{target_username}/role")
def change_user_role(target_username: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid      = tenant(user)
    new_role = (payload.get("role") or "operator").strip()
    target   = db.query(User).filter(User.tenant_id == tid, User.username == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    target.role = new_role
    log_action(db, user["sub"], "CHANGE_ROLE", f"target={target_username} new_role={new_role}", tid)
    db.commit()
    return {"ok": True, "username": target_username, "role": new_role}


@router.put("/users/{target_username}/password")
def admin_reset_password(target_username: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid    = tenant(user)
    new_pw = payload.get("password") or ""
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    target = db.query(User).filter(User.tenant_id == tid, User.username == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    target.password = hash_password(new_pw)
    log_action(db, user["sub"], "RESET_PASSWORD", f"target={target_username}", tid)
    db.commit()
    return {"ok": True}


@router.delete("/users/{target_username}")
def delete_user(target_username: str, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    if target_username == user["sub"]:
        raise HTTPException(400, "Cannot delete yourself — ask another admin")
    target = db.query(User).filter(User.tenant_id == tid, User.username == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    db.delete(target)
    log_action(db, user["sub"], "DELETE_USER", target_username, tid)
    db.commit()
    return {"ok": True}


# ── Role config ───────────────────────────────────────────────────────────────

FEATURES = [
    {"key": "dashboard",       "label": "Dashboard"},
    {"key": "scan",            "label": "Scan Trays"},
    {"key": "history",         "label": "Scan History"},
    {"key": "create_trays",    "label": "Create Trays"},
    {"key": "manage_trays",    "label": "Manage / Delete Trays"},
    {"key": "alerts",          "label": "Alerts Dashboard"},
    {"key": "admin",           "label": "Admin Panel"},
    {"key": "export",          "label": "Export Data"},
    {"key": "audit_log",       "label": "Audit Log"},
    {"key": "pipeline_config", "label": "Pipeline Config"},
    {"key": "email_settings",  "label": "Email Settings"},
    {"key": "user_management", "label": "User Management"},
]


@router.get("/features")
def get_features(user: dict = Depends(require_admin)):
    return {"features": FEATURES}


@router.get("/roles")
def list_roles(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    roles = db.query(RoleConfig).filter(RoleConfig.tenant_id == tenant(user)).all()
    return [{"id": r.id, "name": r.name, "label": r.label, "permissions": _json.loads(r.permissions or "[]")} for r in roles]


@router.post("/roles")
def create_role(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid   = tenant(user)
    name  = (payload.get("name") or "").strip().lower().replace(" ", "_")
    label = (payload.get("label") or name).strip()
    perms = payload.get("permissions") or []
    if not name:
        raise HTTPException(400, "Role name required")
    if db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == name).first():
        return {"error": "Role already exists"}
    role = RoleConfig(tenant_id=tid, name=name, label=label, permissions=_json.dumps(perms))
    db.add(role)
    log_action(db, user["sub"], "CREATE_ROLE", f"name={name}", tid)
    db.commit()
    return {"ok": True, "name": name, "label": label, "permissions": perms}


@router.put("/roles/{role_name}")
def update_role(role_name: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid  = tenant(user)
    role = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role_name).first()
    if not role:
        raise HTTPException(404, "Role not found")
    role.label       = (payload.get("label") or role.label).strip()
    role.permissions = _json.dumps(payload.get("permissions") or [])
    role.updated_at  = datetime.utcnow()
    log_action(db, user["sub"], "UPDATE_ROLE", f"name={role_name}", tid)
    db.commit()
    return {"ok": True}


@router.delete("/roles/{role_name}")
def delete_role(role_name: str, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid  = tenant(user)
    role = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role_name).first()
    if not role:
        raise HTTPException(404, "Role not found")
    db.delete(role)
    log_action(db, user["sub"], "DELETE_ROLE", role_name, tid)
    db.commit()
    return {"ok": True}


# ── Email settings ────────────────────────────────────────────────────────────

@router.get("/email-settings")
def get_admin_email_settings(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    s = get_email_settings(db, tenant(user))
    return {
        "smtp_host":             s.smtp_host or "",
        "smtp_port":             s.smtp_port or 587,
        "smtp_user":             s.smtp_user or "",
        "smtp_use_tls":          s.smtp_use_tls,
        "from_email":            s.from_email or "",
        "alert_recipients":      s.alert_recipients or "",
        "stuck_alert_enabled":   s.stuck_alert_enabled,
        "stuck_hours":           s.stuck_hours or 1,
        "daily_summary_enabled": s.daily_summary_enabled,
        "daily_summary_hour":    s.daily_summary_hour or 8,
        "fifo_alert_enabled":    s.fifo_alert_enabled,
    }


@router.put("/email-settings")
def update_email_settings(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    row = db.query(EmailSettings).filter(EmailSettings.tenant_id == tid).first()
    if not row:
        row = EmailSettings(tenant_id=tid); db.add(row)
    row.smtp_host             = payload.get("smtp_host", row.smtp_host or "")
    row.smtp_port             = int(payload.get("smtp_port", row.smtp_port or 587))
    row.smtp_user             = payload.get("smtp_user", row.smtp_user or "")
    row.smtp_use_tls          = bool(payload.get("smtp_use_tls", True))
    row.from_email            = payload.get("from_email", row.from_email or "")
    row.alert_recipients      = payload.get("alert_recipients", row.alert_recipients or "")
    row.stuck_alert_enabled   = bool(payload.get("stuck_alert_enabled", False))
    row.stuck_hours           = int(payload.get("stuck_hours", 1))
    row.daily_summary_enabled = bool(payload.get("daily_summary_enabled", False))
    row.daily_summary_hour    = int(payload.get("daily_summary_hour", 8))
    row.fifo_alert_enabled    = bool(payload.get("fifo_alert_enabled", True))
    row.updated_at            = datetime.utcnow()
    if payload.get("smtp_password"):
        row.smtp_password = payload["smtp_password"]
    log_action(db, user["sub"], "UPDATE_EMAIL_SETTINGS", "", tid)
    db.commit()
    return {"ok": True}


@router.post("/test-email")
def test_email(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid        = tenant(user)
    settings   = get_email_settings(db, tid)
    recipients = [r.strip() for r in (settings.alert_recipients or "").split(",") if r.strip()]
    if not recipients:
        return {"ok": False, "error": "No alert recipients configured"}
    if not settings.smtp_host and not __import__("os").getenv("RESEND_API_KEY"):
        return {"ok": False, "error": "No email provider configured (no SMTP host or RESEND_API_KEY)"}
    ok = send_email(
        settings, recipients,
        "✅ Test Email — Traceability System",
        "<p>If you received this, your email settings are configured correctly.</p>",
    )
    return {"ok": ok, "sent_to": recipients}
