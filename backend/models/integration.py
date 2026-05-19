# backend/models/integration.py
"""
SQLAlchemy models for the SMT + WATS integration layer.

Three tables:
  integration_config  — single-row config for Cogiscan + WATS
  unit_test_results   — one row per unit that has a WATS result
  smt_events          — raw Cogiscan panel events (audit trail)
"""
from sqlalchemy import (
    Boolean, Column, DateTime, Integer, JSON, String, Text
)
from sqlalchemy.sql import func

# Import Base from the project's existing database.py
from database import Base


class IntegrationConfig(Base):
    """Single-row config table (id always = 1). Upserted on save."""
    __tablename__ = "integration_config"

    id = Column(Integer, primary_key=True, default=1)

    # ── Cogiscan ─────────────────────────────────────────────────────────────
    cogiscan_enabled    = Column(Boolean,  nullable=False, default=False)
    cogiscan_url        = Column(String,   nullable=False, default="")
    cogiscan_api_key    = Column(String,   nullable=False, default="")
    cogiscan_poll_sec   = Column(Integer,  nullable=False, default=30)
    # When True: tray records are auto-created from SMT panels; manual creation hidden
    smt_auto_create     = Column(Boolean,  nullable=False, default=False)
    cogiscan_last_sync  = Column(DateTime(timezone=True), nullable=True)

    # ── WATS ─────────────────────────────────────────────────────────────────
    wats_enabled        = Column(Boolean,  nullable=False, default=False)
    wats_url            = Column(String,   nullable=False, default="")
    wats_api_key        = Column(String,   nullable=False, default="")
    # "auto" | "scheduled" | "manual"
    wats_sync_mode      = Column(String,   nullable=False, default="manual")
    wats_last_sync      = Column(DateTime(timezone=True), nullable=True)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UnitTestResult(Base):
    """One row per unit serial that has been pulled from WATS."""
    __tablename__ = "unit_test_results"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    unit_serial      = Column(String,  nullable=False, index=True)
    tray_id          = Column(String,  nullable=False, index=True)
    wats_result_id   = Column(String,  nullable=True)   # WATS internal ID

    # Timestamps for cycle-time calculation
    smt_exit_at      = Column(DateTime(timezone=True), nullable=True)
    test_started_at  = Column(DateTime(timezone=True), nullable=True)
    test_completed_at= Column(DateTime(timezone=True), nullable=True)

    # Result
    status           = Column(String,  nullable=False)   # "PASS" | "FAIL"
    failure_code     = Column(String,  nullable=True)
    failure_step     = Column(String,  nullable=True)
    test_duration_sec= Column(Integer, nullable=True)
    retests          = Column(Integer, nullable=False, default=0)

    # Context
    shift            = Column(String,  nullable=True)
    operator         = Column(String,  nullable=True)
    project          = Column(String,  nullable=True)

    # Raw WATS measurements stored as JSON for future analytics
    measurements     = Column(JSON,    nullable=True)
    raw_wats_payload = Column(JSON,    nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SmtEvent(Base):
    """
    Raw Cogiscan panel events — one per panel that exits the SMT line.
    Acts as an audit trail; `tray_id` is set once we create the tray.
    """
    __tablename__ = "smt_events"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    panel_id         = Column(String,  nullable=False, index=True)
    datamatrix_code  = Column(String,  nullable=False, index=True)
    smt_exit_at      = Column(DateTime(timezone=True), nullable=True)
    unit_count       = Column(Integer, nullable=True)
    project_id       = Column(String,  nullable=True)

    # Set once we auto-create a tray from this event
    tray_id          = Column(String,  nullable=True, index=True)
    processed        = Column(Boolean, nullable=False, default=False)

    # Full Cogiscan payload for debugging
    raw_cogiscan_payload = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())