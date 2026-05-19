# backend/schemas/integration.py
"""
Pydantic v2 schemas for the integration config API.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, HttpUrl, field_validator


# ── Config in / out ────────────────────────────────────────────────────────────
class IntegrationConfigIn(BaseModel):
    """Body for POST /api/integrations/config"""
    cogiscan_enabled:    bool   = False
    cogiscan_url:        str    = ""
    cogiscan_api_key:    str    = ""
    cogiscan_poll_sec:   int    = 30
    smt_auto_create:     bool   = False

    wats_enabled:        bool   = False
    wats_url:            str    = ""
    wats_api_key:        str    = ""
    wats_sync_mode:      str    = "manual"

    @field_validator("wats_sync_mode")
    @classmethod
    def validate_sync_mode(cls, v):
        if v not in {"auto", "scheduled", "manual"}:
            raise ValueError("wats_sync_mode must be 'auto', 'scheduled', or 'manual'")
        return v

    @field_validator("cogiscan_poll_sec")
    @classmethod
    def validate_poll(cls, v):
        if v not in {0, 15, 30, 60, 300}:
            raise ValueError("cogiscan_poll_sec must be 0, 15, 30, 60, or 300")
        return v


class IntegrationConfigOut(IntegrationConfigIn):
    """Response for GET /api/integrations/config — adds read-only timestamps"""
    model_config = ConfigDict(from_attributes=True)

    cogiscan_last_sync: Optional[datetime] = None
    wats_last_sync:     Optional[datetime] = None
    updated_at:         Optional[datetime] = None


# ── Connection test result ─────────────────────────────────────────────────────
class ConnectionTestResult(BaseModel):
    status:  str           # "ok" | "error"
    message: str
    detail:  Optional[str] = None


# ── Manual sync result ─────────────────────────────────────────────────────────
class CogiscanSyncResult(BaseModel):
    panels_found:   int
    panels_created: int
    panels_skipped: int
    errors:         List[str] = []


class WatsSyncResult(BaseModel):
    results_pulled:  int
    results_created: int
    results_updated: int
    errors:          List[str] = []


# ── Analytics schemas ──────────────────────────────────────────────────────────
class DailyYield(BaseModel):
    date:   str
    tested: int
    passed: int
    fpy:    float   # first-pass yield %, 0–100


class SmtSummary(BaseModel):
    units_tested_today:    int
    panels_today:          int
    fpy_pct:               Optional[float] = None
    fpy_pass:              int = 0
    fpy_total:             int = 0
    overall_yield_pct:     Optional[float] = None
    failures_today:        int = 0
    failure_codes_today:   int = 0


class CycleTimeStats(BaseModel):
    avg_smt_to_test_sec:   Optional[float] = None
    min_smt_to_test_sec:   Optional[float] = None
    max_smt_to_test_sec:   Optional[float] = None
    avg_test_duration_sec: Optional[float] = None
    sample_size:           int = 0


class UnitTestResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                int
    unit_serial:       str
    tray_id:           str
    smt_exit_at:       Optional[datetime] = None
    test_started_at:   Optional[datetime] = None
    test_completed_at: Optional[datetime] = None
    smt_to_test_sec:   Optional[int]      = None   # computed in route
    test_duration_sec: Optional[int]      = None
    status:            str
    failure_code:      Optional[str]      = None
    retests:           int = 0
    shift:             Optional[str]      = None
    project:           Optional[str]      = None