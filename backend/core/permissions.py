"""Feature-based permissions.

Built-in roles: `admin` (everything) and `operator` (floor work). Admins can define
custom roles in Admin → Roles; a role's permissions are a list of feature keys.
A tenant may also override the default permissions of `operator` by creating a role
with that name. Admin pages (users, pipeline, integrations, audit…) stay admin-only.
"""
import json
from typing import Iterable, List

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from core.auth import get_current_user, tenant

FEATURES = [
    {"key": "scan",         "label": "Scan trays"},
    {"key": "create_trays", "label": "Create trays"},
    {"key": "history",      "label": "View history"},
    {"key": "dashboard",    "label": "Dashboard"},
    {"key": "alerts",       "label": "Alerts dashboard"},
    {"key": "export",       "label": "Export data"},
]
ALL_KEYS: List[str] = [f["key"] for f in FEATURES]

DEFAULT_ROLE_PERMISSIONS = {
    "admin":    ALL_KEYS,
    "operator": ["scan", "create_trays", "history", "dashboard"],
}


def permissions_for(db: Session, tid: str, role: str) -> List[str]:
    if role == "admin":
        return list(ALL_KEYS)
    from models import RoleConfig
    row = db.query(RoleConfig).filter(RoleConfig.tenant_id == tid, RoleConfig.name == role).first()
    if row is not None:
        try:
            perms = json.loads(row.permissions or "[]")
        except ValueError:
            perms = []
        return [p for p in perms if p in ALL_KEYS]
    return list(DEFAULT_ROLE_PERMISSIONS.get(role, []))


def require_feature(*keys: str):
    """FastAPI dependency: the caller needs ANY of the given features (admins always pass)."""
    wanted: Iterable[str] = keys

    def dep(user: dict = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
        if user.get("role") == "admin":
            return user
        have = set(permissions_for(db, tenant(user), user.get("role", "")))
        if not have.intersection(wanted):
            raise HTTPException(403, "Your role does not have access to this feature")
        return user

    return dep
