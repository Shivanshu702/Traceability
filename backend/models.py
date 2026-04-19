from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text
from database import Base
from datetime import datetime


class Tray(Base):
    __tablename__ = "trays"

    id              = Column(String, primary_key=True, index=True)
    tenant_id       = Column(String, default="default", index=True, nullable=False)

    stage           = Column(String, default="CREATED", index=True)
    is_done         = Column(Boolean, default=False)
    is_split_parent = Column(Boolean, default=False)
    parent_id       = Column(String, nullable=True, index=True)

    # Project / batch info
    project         = Column(String, default="", index=True)
    shift           = Column(String, default="")
    created_by      = Column(String, default="")
    batch_no        = Column(String, default="")
    total_units     = Column(Integer, default=450)

    # FIFO flag
    fifo_violated   = Column(Boolean, default=False)

    # Timestamps
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_updated    = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at    = Column(DateTime, nullable=True)

    # FIX: tracks when this tray entered its CURRENT stage — used for accurate FIFO ordering.
    # last_updated is refreshed on every scan so it cannot reliably compare arrival order.
    stage_entered_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    # Stuck-alert dedup: prevents the same tray flooding inboxes every hour.
    last_stuck_alert_at = Column(DateTime, nullable=True)


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id          = Column(String, primary_key=True)
    tenant_id   = Column(String, default="default", index=True, nullable=False)
    tray_id     = Column(String, index=True)
    from_stage  = Column(String, default="")
    stage       = Column(String)
    operator    = Column(String, default="SYSTEM")
    fifo_flag   = Column(Boolean, default=False)
    note        = Column(Text, default="")
    timestamp   = Column(DateTime, default=datetime.utcnow, index=True)


class User(Base):
    __tablename__ = "users"

    id        = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True, nullable=False)
    username  = Column(String, index=True)
    password  = Column(String)
    role      = Column(String, default="operator")


class PasswordResetToken(Base):
    """Single-use, time-limited token for self-service password reset via email."""
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    tenant_id  = Column(String, index=True, nullable=False)
    username   = Column(String, index=True, nullable=False)
    # Store only the hash — never the raw token.
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id        = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True, nullable=False)
    username  = Column(String, index=True)
    action    = Column(String)
    details   = Column(String, default="")
    timestamp = Column(DateTime, default=datetime.utcnow)


class PipelineConfig(Base):
    """One row per tenant — stores the full pipeline as JSON."""
    __tablename__ = "pipeline_configs"

    id         = Column(Integer, primary_key=True, index=True)
    tenant_id  = Column(String, unique=True, index=True, nullable=False)
    config     = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


class EmailSettings(Base):
    """SMTP + notification preferences, one row per tenant."""
    __tablename__ = "email_settings"

    id                    = Column(Integer, primary_key=True, index=True)
    tenant_id             = Column(String, unique=True, index=True, nullable=False)

    # SMTP
    smtp_host             = Column(String, default="")
    smtp_port             = Column(Integer, default=587)
    smtp_user             = Column(String, default="")
    smtp_password         = Column(String, default="")
    smtp_use_tls          = Column(Boolean, default=True)
    from_email            = Column(String, default="")

    # Recipients — comma-separated
    alert_recipients      = Column(Text, default="")

    # Feature flags
    stuck_alert_enabled   = Column(Boolean, default=False)
    stuck_hours           = Column(Integer, default=1)
    daily_summary_enabled = Column(Boolean, default=False)
    daily_summary_hour    = Column(Integer, default=8)
    fifo_alert_enabled    = Column(Boolean, default=True)

    updated_at            = Column(DateTime, default=datetime.utcnow)


class RoleConfig(Base):
    """Custom roles with feature permissions, one per role name per tenant."""
    __tablename__ = "role_configs"

    id          = Column(Integer, primary_key=True, index=True)
    tenant_id   = Column(String, index=True, nullable=False)
    name        = Column(String, nullable=False)
    label       = Column(String, default="")
    permissions = Column(Text, default="[]")
    updated_at  = Column(DateTime, default=datetime.utcnow)