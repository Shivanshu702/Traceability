"""
api/auth_routes.py
──────────────────
Public authentication endpoints (no JWT required).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User
from core.auth import (
    hash_password, verify_password, create_token,
    OPEN_REGISTRATION,
)
from core.rate_limit import limiter, AUTH_LIMIT
from services.audit_service import log_action
import os

router = APIRouter(tags=["auth"])


@router.post("/register")
@limiter.limit(AUTH_LIMIT)
def register(request: Request, payload: dict, db: Session = Depends(get_db)):
    name      = (payload.get("username") or "").strip()
    pw        = payload.get("password") or ""
    tenant_id = (payload.get("tenant_id") or "default").strip()

    if not name or not pw:
        raise HTTPException(400, "username and password required")

    existing = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == name
    ).first()
    if existing:
        return {"error": "User already exists in this organisation"}

    if not OPEN_REGISTRATION:
        raise HTTPException(403, "Open registration is disabled. Contact your admin.")

    # First user in a tenant becomes admin automatically
    is_first = not db.query(User).filter(User.tenant_id == tenant_id).first()
    role = "admin" if is_first else payload.get("role", "operator")

    user = User(tenant_id=tenant_id, username=name, password=hash_password(pw), role=role)
    db.add(user)
    log_action(db, name, "REGISTER", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"message": "User created", "role": user.role, "tenant_id": tenant_id}


@router.post("/login")
@limiter.limit(AUTH_LIMIT)
def login(request: Request, payload: dict, db: Session = Depends(get_db)):
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


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: dict, db: Session = Depends(get_db)):
    """
    Self-service password reset using ADMIN_RESET_KEY as the second factor.
    For per-user token-based reset, integrate with Resend email and add a
    PasswordResetToken model with a 15-minute expiry.
    """
    reset_key = os.getenv("ADMIN_RESET_KEY", "").strip()
    if not reset_key:
        return {"error": "Password reset is not configured. Contact the developer."}

    provided = (payload.get("reset_key") or "").strip()
    if not provided or provided != reset_key:
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

    # Don't reveal whether the user exists
    if not user:
        return {"error": "Invalid username or organisation ID."}

    user.password = hash_password(new_pw)
    log_action(db, username, "FORGOT_PASSWORD_RESET", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"ok": True, "message": "Password updated. You can now log in."}
