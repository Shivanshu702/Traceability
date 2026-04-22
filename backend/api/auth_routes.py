"""
api/auth_routes.py
──────────────────
Password reset now sends to user.email (the dedicated email field on User).
Falls back to username if username looks like an email and email is not set.
Works correctly for any number of organisations and non-email usernames.
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
from core.auth import hash_password, verify_password, create_token, OPEN_REGISTRATION
from core.rate_limit import limiter, AUTH_LIMIT
from services.audit_service import log_action

router = APIRouter(tags=["auth"])

_RESET_TTL_MINUTES = 15

# ── Tenant allowlist ──────────────────────────────────────────────────────────
_raw_tenants = os.getenv("ALLOWED_TENANTS", "").strip()
ALLOWED_TENANTS = (
    {t.strip().upper() for t in _raw_tenants.split(",") if t.strip()}
    if _raw_tenants else set()
)


def _validate_tenant(tenant_id):
    tid = (tenant_id or "default").strip().upper()
    if ALLOWED_TENANTS:
        if tid not in ALLOWED_TENANTS:
            raise HTTPException(403, "Unknown organisation ID. Contact your administrator.")
    else:
        tid = "default"
    return tid


def _make_token():
    raw    = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def _hash_token(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_email_for_user(user):
    """
    Return the email address to send a reset link to.
    Priority:
      1. user.email (explicitly stored email address)
      2. user.username if it contains '@' (legacy / single-org setups)
      3. None — no email available, reset request silently succeeds but no email is sent
    """
    if user.email and "@" in user.email:
        return user.email
    if user.username and "@" in user.username:
        return user.username
    return None


# ── register ──────────────────────────────────────────────────────────────────

@router.post("/register")
@limiter.limit(AUTH_LIMIT)
def register(request: Request, payload: RegisterIn, db: Session = Depends(get_db)):
    if not OPEN_REGISTRATION:
        raise HTTPException(403, "Open registration is disabled. Contact your admin.")

    name      = payload.username.strip()
    pw        = payload.password
    tenant_id = _validate_tenant(payload.tenant_id or "default")

    existing = db.query(User).filter(User.tenant_id == tenant_id, User.username == name).first()
    if existing:
        return {"error": "User already exists in this organisation"}

    is_first = not db.query(User).filter(User.tenant_id == tenant_id).first()
    role     = "admin" if is_first else (payload.role or "operator")

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

    user = db.query(User).filter(User.tenant_id == tenant_id, User.username == name).first()
    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user)
    log_action(db, name, "LOGIN", "", tenant_id)
    db.commit()
    return {
        "access_token": token,
        "role":         user.role,
        "username":     user.username,
        "tenant_id":    user.tenant_id,
        "email":        user.email or "",
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
    Works for any organisation size:
    - Looks up the user by (username, tenant_id)
    - Sends the reset link to user.email (or username if it's an email)
    - Always returns the same message regardless of whether user exists
      (prevents user enumeration)
    """
    username  = payload.username.strip()
    tenant_id = (payload.tenant_id or "default").strip()

    user = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == username
    ).first()

    if user:
        email = _get_email_for_user(user)

        # Purge existing unused tokens
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

        if email:
            _send_reset_email(db, user, email, raw_token, tenant_id)
        # If no email configured, token is created but silently not sent.
        # Admin can retrieve the raw token via the admin panel (future feature).

    return {"message": "If that account exists, a password reset link has been sent."}


# ── forgot-password / confirm ─────────────────────────────────────────────────

@router.post("/forgot-password/confirm")
@limiter.limit("10/minute")
def forgot_password_confirm(
    request: Request,
    payload: ForgotPasswordConfirmIn,
    db: Session = Depends(get_db),
):
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
        raise HTTPException(400, "Reset token has expired. Please request a new one.")

    user = db.query(User).filter(
        User.tenant_id == row.tenant_id, User.username == row.username
    ).first()
    if not user:
        raise HTTPException(400, "Account not found.")

    user.password = hash_password(payload.new_password)
    row.used      = True
    log_action(db, row.username, "PASSWORD_RESET_CONFIRMED", f"tenant={row.tenant_id}", row.tenant_id)
    db.commit()
    return {"message": "Password updated successfully."}


# ── internal email helper ─────────────────────────────────────────────────────

def _send_reset_email(db, user, email, raw_token, tenant_id):
    try:
        from services.email_service import get_email_settings, send_email
        settings   = get_email_settings(db, tenant_id)
        frontend   = os.getenv("FRONTEND_URL", "http://localhost:5173")
        reset_link = f"{frontend}/?token={raw_token}"
        html_body  = f"""
        <p>Hi <strong>{user.username}</strong>,</p>
        <p>A password reset was requested for your account (<strong>{tenant_id}</strong>).
           Click the button below to set a new password.
           This link expires in <strong>{_RESET_TTL_MINUTES} minutes</strong>.</p>
        <p style="margin:24px 0">
          <a href="{reset_link}" style="background:#185FA5;color:#fff;padding:12px 24px;
            border-radius:6px;text-decoration:none;font-weight:700">
            Reset my password
          </a>
        </p>
        <p style="font-size:12px;color:#6B7280">
          If you didn't request this, ignore this email — your password won't change.
        </p>
        """
        send_email(
            settings, [email],
            f"Reset your Traceability password ({tenant_id})",
            f"<!DOCTYPE html><html><body>{html_body}</body></html>",
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Reset email failed for {user.username}: {exc}")