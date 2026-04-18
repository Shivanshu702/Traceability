"""
core/auth.py
────────────
Shared authentication utilities used across all route modules.
Extracted from routes_with_qr.py to avoid circular imports and
make each route file independently testable.
"""
import os
import bcrypt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from database import get_db
from models import User

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-in-production")
ALGORITHM  = "HS256"
TOKEN_TTL  = int(os.getenv("TOKEN_TTL_MINUTES", "60"))
security   = HTTPBearer()

OPEN_REGISTRATION = os.getenv("OPEN_REGISTRATION", "true").lower() != "false"


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
    db: Session = Depends(get_db),
) -> dict:
    """
    Decode and verify JWT, then confirm the user still exists in the DB.
    Returns 401 immediately if the user was deleted after token was issued.
    Also refreshes role from DB so role changes take effect without re-login.
    """
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(
        User.tenant_id == payload.get("tenant_id", "default"),
        User.username  == payload.get("sub"),
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Account not found — it may have been deleted. Please log in again."
        )

    # Always return fresh role from DB, not the one baked into the token
    payload["role"] = user.role
    return payload


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def tenant(user: dict) -> str:
    return user.get("tenant_id") or "default"
