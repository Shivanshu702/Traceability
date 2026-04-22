"""
api/admin_routes.py
───────────────────
Admin-only endpoints: pipeline config, user management, role management, email settings.
Added: PUT /admin/users/{username}/email so admins can set the reset email per user.
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
    return [
        {"id": u.id, "username": u.username, "role": u.role, "email": u.email or ""}
        for u in users
    ]


@router.post("/users")
def admin_create_user(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid  = tenant(user)
    name = (payload.get("username") or "").strip()
    pw   = payload.get("password") or ""
    role = (payload.get("role") or "operator").strip()
    email = (payload.get("email") or "").strip() or None

    if not name or not pw:
        raise HTTPException(400, "username and password required")
    if db.query(User).filter(User.tenant_id == tid, User.username == name).first():
        return {"error": "User already exists"}

    new_user = User(tenant_id=tid, username=name, password=hash_password(pw), role=role, email=email)
    db.add(new_user)
    log_action(db, user["sub"], "ADMIN_CREATE_USER", f"target={name} role={role}", tid)
    db.commit()
    return {"ok": True, "username": name, "role": role, "email": email or ""}


@router.put("/users/{target_username}/role")
def change_user_role(target_username: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid      = tenant(user)
    new_role = (payload.get("role") or "operator").strip()
    target   = db.query(User).filter(User.tenant_id == tid, User.username == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    target.role = new_role
    log_action(db, user["sub"], "CHANGE_USER_ROLE", f"target={target_username} role={new_role}", tid)
    db.commit()
    return {"ok": True}


@router.put("/users/{target_username}/email")
def set_user_email(target_username: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    """
    Set or update the email address for a user.
    This is the address that password reset links are sent to,
    so it works even when usernames are not email addresses.
    """
    tid    = tenant(user)
    email  = (payload.get("email") or "").strip() or None
    target = db.query(User).filter(User.tenant_id == tid, User.username == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    target.email = email
    log_action(db, user["sub"], "SET_USER_EMAIL", f"target={target_username}", tid)
    db.commit()
    return {"ok": True, "email": email or ""}


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
    log_action(db, user["sub"], "ADMIN_RESET_PASSWORD", f"target={target_username}", tid)
    db.commit()
    return {"ok": True}


@router.delete("/users/{target_username}")
def delete_user(target_username: str, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid    = tenant(user)
    target = db.query(User).filter(User.tenant_id == tid, User.username == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    db.delete(target)
    log_action(db, user["sub"], "DELETE_USER", f"target={target_username}", tid)
    db.commit()
    return {"ok": True}


# ── Role config ───────────────────────────────────────────────────────────────

@router.get("/features")
def get_features(user: dict = Depends(require_admin)):
    features = [
        {"key": "scan",          "label": "Scan trays"},
        {"key": "create_trays",  "label": "Create trays"},
        {"key": "history",       "label": "View history"},
        {"key": "dashboard",     "label": "Dashboard"},
        {"key": "alerts",        "label": "Alerts & analytics"},
        {"key": "manage_trays",  "label": "Manage & delete trays"},
        {"key": "export",        "label": "Export data"},
        {"key": "admin",         "label": "Admin panel"},
    ]
    return {"features": features}


@router.get("/roles")
def list_roles(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(RoleConfig).filter(RoleConfig.tenant_id == tenant(user)).all()
    return [
        {"name": r.name, "label": r.label, "permissions": _json.loads(r.permissions or "[]")}
        for r in rows
    ]


@router.post("/roles")
def create_role(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid  = tenant(user)
    name = (payload.get("name") or "").strip().lower().replace(" ", "_")
    if not name:
        raise HTTPException(400, "name required")
    if db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == name).first():
        return {"error": "Role already exists"}
    row = RoleConfig(
        tenant_id   = tid,
        name        = name,
        label       = payload.get("label") or name,
        permissions = _json.dumps(payload.get("permissions") or []),
    )
    db.add(row)
    log_action(db, user["sub"], "CREATE_ROLE", name, tid)
    db.commit()
    return {"ok": True, "name": name}


@router.put("/roles/{role_name}")
def update_role(role_name: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    row = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role_name).first()
    if not row:
        raise HTTPException(404, "Role not found")
    if "label" in payload:
        row.label = payload["label"]
    if "permissions" in payload:
        row.permissions = _json.dumps(payload["permissions"])
    row.updated_at = datetime.utcnow()
    log_action(db, user["sub"], "UPDATE_ROLE", role_name, tid)
    db.commit()
    return {"ok": True}


@router.delete("/roles/{role_name}")
def delete_role(role_name: str, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    row = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role_name).first()
    if not row:
        raise HTTPException(404, "Role not found")
    db.delete(row)
    log_action(db, user["sub"], "DELETE_ROLE", role_name, tid)
    db.commit()
    return {"ok": True}


# ── Email settings ────────────────────────────────────────────────────────────

@router.get("/email-settings")
def get_email_settings_route(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    s = get_email_settings(db, tenant(user))
    return {
        "smtp_host":             s.smtp_host,
        "smtp_port":             s.smtp_port,
        "smtp_user":             s.smtp_user,
        "smtp_password":         "",   # never expose stored password
        "smtp_use_tls":          s.smtp_use_tls,
        "from_email":            s.from_email,
        "alert_recipients":      s.alert_recipients,
        "stuck_alert_enabled":   s.stuck_alert_enabled,
        "stuck_hours":           s.stuck_hours,
        "daily_summary_enabled": s.daily_summary_enabled,
        "daily_summary_hour":    s.daily_summary_hour,
        "fifo_alert_enabled":    s.fifo_alert_enabled,
    }


@router.put("/email-settings")
def save_email_settings_route(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    row = db.query(EmailSettings).filter(EmailSettings.tenant_id == tid).first()
    if not row:
        row = EmailSettings(tenant_id=tid)
        db.add(row)

    for field in ["smtp_host","smtp_port","smtp_use_tls","smtp_user","from_email",
                  "alert_recipients","stuck_alert_enabled","stuck_hours",
                  "daily_summary_enabled","daily_summary_hour","fifo_alert_enabled"]:
        if field in payload:
            setattr(row, field, payload[field])

    # Only update password if explicitly provided (non-empty)
    if payload.get("smtp_password"):
        row.smtp_password = payload["smtp_password"]

    row.updated_at = datetime.utcnow()
    log_action(db, user["sub"], "UPDATE_EMAIL_SETTINGS", "", tid)
    db.commit()
    return {"ok": True}


@router.post("/test-email")
def send_test_email(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid      = tenant(user)
    settings = get_email_settings(db, tid)
    recipients = [r.strip() for r in (settings.alert_recipients or "").split(",") if r.strip()]
    if not recipients:
        return {"error": "No alert recipients configured"}
    ok = send_email(
        settings, recipients,
        "Traceability — Test Email",
        "<p>This is a test email from the Traceability System. If you received this, email alerts are working correctly.</p>",
    )
    return {"ok": ok, "sent_to": recipients}