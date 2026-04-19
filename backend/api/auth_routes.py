"""
api/auth_routes.py
──────────────────
Public authentication endpoints (no JWT required).

Password reset flow (replaces the old shared-key approach):
  POST /forgot-password/request   → generate token, send email
  POST /forgot-password/confirm   → validate token, set new password

Tokens are:
  • 32-byte URL-safe random value (urlsafe_b64encode)
  • Stored as SHA-256 hash only — raw token is never persisted
  • Single-use (marked used=True on first successful confirm)
  • 15-minute expiry
"""
import os
import secrets
import hashlib
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models import User, PasswordResetToken
from schemas import LoginIn, RegisterIn, ForgotPasswordRequestIn, ForgotPasswordConfirmIn
from core.auth import (
    hash_password, verify_password, create_token,
    OPEN_REGISTRATION,
)
from core.rate_limit import limiter, AUTH_LIMIT
from services.audit_service import log_action

router = APIRouter(tags=["auth"])

_RESET_TTL_MINUTES = 15


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex). Only the hash is stored."""
    raw   = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── register ─────────────────────────────────────────────────────────────────

@router.post("/register")
@limiter.limit(AUTH_LIMIT)
def register(request: Request, payload: RegisterIn, db: Session = Depends(get_db)):
    name      = payload.username.strip()
    pw        = payload.password
    tenant_id = (payload.tenant_id or "default").strip()

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
    role = "admin" if is_first else (payload.role or "operator")

    user = User(tenant_id=tenant_id, username=name, password=hash_password(pw), role=role)
    db.add(user)
    log_action(db, name, "REGISTER", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"message": "User created", "role": user.role, "tenant_id": tenant_id}


# ── login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit(AUTH_LIMIT)
def login(request: Request, payload: LoginIn, db: Session = Depends(get_db)):
    name      = payload.username.strip()
    tenant_id = (payload.tenant_id or "default").strip()

    user = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == name
    ).first()

    if not user or not verify_password(payload.password, user.password):
        # Return 401, not 200, so gateways/rate-limiters can detect failures.
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user)
    log_action(db, name, "LOGIN", "", tenant_id)
    db.commit()
    return {
        "access_token": token,
        "role":         user.role,
        "username":     user.username,
        "tenant_id":    user.tenant_id,
    }


# ── forgot-password / request ─────────────────────────────────────────────────

@router.post("/forgot-password/request")
@limiter.limit("5/minute")
def forgot_password_request(
    request: Request,
    payload: ForgotPasswordRequestIn,
    db: Session = Depends(get_db),
):
    """
    Generate a single-use 15-minute reset token and email it to the user.
    Always returns 200 with the same message regardless of whether the user
    exists — prevents user enumeration.
    """
    username  = payload.username.strip()
    tenant_id = (payload.tenant_id or "default").strip()

    user = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == username
    ).first()

    # Purge any existing unused tokens for this user before creating a new one.
    if user:
        db.query(PasswordResetToken).filter(
            PasswordResetToken.tenant_id == tenant_id,
            PasswordResetToken.username  == username,
            PasswordResetToken.used      == False,
        ).delete(synchronize_session=False)
        db.flush()

        raw_token, token_hash = _make_token()
        expires_at = datetime.utcnow() + timedelta(minutes=_RESET_TTL_MINUTES)

        db.add(PasswordResetToken(
            tenant_id  = tenant_id,
            username   = username,
            token_hash = token_hash,
            expires_at = expires_at,
        ))
        log_action(db, username, "PASSWORD_RESET_REQUESTED", f"tenant={tenant_id}", tenant_id)
        db.commit()

        # Send the reset email.
        _send_reset_email(db, user, raw_token, tenant_id)

    # Always return the same response regardless of user existence.
    return {"message": "If that account exists, a password reset link has been sent."}


# ── forgot-password / confirm ─────────────────────────────────────────────────

@router.post("/forgot-password/confirm")
@limiter.limit("10/minute")
def forgot_password_confirm(
    request: Request,
    payload: ForgotPasswordConfirmIn,
    db: Session = Depends(get_db),
):
    """Validate a reset token and set the new password."""
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")

    token_hash = _hash_token(payload.token.strip())

    row = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used       == False,
    ).first()

    if not row:
        raise HTTPException(400, "Invalid or already-used reset token.")

    if datetime.utcnow() > row.expires_at:
        raise HTTPException(400, f"Reset token has expired. Please request a new one.")

    user = db.query(User).filter(
        User.tenant_id == row.tenant_id,
        User.username  == row.username,
    ).first()

    if not user:
        raise HTTPException(400, "Account not found.")

    user.password = hash_password(payload.new_password)
    row.used      = True
    log_action(db, row.username, "PASSWORD_RESET_CONFIRMED", f"tenant={row.tenant_id}", row.tenant_id)
    db.commit()

    return {"message": "Password updated successfully."}


# ── internal email helper ─────────────────────────────────────────────────────

def _send_reset_email(db, user: User, raw_token: str, tenant_id: str):
    """Fire-and-forget password reset email. Errors are logged, not raised."""
    try:
        from services.email_service import get_email_settings, send_email

        settings    = get_email_settings(db, tenant_id)
        frontend    = os.getenv("FRONTEND_URL", "http://localhost:5173")
        reset_link  = f"{frontend}/reset-password?token={raw_token}"
        html_body   = f"""
        <p>Hi <strong>{user.username}</strong>,</p>
        <p>A password reset was requested for your account.
           Click the button below to set a new password.
           This link expires in {_RESET_TTL_MINUTES} minutes.</p>
        <p style="margin:24px 0">
          <a href="{reset_link}"
             style="background:#185FA5;color:#fff;padding:12px 24px;
                    border-radius:6px;text-decoration:none;font-weight:700">
            Reset my password
          </a>
        </p>
        <p style="font-size:12px;color:#6B7280">
          If you didn't request this, ignore this email — your password won't change.
        </p>
        """
        send_email(
            settings,
            [user.username] if "@" in user.username else [],
            "Reset your Traceability password",
            f"<!DOCTYPE html><html><body>{html_body}</body></html>",
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Reset email failed for {user.username}: {exc}")