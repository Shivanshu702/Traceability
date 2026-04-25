
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


# ── Auth ──────────────────────────────────────────────────────────────────────

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


# ── Scan ──────────────────────────────────────────────────────────────────────

class ScanIn(BaseModel):
    id:                  str = Field(..., min_length=1)
    next_stage_override: Optional[str] = None
    operator:            Optional[str] = None

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


# ── Admin – users ─────────────────────────────────────────────────────────────

class UserCreateIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=6)
    role:     Optional[str] = "operator"


class UserRoleIn(BaseModel):
    role: str = Field(..., min_length=1)


# ── Admin – pipeline config ───────────────────────────────────────────────────
#
# FIX: These models replace the bare `dict` accepted by PUT /admin/pipeline-config.
# Validation rules mirror what save_pipeline_config() and advance_tray() expect.

class StageDef(BaseModel):
    """One step in the linear pipeline."""
    id:                 str           = Field(..., min_length=1, max_length=50)
    label:              str           = Field(..., min_length=1)
    color:              Optional[str] = "#888780"
    next:               Optional[str] = None       # None for terminal stages
    scanNote:           Optional[str] = ""
    stuckLimitSeconds:  Optional[int] = Field(default=3600, ge=0)

    @field_validator("id", "next", mode="before")
    @classmethod
    def upper_ids(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class BranchOption(BaseModel):
    """One branch choice at the branch stage (e.g. Robot vs Manual soldering)."""
    id:       str           = Field(..., min_length=1, max_length=50)
    label:    str           = Field(..., min_length=1)
    icon:     Optional[str] = ""
    color:    Optional[str] = "#888780"
    next:     Optional[str] = None
    scanNote: Optional[str] = ""

    @field_validator("id", "next", mode="before")
    @classmethod
    def upper_ids(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class BranchConfig(BaseModel):
    enabled: bool              = True
    atStage: str               = Field(..., min_length=1)
    options: List[BranchOption] = Field(..., min_length=1)

    @field_validator("atStage", mode="before")
    @classmethod
    def upper(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class SplitConfig(BaseModel):
    enabled:       bool = True
    atStage:       str  = Field(..., min_length=1)
    resumeAtStage: str  = Field(..., min_length=1)

    @field_validator("atStage", "resumeAtStage", mode="before")
    @classmethod
    def upper(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class ProjectDef(BaseModel):
    id:             str           = Field(..., min_length=1, max_length=50)
    label:          str           = Field(..., min_length=1)
    panels:         Optional[int] = Field(default=50, ge=1)
    unitsPerPanel:  Optional[int] = Field(default=9,  ge=1)
    unitsPerTray:   Optional[int] = None
    stageIds:       Optional[List[str]]  = []
    splitOverride:  Optional[str]        = "inherit"
    branchOverride: Optional[str]        = "inherit"
    branchOptions:  Optional[List[Dict[str, Any]]] = []


class TrayIdConfig(BaseModel):
    idPrefix:    Optional[str] = "TRY"
    unitsPerTray: Optional[int] = Field(default=450, ge=1)


class PipelineConfigIn(BaseModel):
    """
    Full pipeline configuration payload for PUT /admin/pipeline-config.

    All stage IDs within `stages`, `split`, and `branch` must be consistent –
    e.g. split.atStage must appear in stages, branch.atStage must appear in
    stages, and branch option IDs must not clash with stage IDs.
    """
    tray:     Optional[TrayIdConfig] = None
    projects: Optional[List[ProjectDef]] = []
    stages:   List[StageDef]         = Field(..., min_length=1)
    split:    Optional[SplitConfig]  = None
    branch:   Optional[BranchConfig] = None

    @model_validator(mode="after")
    def check_stage_references(self) -> "PipelineConfigIn":
        stage_ids = {s.id for s in self.stages}

        # Duplicate stage IDs are illegal.
        if len(stage_ids) != len(self.stages):
            raise ValueError("stages contains duplicate IDs")

        # split.atStage and split.resumeAtStage must be known stage IDs.
        if self.split and self.split.enabled:
            for field_name in ("atStage", "resumeAtStage"):
                sid = getattr(self.split, field_name)
                if sid not in stage_ids:
                    raise ValueError(
                        f"split.{field_name} '{sid}' is not a defined stage ID"
                    )

        # branch.atStage must be a known stage ID.
        if self.branch and self.branch.enabled:
            if self.branch.atStage not in stage_ids:
                raise ValueError(
                    f"branch.atStage '{self.branch.atStage}' is not a defined stage ID"
                )

        return self