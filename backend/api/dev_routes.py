
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import User, Tray
from core.auth import hash_password
from core.rate_limit import limiter, DEV_LIMIT
import os

router = APIRouter(prefix="/dev", tags=["developer"])


def _check_dev_key(provided: str) -> None:
    dev_key = os.getenv("DEV_KEY", "").strip()
    if not dev_key:
        raise HTTPException(403, "DEV_KEY is not configured on this server.")
    if not provided or provided.strip() != dev_key:
        raise HTTPException(403, "Invalid developer key.")


@router.post("/auth")
@limiter.limit(DEV_LIMIT)
def dev_auth(request: Request, payload: dict):
    """Verify dev key. Call this first before loading any data."""
    _check_dev_key(payload.get("dev_key", ""))
    return {"ok": True}


@router.post("/users")
@limiter.limit(DEV_LIMIT)
def dev_list_users(request: Request, payload: dict, db: Session = Depends(get_db)):
    """List ALL users across ALL tenants."""
    _check_dev_key(payload.get("dev_key", ""))
    users = db.query(User).order_by(User.tenant_id, User.username).all()
    return [
        {"id": u.id, "tenant_id": u.tenant_id, "username": u.username, "role": u.role}
        for u in users
    ]


@router.post("/users/{user_id}/role")
@limiter.limit(DEV_LIMIT)
def dev_change_role(request: Request, user_id: int, payload: dict, db: Session = Depends(get_db)):
    """Change any user's role by DB id."""
    _check_dev_key(payload.get("dev_key", ""))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    new_role   = (payload.get("role") or "operator").strip()
    user.role  = new_role
    db.commit()
    return {"ok": True, "id": user_id, "username": user.username, "role": new_role}


@router.post("/users/{user_id}/password")
@limiter.limit(DEV_LIMIT)
def dev_reset_password(request: Request, user_id: int, payload: dict, db: Session = Depends(get_db)):
    """Reset any user's password by DB id."""
    _check_dev_key(payload.get("dev_key", ""))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    new_pw = payload.get("password") or ""
    if len(new_pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user.password = hash_password(new_pw)
    db.commit()
    return {"ok": True, "id": user_id, "username": user.username}


@router.post("/users/{user_id}/delete")
@limiter.limit(DEV_LIMIT)
def dev_delete_user(request: Request, user_id: int, payload: dict, db: Session = Depends(get_db)):
    """Delete any user by DB id."""
    _check_dev_key(payload.get("dev_key", ""))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.post("/tenants")
@limiter.limit(DEV_LIMIT)
def dev_list_tenants(request: Request, payload: dict, db: Session = Depends(get_db)):
    """List all tenants with user and tray counts."""
    _check_dev_key(payload.get("dev_key", ""))
    rows = (
        db.query(User.tenant_id, func.count(User.id).label("user_count"))
        .group_by(User.tenant_id).all()
    )
    tray_rows = (
        db.query(Tray.tenant_id, func.count(Tray.id).label("tray_count"))
        .group_by(Tray.tenant_id).all()
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
