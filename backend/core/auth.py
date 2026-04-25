
import os
from datetime import datetime, timedelta

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
from models import User

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-in-production")
ALGORITHM  = "HS256"
TOKEN_TTL  = int(os.getenv("TOKEN_TTL_MINUTES", "60"))

OPEN_REGISTRATION = os.getenv("OPEN_REGISTRATION", "true").lower() != "false"

# Keep HTTPBearer optional so we can support both cookie and Bearer flows.
_bearer = HTTPBearer(auto_error=False)

COOKIE_NAME = "access_token"


# ── Password helpers ──────────────────────────────────────────────────────────

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


# ── Token extraction ──────────────────────────────────────────────────────────

def _extract_token(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None,
) -> str | None:
    
    # 1. Cookie (preferred)
    cookie_val = request.cookies.get(COOKIE_NAME)
    if cookie_val:
        return cookie_val

    # 2. Bearer header (API clients, curl, mobile apps)
    if bearer and bearer.credentials:
        return bearer.credentials

    return None


# ── Dependency: current user ──────────────────────────────────────────────────

def get_current_user(
    request: Request,
    bearer:  HTTPAuthorizationCredentials | None = Depends(_bearer),
    db:      Session                             = Depends(get_db),
) -> dict:
    """
    Decode and verify JWT from cookie or Bearer header, then confirm the
    user still exists in the DB.

    Returns 401 if:
      • No token present
      • Token is invalid or expired
      • The user account has been deleted since the token was issued
    """
    raw_token = _extract_token(request, bearer)
    if not raw_token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please log in.",
        )

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(
        User.tenant_id == payload.get("tenant_id", "default"),
        User.username  == payload.get("sub"),
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Account not found – it may have been deleted. Please log in again.",
        )

    # Always return fresh role from DB so role changes take effect immediately.
    payload["role"] = user.role
    return payload


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def tenant(user: dict) -> str:
    return user.get("tenant_id", "default")