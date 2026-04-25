
import json as _json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, EmailSettings, RoleConfig
from schemas import PipelineConfigIn
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
def update_pipeline_config(
    payload: PipelineConfigIn,          # ← typed model replaces bare dict
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    """
    Persist a new pipeline configuration for the authenticated tenant.

    The payload is validated by PipelineConfigIn before this handler runs:
      • stages list must be non-empty and have unique IDs
      • split.atStage / split.resumeAtStage must reference defined stage IDs
      • branch.atStage must reference a defined stage ID
    A 422 is returned immediately if validation fails, with field-level detail.
    """
    tid  = tenant(user)
    # Convert the validated Pydantic model back to a plain dict for the service
    # layer (which expects the same JSON-serialisable shape it always has).
    config_dict = payload.model_dump(exclude_none=False)
    saved = save_pipeline_config(db, tid, config_dict)
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
    tid   = tenant(user)
    name  = (payload.get("username") or "").strip()
    pw    = payload.get("password") or ""
    role  = (payload.get("role") or "operator").strip()
    email = (payload.get("email") or "").strip() or None

    if not name or not pw:
        raise HTTPException(400, "username and password required")
    if db.query(User).filter(User.tenant_id == tid, User.username == name).first():
        raise HTTPException(409, "User already exists")

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
        {"key": "scan",         "label": "Scan trays"},
        {"key": "create_trays", "label": "Create trays"},
        {"key": "history",      "label": "View history"},
        {"key": "dashboard",    "label": "Dashboard"},
        {"key": "alerts",       "label": "Alerts dashboard"},
        {"key": "export",       "label": "Export data"},
    ]
    return {"features": features}


@router.get("/roles")
def list_roles(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(RoleConfig).filter(RoleConfig.tenant_id == tenant(user)).all()
    return [{"name": r.name, "features": _json.loads(r.features or "[]")} for r in rows]


@router.post("/roles")
def create_role(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid      = tenant(user)
    name     = (payload.get("name") or "").strip()
    features = payload.get("features", [])
    if not name:
        raise HTTPException(400, "name required")
    if db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == name).first():
        raise HTTPException(409, "Role already exists")
    row = RoleConfig(tenant_id=tid, name=name, features=_json.dumps(features))
    db.add(row)
    log_action(db, user["sub"], "CREATE_ROLE", f"role={name}", tid)
    db.commit()
    return {"ok": True, "name": name}


@router.put("/roles/{role_name}")
def update_role(role_name: str, payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid  = tenant(user)
    row  = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role_name).first()
    if not row:
        raise HTTPException(404, "Role not found")
    if "features" in payload:
        row.features = _json.dumps(payload["features"])
    log_action(db, user["sub"], "UPDATE_ROLE", f"role={role_name}", tid)
    db.commit()
    return {"ok": True}


@router.delete("/roles/{role_name}")
def delete_role(role_name: str, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    row = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role_name).first()
    if not row:
        raise HTTPException(404, "Role not found")
    db.delete(row)
    log_action(db, user["sub"], "DELETE_ROLE", f"role={role_name}", tid)
    db.commit()
    return {"ok": True}


# ── Email settings ────────────────────────────────────────────────────────────

@router.get("/email-settings")
def get_email_settings_route(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return get_email_settings(db, tenant(user))


@router.put("/email-settings")
def save_email_settings_route(payload: dict, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid = tenant(user)
    row = db.query(EmailSettings).filter(EmailSettings.tenant_id == tid).first()
    if not row:
        row = EmailSettings(tenant_id=tid)
        db.add(row)
    for field in ("api_key", "from_email", "from_name", "alert_emails",
                  "daily_summary_hour", "send_stuck_alerts", "send_daily_summary"):
        if field in payload:
            setattr(row, field, payload[field])
    log_action(db, user["sub"], "UPDATE_EMAIL_SETTINGS", "", tid)
    db.commit()
    return {"ok": True}


@router.post("/test-email")
def send_test_email(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    tid      = tenant(user)
    settings = get_email_settings(db, tid)
    try:
        send_email(settings, settings.get("alert_emails", []),
                   "Traceability – test email", "<p>Test email sent successfully.</p>")
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(500, str(exc))