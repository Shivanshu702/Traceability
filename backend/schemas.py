"""
schemas.py
──────────
Pydantic v2 request / response models.

Why Pydantic models instead of raw `dict` payloads?
  • Automatic type coercion + validation with clear error messages
  • Self-documenting OpenAPI (Swagger) schemas
  • Eliminates silent failures from missing / wrong-typed fields
  • Protects against unintended fields being processed
"""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


# ── Auth ─────────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    username:  str = Field(..., min_length=1, max_length=80)
    password:  str = Field(..., min_length=6)
    tenant_id: Optional[str] = "default"
    role:      Optional[str] = "operator"


class LoginIn(BaseModel):
    username:  str = Field(..., min_length=1)
    password:  str = Field(..., min_length=1)
    tenant_id: Optional[str] = "default"


class ForgotPasswordRequestIn(BaseModel):
    username:  str = Field(..., min_length=1)
    tenant_id: Optional[str] = "default"


class ForgotPasswordConfirmIn(BaseModel):
    token:        str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=6)


# ── Tray creation ─────────────────────────────────────────────────────────────

class TrayIn(BaseModel):
    id:          str = Field(..., min_length=1, max_length=50)
    project:     Optional[str] = ""
    shift:       Optional[str] = ""
    created_by:  Optional[str] = ""
    batch_no:    Optional[str] = ""
    total_units: Optional[int] = None

    @field_validator("id")
    @classmethod
    def upper_id(cls, v: str) -> str:
        return v.strip().upper()


class TraysCreateIn(BaseModel):
    trays: List[TrayIn] = Field(..., min_length=1)


# ── Scan ─────────────────────────────────────────────────────────────────────

class ScanIn(BaseModel):
    id:                  str = Field(..., min_length=1)
    next_stage_override: Optional[str] = None
    operator:            Optional[str] = None   # overrides JWT sub when provided

    @field_validator("id")
    @classmethod
    def upper_id(cls, v: str) -> str:
        return v.strip().upper()


class BulkScanIn(BaseModel):
    ids:                 List[str] = Field(..., min_length=1)
    next_stage_override: Optional[str] = None

    @field_validator("ids")
    @classmethod
    def upper_ids(cls, v: List[str]) -> List[str]:
        return [x.strip().upper() for x in v if x.strip()]


class BulkDeleteIn(BaseModel):
    ids: List[str] = Field(..., min_length=1)

    @field_validator("ids")
    @classmethod
    def upper_ids(cls, v: List[str]) -> List[str]:
        return [x.strip().upper() for x in v if x.strip()]


# ── Admin ─────────────────────────────────────────────────────────────────────

class UserCreateIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=6)
    role:     Optional[str] = "operator"


class UserRoleIn(BaseModel):
    role: str = Field(..., min_length=1)