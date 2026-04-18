"""
routes_with_qr.py
─────────────────
All API routes. Key changes vs original:
  • Every query is scoped to the authenticated user's tenant_id
  • /scan and /scan/bulk use SELECT FOR UPDATE for row-level locking
  • Dynamic pipeline config loaded from DB per tenant
  • scan_note returned in every scan response
  • FIFO email alert fired on violation
  • Admin routes: pipeline config CRUD, email settings, user management
  • Export routes: CSV (trays, scan log) and XLSX report
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, ScanEvent, User, AuditLog, EmailSettings
from services.tray_service import advance_tray, _tray_dict
from services.audit_service import log_action
from services.analytics_service import detect_bottlenecks, stage_load, get_analytics
from services.pipeline_service import (
    get_pipeline_config, save_pipeline_config, build_default_config,
    get_units_for_project_cfg,
)
from services.qr_service import generate_qr_base64, generate_qr_bytes
from services.email_service import (
    get_email_settings, send_fifo_alert, send_email,
)
from services.export_service import (
    export_trays_csv, export_scan_log_csv, export_report_xlsx,
)
from core.stages import STAGES, STAGE_COLORS, PROJECTS, BRANCH_OPTIONS
from datetime import datetime, timedelta, date
from jose import jwt, JWTError
from typing import Optional
import bcrypt
import os
import uuid

router     = APIRouter()
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-in-production")
ALGORITHM  = "HS256"
TOKEN_TTL  = int(os.getenv("TOKEN_TTL_MINUTES", "60"))
security   = HTTPBearer()

# ── When True anyone can call /register; set False in production ──────────────
OPEN_REGISTRATION = os.getenv("OPEN_REGISTRATION", "true").lower() != "false"


# ── Auth helpers ──────────────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw[:72].encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain[:72].encode(), hashed.encode())


def create_token(user: User) -> str:
    payload = {
        "sub":       user.username,
        "role":      user.role,
        "tenant_id": user.tenant_id,
        "exp":       datetime.utcnow() + timedelta(minutes=TOKEN_TTL),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def tenant(user: dict) -> str:
    """Extract tenant_id from a decoded JWT payload."""
    return user.get("tenant_id") or "default"


# ── Auth routes ───────────────────────────────────────────────────────────────

@router.post("/register")
def register(payload: dict, db: Session = Depends(get_db)):
    name      = (payload.get("username") or "").strip()
    pw        = payload.get("password") or ""
    tenant_id = (payload.get("tenant_id") or "default").strip()

    if not name or not pw:
        raise HTTPException(400, "username and password required")

    # Check uniqueness within the tenant
    existing = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == name
    ).first()
    if existing:
        return {"error": "User already exists in this organisation"}

    if not OPEN_REGISTRATION:
        raise HTTPException(403, "Open registration is disabled. Contact your admin.")

    # First user in a tenant becomes admin automatically
    tenant_has_users = db.query(User).filter(User.tenant_id == tenant_id).first()
    role = "admin" if not tenant_has_users else payload.get("role", "operator")

    user = User(
        tenant_id = tenant_id,
        username  = name,
        password  = hash_password(pw),
        role      = role,
    )
    db.add(user)
    log_action(db, name, "REGISTER", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"message": "User created", "role": user.role, "tenant_id": tenant_id}


@router.post("/login")
def login(payload: dict, db: Session = Depends(get_db)):
    name      = (payload.get("username") or "").strip()
    tenant_id = (payload.get("tenant_id") or "default").strip()

    user = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == name
    ).first()

    if not user or not verify_password(payload.get("password", ""), user.password):
        return {"error": "Invalid credentials"}

    token = create_token(user)
    log_action(db, name, "LOGIN", "", tenant_id)
    db.commit()
    return {
        "access_token": token,
        "role":         user.role,
        "username":     user.username,
        "tenant_id":    user.tenant_id,
    }


# ── Pipeline config ───────────────────────────────────────────────────────────

@router.get("/pipeline")
def get_pipeline(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = get_pipeline_config(db, tenant(user))
    return {
        "stages":         cfg.get("stages", []),
        "stage_colors":   {s["id"]: s.get("color", "#888780") for s in cfg.get("stages", [])},
        "branch_options": cfg.get("branch", {}).get("options", []),
        "projects":       cfg.get("projects", []),
        "split":          cfg.get("split", {}),
        "branch":         cfg.get("branch", {}),
    }


@router.get("/admin/pipeline-config")
def get_admin_pipeline_config(
    user: dict = Depends(require_admin), db: Session = Depends(get_db)
):
    return get_pipeline_config(db, tenant(user))


@router.put("/admin/pipeline-config")
def update_pipeline_config(
    payload: dict,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    saved = save_pipeline_config(db, tenant(user), payload)
    log_action(db, user["sub"], "UPDATE_PIPELINE_CONFIG", "", tenant(user))
    db.commit()
    return {"ok": True, "config": saved}


@router.post("/admin/pipeline-config/reset")
def reset_pipeline_config(
    user: dict = Depends(require_admin), db: Session = Depends(get_db)
):
    """Restore the hardcoded default pipeline for this tenant."""
    from models import PipelineConfig
    row = db.query(PipelineConfig).filter(
        PipelineConfig.tenant_id == tenant(user)
    ).first()
    if row:
        db.delete(row)
        db.commit()
    log_action(db, user["sub"], "RESET_PIPELINE_CONFIG", "", tenant(user))
    db.commit()
    return {"ok": True, "config": build_default_config()}


# ── Tray CRUD ─────────────────────────────────────────────────────────────────

@router.get("/trays")
def get_all_trays(
    stage:   Optional[str] = None,
    project: Optional[str] = None,
    user:    dict          = Depends(get_current_user),
    db:      Session       = Depends(get_db),
):
    tid = tenant(user)
    q   = db.query(Tray).filter(Tray.tenant_id == tid)
    if stage:   q = q.filter(Tray.stage   == stage)
    if project: q = q.filter(Tray.project == project)
    return [_tray_dict(t) for t in q.order_by(Tray.created_at.desc()).all()]


@router.post("/trays/create")
def create_trays(
    payload: dict,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid     = tenant(user)
    cfg     = get_pipeline_config(db, tid)
    created = []

    for t in payload.get("trays", []):
        tray_id = str(t.get("id", "")).strip().upper()
        if not tray_id:
            continue
        if db.query(Tray).filter(
            Tray.tenant_id == tid, Tray.id == tray_id
        ).first():
            continue

        units = t.get("total_units") or get_units_for_project_cfg(
            t.get("project", ""), cfg
        )
        now  = datetime.utcnow()
        tray = Tray(
            id         = tray_id,
            tenant_id  = tid,
            stage      = "CREATED",
            project    = t.get("project", ""),
            shift      = t.get("shift", ""),
            created_by = t.get("created_by", user["sub"]),
            batch_no   = t.get("batch_no", ""),
            total_units= units,
            created_at = now,
            last_updated = now,
        )
        db.add(tray)
        created.append({**_tray_dict(tray), "qr_base64": generate_qr_base64(tray_id)})

    db.commit()
    log_action(db, user["sub"], "CREATE_TRAYS", f"count={len(created)}", tid)
    db.commit()
    return {"ok": True, "count": len(created), "trays": created}


@router.get("/tray/{tray_id}")
def get_tray(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, f"Tray not found: {tray_id}")
    return _tray_dict(tray)


@router.get("/tray/{tray_id}/qr")
def get_tray_qr(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, "Tray not found")
    return Response(content=generate_qr_bytes(tray.id), media_type="image/png")


@router.get("/tray/{tray_id}/qr/base64")
def get_tray_qr_b64(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, "Tray not found")
    return {"tray_id": tray.id, "qr_base64": generate_qr_base64(tray.id)}


@router.delete("/tray/{tray_id}")
def delete_tray(
    tray_id: str,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, "Tray not found")
    db.delete(tray)
    log_action(db, user["sub"], "DELETE_TRAY", tray_id, tid)
    db.commit()
    return {"ok": True}


@router.post("/trays/bulk-delete")
def bulk_delete_trays(
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    """
    Bulk delete trays by ID list. Admin only.
    Also deletes associated scan events for each tray.
    payload: { "ids": ["TRY-001", "TRY-002", ...] }
    """
    tid     = tenant(user)
    ids     = [str(i).strip().upper() for i in payload.get("ids", [])]
    deleted = []
    not_found = []

    for tray_id in ids:
        tray = db.query(Tray).filter(
            Tray.tenant_id == tid, Tray.id == tray_id
        ).first()
        if not tray:
            not_found.append(tray_id)
            continue
        # Also remove all scan events for this tray
        db.query(ScanEvent).filter(
            ScanEvent.tenant_id == tid, ScanEvent.tray_id == tray_id
        ).delete(synchronize_session=False)
        db.delete(tray)
        deleted.append(tray_id)

    if deleted:
        log_action(
            db, user["sub"], "BULK_DELETE_TRAYS",
            f"count={len(deleted)} ids={','.join(deleted[:10])}",
            tid,
        )
    db.commit()
    return {
        "ok":        True,
        "deleted":   len(deleted),
        "not_found": len(not_found),
        "ids":       deleted,
    }


# ── Scan ──────────────────────────────────────────────────────────────────────

@router.post("/scan")
def scan(
    payload: dict,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid     = tenant(user)
    tray_id = str(payload.get("id", "")).strip().upper()
    cfg     = get_pipeline_config(db, tid)

    # SELECT FOR UPDATE — row-level lock prevents concurrent scan races
    try:
        tray = (
            db.query(Tray)
            .filter(Tray.tenant_id == tid, Tray.id == tray_id)
            .with_for_update()
            .first()
        )
    except Exception:
        # SQLite doesn't support FOR UPDATE — fall back gracefully
        tray = db.query(Tray).filter(
            Tray.tenant_id == tid, Tray.id == tray_id
        ).first()

    if not tray:
        return {"error": f"Tray not found: {tray_id}"}

    result = advance_tray(
        db, tray,
        operator             = user["sub"],
        next_stage_override  = payload.get("next_stage_override"),
        config               = cfg,
    )

    if result.get("ok"):
        log_action(db, user["sub"], "SCAN", f"{tray_id}:{tray.stage}", tid)
        # Fire FIFO email alert asynchronously (best-effort)
        if result.get("fifo_vio") and result.get("older_trays"):
            try:
                send_fifo_alert(
                    db, tray_id, result.get("to_stage", ""),
                    user["sub"], result["older_trays"], tid,
                )
            except Exception:
                pass

    db.commit()
    return result


@router.post("/scan/bulk")
def bulk_scan(
    payload: dict,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid     = tenant(user)
    cfg     = get_pipeline_config(db, tid)
    results = []

    for raw_id in payload.get("ids", []):
        tray_id = str(raw_id).strip().upper()

        try:
            tray = (
                db.query(Tray)
                .filter(Tray.tenant_id == tid, Tray.id == tray_id)
                .with_for_update()
                .first()
            )
        except Exception:
            tray = db.query(Tray).filter(
                Tray.tenant_id == tid, Tray.id == tray_id
            ).first()

        if not tray:
            results.append({"id": tray_id, "error": "Not found"})
            continue

        r = advance_tray(
            db, tray,
            operator            = user["sub"],
            next_stage_override = payload.get("next_stage_override"),
            config              = cfg,
        )
        db.commit()
        results.append(r)

    ok_n = sum(1 for r in results if r.get("ok"))
    return {
        "ok":      True,
        "total":   len(results),
        "success": ok_n,
        "failed":  len(results) - ok_n,
        "results": results,
    }


# ── History & logs ────────────────────────────────────────────────────────────

@router.get("/history/{tray_id}")
def get_history(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid    = tenant(user)
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tid, ScanEvent.tray_id == tray_id.strip().upper())
        .order_by(ScanEvent.timestamp.asc())
        .all()
    )
    return [_event_dict(e) for e in events]


@router.get("/scan-log")
def get_scan_log(
    limit: int       = 200,
    user:  dict      = Depends(get_current_user),
    db:    Session   = Depends(get_db),
):
    tid    = tenant(user)
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tid)
        .order_by(ScanEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [_event_dict(e) for e in events]


# ── Stats / alerts / analytics ────────────────────────────────────────────────

@router.get("/stats")
def get_stats(
    project: Optional[str] = Query(None),
    user:    dict          = Depends(get_current_user),
    db:      Session       = Depends(get_db),
):
    tid = tenant(user)
    q   = db.query(Tray).filter(Tray.tenant_id == tid, Tray.stage != "SPLIT")
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

    total_active_units   = sum(t.total_units or 0 for t in all_trays if t.stage != "COMPLETE")
    total_complete_units = sum(t.total_units or 0 for t in all_trays if t.stage == "COMPLETE")

    return {
        "total_active":         sum(1 for t in all_trays if t.stage != "COMPLETE"),
        "total_complete":       sum(1 for t in all_trays if t.stage == "COMPLETE"),
        "total_active_units":   total_active_units,
        "total_complete_units": total_complete_units,
        "fifo_violated":        sum(1 for t in all_trays if t.fifo_violated),
        "completed_today":      sum(
            1 for t in all_trays
            if t.stage == "COMPLETE"
            and t.completed_at
            and t.completed_at.date() == today
        ),
        "completed_today_units": sum(
            t.total_units or 0 for t in all_trays
            if t.stage == "COMPLETE"
            and t.completed_at
            and t.completed_at.date() == today
        ),
        "stuck_count":  len(detect_bottlenecks(db, tid)),
        "stage_counts": stage_counts,
        "stage_units":  stage_units,
    }


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
    return stage_load(db, tenant(user))


@router.get("/analytics")
def analytics(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    return get_analytics(db, tenant(user))


# ── Audit log ─────────────────────────────────────────────────────────────────

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


# ── User management (admin) ───────────────────────────────────────────────────

@router.get("/admin/users")
def list_users(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    tid   = tenant(user)
    users = db.query(User).filter(User.tenant_id == tid).all()
    return [
        {"id": u.id, "username": u.username, "role": u.role}
        for u in users
    ]


@router.post("/admin/users")
def admin_create_user(
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    """Admin creates a user in the same tenant. Role can be any string."""
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


@router.put("/admin/users/{target_username}/role")
def change_user_role(
    target_username: str,
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    """Change any user's role. Role can be any custom string."""
    tid      = tenant(user)
    new_role = (payload.get("role") or "operator").strip()
    if not new_role:
        raise HTTPException(400, "role cannot be empty")

    target = db.query(User).filter(
        User.tenant_id == tid, User.username == target_username
    ).first()
    if not target:
        raise HTTPException(404, "User not found")

    target.role = new_role
    log_action(db, user["sub"], "CHANGE_ROLE",
               f"target={target_username} new_role={new_role}", tid)
    db.commit()
    return {"ok": True, "username": target_username, "role": new_role}


@router.put("/admin/users/{target_username}/password")
def admin_reset_password(
    target_username: str,
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    """Admin resets any user's password (including their own)."""
    tid     = tenant(user)
    new_pw  = payload.get("password") or ""
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    target = db.query(User).filter(
        User.tenant_id == tid, User.username == target_username
    ).first()
    if not target:
        raise HTTPException(404, "User not found")

    target.password = hash_password(new_pw)
    log_action(db, user["sub"], "RESET_PASSWORD", f"target={target_username}", tid)
    db.commit()
    return {"ok": True}


@router.delete("/admin/users/{target_username}")
def delete_user(
    target_username: str,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    """Delete any user including admins. Cannot delete yourself."""
    tid = tenant(user)
    if target_username == user["sub"]:
        raise HTTPException(400, "Cannot delete yourself — ask another admin")

    target = db.query(User).filter(
        User.tenant_id == tid, User.username == target_username
    ).first()
    if not target:
        raise HTTPException(404, "User not found")

    db.delete(target)
    log_action(db, user["sub"], "DELETE_USER", target_username, tid)
    db.commit()
    return {"ok": True}


# ── Role config (admin) ───────────────────────────────────────────────────────

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


@router.get("/admin/features")
def get_features(user: dict = Depends(require_admin)):
    return {"features": FEATURES}


@router.get("/admin/roles")
def list_roles(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    import json as _json
    from models import RoleConfig
    tid   = tenant(user)
    roles = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid).all()
    return [
        {
            "id":          r.id,
            "name":        r.name,
            "label":       r.label,
            "permissions": _json.loads(r.permissions or "[]"),
        }
        for r in roles
    ]


@router.post("/admin/roles")
def create_role(
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    import json as _json
    from models import RoleConfig
    tid   = tenant(user)
    name  = (payload.get("name") or "").strip().lower().replace(" ", "_")
    label = (payload.get("label") or name).strip()
    perms = payload.get("permissions") or []

    if not name:
        raise HTTPException(400, "Role name required")

    existing = db.query(RoleConfig).filter(
        RoleConfig.tenant_id == tid, RoleConfig.name == name
    ).first()
    if existing:
        return {"error": "Role already exists"}

    role = RoleConfig(
        tenant_id   = tid,
        name        = name,
        label       = label,
        permissions = _json.dumps(perms),
    )
    db.add(role)
    log_action(db, user["sub"], "CREATE_ROLE", f"name={name}", tid)
    db.commit()
    return {"ok": True, "name": name, "label": label, "permissions": perms}


@router.put("/admin/roles/{role_name}")
def update_role(
    role_name: str,
    payload:   dict,
    user:      dict    = Depends(require_admin),
    db:        Session = Depends(get_db),
):
    import json as _json
    from models import RoleConfig
    tid  = tenant(user)
    role = db.query(RoleConfig).filter(
        RoleConfig.tenant_id == tid, RoleConfig.name == role_name
    ).first()
    if not role:
        raise HTTPException(404, "Role not found")

    role.label       = (payload.get("label") or role.label).strip()
    role.permissions = _json.dumps(payload.get("permissions") or [])
    role.updated_at  = datetime.utcnow()
    log_action(db, user["sub"], "UPDATE_ROLE", f"name={role_name}", tid)
    db.commit()
    return {"ok": True}


@router.delete("/admin/roles/{role_name}")
def delete_role(
    role_name: str,
    user:      dict    = Depends(require_admin),
    db:        Session = Depends(get_db),
):
    from models import RoleConfig
    tid  = tenant(user)
    role = db.query(RoleConfig).filter(
        RoleConfig.tenant_id == tid, RoleConfig.name == role_name
    ).first()
    if not role:
        raise HTTPException(404, "Role not found")
    db.delete(role)
    log_action(db, user["sub"], "DELETE_ROLE", role_name, tid)
    db.commit()
    return {"ok": True}


# ── Email settings (admin) ────────────────────────────────────────────────────

@router.get("/admin/email-settings")
def get_admin_email_settings(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
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


@router.put("/admin/email-settings")
def update_email_settings(
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    tid = tenant(user)
    row = db.query(EmailSettings).filter(EmailSettings.tenant_id == tid).first()

    if not row:
        row = EmailSettings(tenant_id=tid)
        db.add(row)

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

    if payload.get("smtp_password"):          # only overwrite if provided
        row.smtp_password = payload["smtp_password"]

    log_action(db, user["sub"], "UPDATE_EMAIL_SETTINGS", "", tid)
    db.commit()
    return {"ok": True}


@router.post("/admin/test-email")
def test_email(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    """Send a test email to verify SMTP config."""
    tid      = tenant(user)
    settings = get_email_settings(db, tid)
    recipients = [r.strip() for r in (settings.alert_recipients or "").split(",") if r.strip()]

    if not recipients:
        return {"ok": False, "error": "No alert recipients configured"}
    if not settings.smtp_host:
        return {"ok": False, "error": "SMTP host not configured"}

    ok = send_email(
        settings, recipients,
        "✅ Test Email — Traceability System",
        "<p>If you received this, your email settings are configured correctly.</p>",
    )
    return {"ok": ok, "sent_to": recipients}


# ── Export routes ─────────────────────────────────────────────────────────────

@router.get("/export/trays")
def export_trays(
    stage:      Optional[str] = Query(None),
    project:    Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),   # ISO date string: 2026-01-01
    end_date:   Optional[str] = Query(None),
    user:       dict          = Depends(get_current_user),
    db:         Session       = Depends(get_db),
):
    sd = datetime.fromisoformat(start_date) if start_date else None
    ed = datetime.fromisoformat(end_date)   if end_date   else None

    csv_bytes = export_trays_csv(db, tenant(user), stage, project, sd, ed)
    filename  = f"trays_{date.today().isoformat()}.csv"
    return Response(
        content      = csv_bytes,
        media_type   = "text/csv",
        headers      = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/scan-log")
def export_scan_log(
    limit: int   = Query(50_000),
    user:  dict  = Depends(get_current_user),
    db:    Session = Depends(get_db),
):
    csv_bytes = export_scan_log_csv(db, tenant(user), limit)
    filename  = f"scan_log_{date.today().isoformat()}.csv"
    return Response(
        content      = csv_bytes,
        media_type   = "text/csv",
        headers      = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/report")
def export_report(
    user: dict    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    xlsx_bytes = export_report_xlsx(db, tenant(user))
    filename   = f"production_report_{date.today().isoformat()}.xlsx"
    return Response(
        content    = xlsx_bytes,
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _event_dict(e: ScanEvent) -> dict:
    return {
        "id":         e.id,
        "tray_id":    e.tray_id,
        "from_stage": e.from_stage,
        "stage":      e.stage,
        "operator":   e.operator,
        "fifo_flag":  e.fifo_flag,
        "note":       e.note,
        "timestamp":  e.timestamp.isoformat() if e.timestamp else None,
    }


# ── Forgot password (public — no auth required) ────────────────────────────────
# Uses ADMIN_RESET_KEY env var as a shared secret.
# Set this in Render environment:  ADMIN_RESET_KEY=some-long-random-string
# The admin enters this key on the login page to prove identity, then sets a new password.

@router.post("/forgot-password")
def forgot_password(payload: dict, db: Session = Depends(get_db)):
    """
    Allow a user to reset their password using the ADMIN_RESET_KEY.
    This is the self-service recovery flow accessible from the login page.
    No email required — the reset key acts as the second factor.
    """
    reset_key = os.getenv("ADMIN_RESET_KEY", "")
    if not reset_key:
        return {"error": "Password reset is not configured on this server. Contact the developer."}

    provided_key = (payload.get("reset_key") or "").strip()
    if not provided_key or provided_key != reset_key:
        return {"error": "Invalid reset key. Contact your system administrator."}

    username  = (payload.get("username") or "").strip()
    tenant_id = (payload.get("tenant_id") or "default").strip()
    new_pw    = payload.get("new_password") or ""

    if not username:
        return {"error": "Username is required."}
    if len(new_pw) < 6:
        return {"error": "New password must be at least 6 characters."}

    user = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == username
    ).first()

    if not user:
        # Don't reveal whether user exists — return same message
        return {"error": "Invalid username or organisation ID."}

    user.password = hash_password(new_pw)
    log_action(db, username, "FORGOT_PASSWORD_RESET", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"ok": True, "message": "Password updated. You can now log in."}


# ── Developer panel (protected by DEV_KEY header) ─────────────────────────────
# Set  DEV_KEY=your-secret-dev-key  in Render environment.
# Frontend passes it as:  X-Dev-Key: your-secret-dev-key

def require_dev_key(x_dev_key: str = None):
    from fastapi import Header
    return x_dev_key


@router.get("/dev/users")
def dev_list_users(
    x_dev_key: str = None,
    db: Session = Depends(get_db),
):
    """List ALL users across ALL tenants. Requires DEV_KEY header."""
    dev_key = os.getenv("DEV_KEY", "")
    if not dev_key or x_dev_key != dev_key:
        raise HTTPException(403, "Invalid or missing developer key")

    users = db.query(User).order_by(User.tenant_id, User.username).all()
    return [
        {"id": u.id, "tenant_id": u.tenant_id, "username": u.username, "role": u.role}
        for u in users
    ]


@router.put("/dev/users/{user_id}/role")
def dev_change_role(
    user_id: int,
    payload: dict,
    x_dev_key: str = None,
    db: Session = Depends(get_db),
):
    """Change any user's role by DB id. Requires DEV_KEY header."""
    dev_key = os.getenv("DEV_KEY", "")
    if not dev_key or x_dev_key != dev_key:
        raise HTTPException(403, "Invalid or missing developer key")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    new_role = (payload.get("role") or "operator").strip()
    user.role = new_role
    db.commit()
    return {"ok": True, "id": user_id, "username": user.username, "role": new_role}


@router.put("/dev/users/{user_id}/password")
def dev_reset_password(
    user_id: int,
    payload: dict,
    x_dev_key: str = None,
    db: Session = Depends(get_db),
):
    """Reset any user's password by DB id. Requires DEV_KEY header."""
    dev_key = os.getenv("DEV_KEY", "")
    if not dev_key or x_dev_key != dev_key:
        raise HTTPException(403, "Invalid or missing developer key")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    new_pw = payload.get("password") or ""
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    user.password = hash_password(new_pw)
    db.commit()
    return {"ok": True, "id": user_id, "username": user.username}


@router.delete("/dev/users/{user_id}")
def dev_delete_user(
    user_id: int,
    x_dev_key: str = None,
    db: Session = Depends(get_db),
):
    """Delete any user by DB id. Requires DEV_KEY header."""
    dev_key = os.getenv("DEV_KEY", "")
    if not dev_key or x_dev_key != dev_key:
        raise HTTPException(403, "Invalid or missing developer key")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    db.delete(user)
    db.commit()
    return {"ok": True}


@router.get("/dev/tenants")
def dev_list_tenants(
    x_dev_key: str = None,
    db: Session = Depends(get_db),
):
    """List all tenants with user counts. Requires DEV_KEY header."""
    dev_key = os.getenv("DEV_KEY", "")
    if not dev_key or x_dev_key != dev_key:
        raise HTTPException(403, "Invalid or missing developer key")

    from sqlalchemy import func
    rows = (
        db.query(User.tenant_id, func.count(User.id).label("user_count"))
        .group_by(User.tenant_id)
        .all()
    )
    tray_rows = (
        db.query(Tray.tenant_id, func.count(Tray.id).label("tray_count"))
        .group_by(Tray.tenant_id)
        .all()
    )
    tray_map = {r.tenant_id: r.tray_count for r in tray_rows}

    return [
        {
            "tenant_id":  r.tenant_id,
            "user_count": r.user_count,
            "tray_count": tray_map.get(r.tenant_id, 0),
        }
        for r in rows
    ]