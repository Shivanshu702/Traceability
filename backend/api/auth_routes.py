import random, hashlib
from models import PendingRegistration
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from core.auth import (
    COOKIE_NAME,
    OPEN_REGISTRATION,
    TOKEN_TTL,
    create_token,
    hash_password,
    verify_password,
)
from core.rate_limit import AUTH_LIMIT, limiter
from database import get_db
from models import PasswordResetToken, User
from schemas import ForgotPasswordConfirmIn, ForgotPasswordRequestIn, LoginIn, RegisterIn
from services.audit_service import log_action

router = APIRouter(tags=["auth"])

_RESET_TTL_MINUTES = 15

_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() != "false"

# ── Tenant allowlist ───────────────────────────────────────────────────────────
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
    if user.email and "@" in user.email:
        return user.email
    if user.username and "@" in user.username:
        return user.username
    return None


# ── register ───────────────────────────────────────────────────────────────────

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
        raise HTTPException(409, "User already exists in this organisation")

    is_first = not db.query(User).filter(User.tenant_id == tenant_id).first()
    role     = "admin" if is_first else (payload.role or "operator")

    user = User(tenant_id=tenant_id, username=name, password=hash_password(pw), role=role)
    db.add(user)
    log_action(db, name, "REGISTER", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"message": "User created", "role": user.role, "tenant_id": tenant_id}


# ── register / send-otp ────────────────────────────────────────────────────────

@router.post("/register/send-otp")
@limiter.limit(AUTH_LIMIT)
def register_send_otp(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Step 1 of registration: validate inputs, send OTP to email."""
    username  = (payload.get("username") or "").strip()
    email     = (payload.get("email") or "").strip()
    password  = payload.get("password") or ""
    confirm   = payload.get("confirm_password") or ""
    tenant_id = _validate_tenant((payload.get("tenant_id") or "default").strip())

    if not username or not email or not password:
        raise HTTPException(400, "Username, email and password are required.")
    if "@" not in email:
        raise HTTPException(400, "Enter a valid email address.")
    if password != confirm:
        raise HTTPException(400, "Passwords do not match.")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    # Block if user already exists
    if db.query(User).filter(User.tenant_id == tenant_id, User.username == username).first():
        raise HTTPException(409, "Username already exists in this organisation.")

    # Generate 6-digit OTP
    otp       = str(random.randint(100000, 999999))
    otp_hash  = hashlib.sha256(otp.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Remove any old pending registrations for this username+tenant
    db.query(PendingRegistration).filter(
        PendingRegistration.tenant_id == tenant_id,
        PendingRegistration.username  == username,
    ).delete(synchronize_session=False)
    db.flush()

    db.add(PendingRegistration(
        tenant_id     = tenant_id,
        username      = username,
        email         = email,
        password_hash = hash_password(password),
        otp_hash      = otp_hash,
        expires_at    = expires_at,
    ))
    db.commit()

    # Send OTP email
    try:
        from services.email_service import send_otp_email, get_email_settings
        settings = get_email_settings(db, tenant_id)
        send_otp_email(db, email, username, otp, tenant_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Failed to send OTP email: %s", exc)

    return {"message": "OTP sent to your email. It expires in 10 minutes."}


# ── register / verify-otp ──────────────────────────────────────────────────────

@router.post("/register/verify-otp")
@limiter.limit(AUTH_LIMIT)
def register_verify_otp(request: Request, payload: dict, db: Session = Depends(get_db)):
    """Step 2 of registration: verify OTP and create the account."""
    username  = (payload.get("username") or "").strip()
    tenant_id = _validate_tenant((payload.get("tenant_id") or "default").strip())
    otp       = (payload.get("otp") or "").strip()

    if not otp:
        raise HTTPException(400, "Enter the OTP sent to your email.")

    otp_hash = hashlib.sha256(otp.encode()).hexdigest()
    pending  = db.query(PendingRegistration).filter(
        PendingRegistration.tenant_id == tenant_id,
        PendingRegistration.username  == username,
        PendingRegistration.otp_hash  == otp_hash,
    ).first()

    if not pending:
        raise HTTPException(400, "Invalid OTP. Please check your email and try again.")

    now      = datetime.now(timezone.utc)
    expires  = pending.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        db.delete(pending)
        db.commit()
        raise HTTPException(400, "OTP has expired. Please register again.")

    # Check username not taken (race condition guard)
    if db.query(User).filter(User.tenant_id == tenant_id, User.username == username).first():
        raise HTTPException(409, "Username already exists.")

    is_first = not db.query(User).filter(User.tenant_id == tenant_id).first()
    role     = "admin" if is_first else "operator"

    user = User(
        tenant_id = tenant_id,
        username  = username,
        email     = pending.email,
        password  = pending.password_hash,
        role      = role,
    )
    db.add(user)
    db.delete(pending)
    log_action(db, username, "REGISTER", f"tenant={tenant_id}", tenant_id)
    db.commit()
    return {"message": "Account created successfully! You can now log in.", "role": role}


# ── login ──────────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit(AUTH_LIMIT)
def login(
    request:  Request,
    response: Response,
    payload:  LoginIn,
    db:       Session = Depends(get_db),
):
    name      = payload.username.strip()
    raw_tid   = (payload.tenant_id or "default").strip()
    tenant_id = raw_tid.upper() if ALLOWED_TENANTS else "default"

    user = db.query(User).filter(User.tenant_id == tenant_id, User.username == name).first()
    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user)

    response.set_cookie(
        key      = COOKIE_NAME,
        value    = token,
        httponly = True,
        secure   = _COOKIE_SECURE,
        samesite = "none",
        max_age  = TOKEN_TTL * 60,
        path     = "/",
    )

    log_action(db, name, "LOGIN", "", tenant_id)
    db.commit()

    return {
        "ok":        True,
        "role":      user.role,
        "username":  user.username,
        "tenant_id": user.tenant_id,
        "email":     user.email or "",
    }


# ── logout ─────────────────────────────────────────────────────────────────────

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}


# ── forgot-password / request ──────────────────────────────────────────────────

@router.post("/forgot-password/request")
@limiter.limit("5/minute")
def forgot_password_request(
    request: Request,
    payload: ForgotPasswordRequestIn,
    db: Session = Depends(get_db),
):
    username  = payload.username.strip()
    tenant_id = _validate_tenant(payload.tenant_id or "default")

    user = db.query(User).filter(
        User.tenant_id == tenant_id, User.username == username
    ).first()

    if user:
        email = _get_email_for_user(user)

        db.query(PasswordResetToken).filter(
            PasswordResetToken.tenant_id == tenant_id,
            PasswordResetToken.username  == username,
            PasswordResetToken.used      == False,
        ).delete(synchronize_session=False)
        db.flush()

        raw_token, token_hash = _make_token()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=_RESET_TTL_MINUTES)
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

    # Always return the same message — never reveal whether the account exists.
    return {"message": "If that account exists, a password reset link has been sent."}


# ── forgot-password / confirm ──────────────────────────────────────────────────

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

    now = datetime.now(timezone.utc)
    expires = row.expires_at
    # Normalise naive timestamps stored before the migration.
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
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


# ── Internal helper ────────────────────────────────────────────────────────────

def _send_reset_email(db, user, email: str, raw_token: str, tenant_id: str):
    """Fire-and-forget reset email.  Errors are logged, never raised."""
    try:
        from services.email_service import send_password_reset_email
        send_password_reset_email(db, user, email, raw_token, tenant_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(
            "Failed to send password reset email to %s: %s", email, exc
        )