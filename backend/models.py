from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, UniqueConstraint
from database import Base
from datetime import datetime, timezone


class Tray(Base):
    __tablename__ = "trays"

    id              = Column(String, primary_key=True, index=True)
    tenant_id       = Column(String, default="default", index=True, nullable=False)
    stage           = Column(String, default="CREATED", index=True)
    is_done         = Column(Boolean, default=False)
    is_split_parent = Column(Boolean, default=False)
    parent_id       = Column(String, nullable=True, index=True)
    project         = Column(String, default="", index=True)
    shift           = Column(String, default="")
    created_by      = Column(String, default="")
    batch_no        = Column(String, default="")
    total_units     = Column(Integer, default=450)
    fifo_violated   = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_updated    = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    completed_at    = Column(DateTime, nullable=True)
    stage_entered_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=True)
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
    timestamp   = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class User(Base):
    __tablename__ = "users"

    id        = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True, nullable=False)
    username  = Column(String, index=True)
    password  = Column(String)
    role      = Column(String, default="operator")
    email     = Column(String, nullable=True)


    __table_args__ = (
        UniqueConstraint("tenant_id", "username", name="uq_users_tenant_username"),
    )


class PasswordResetToken(Base):
    """Single-use, time-limited token for self-service password reset via email."""
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    tenant_id  = Column(String, index=True, nullable=False)
    username   = Column(String, index=True, nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id           = Column(Integer, primary_key=True, index=True)
    tenant_id    = Column(String, nullable=False, index=True)
    username     = Column(String, nullable=False)
    email        = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    otp_hash     = Column(String, nullable=False)
    expires_at   = Column(DateTime, nullable=False)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id        = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True, nullable=False)
    username  = Column(String, index=True)
    action    = Column(String)
    details   = Column(String, default="")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PipelineConfig(Base):
    __tablename__ = "pipeline_configs"

    id         = Column(Integer, primary_key=True, index=True)
    tenant_id  = Column(String, unique=True, index=True, nullable=False)
    config     = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EmailSettings(Base):
    __tablename__ = "email_settings"

    id                    = Column(Integer, primary_key=True, index=True)
    tenant_id             = Column(String, unique=True, index=True, nullable=False)
    smtp_host             = Column(String, default="")
    # MED-5 FIX: align default to 465 (SSL) — the migration had 587 but the
    # model and email_service both assume 465 as the preferred port.
    smtp_port             = Column(Integer, default=465)
    smtp_user             = Column(String, default="")
    smtp_password         = Column(String, default="")
    smtp_use_tls          = Column(Boolean, default=True)
    from_email            = Column(String, default="")
    alert_recipients      = Column(Text, default="")
    stuck_alert_enabled   = Column(Boolean, default=False)
    stuck_hours           = Column(Integer, default=1)
    daily_summary_enabled = Column(Boolean, default=False)
    daily_summary_hour    = Column(Integer, default=8)
    fifo_alert_enabled    = Column(Boolean, default=True)
    updated_at            = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RoleConfig(Base):
    __tablename__ = "role_configs"

    id          = Column(Integer, primary_key=True, index=True)
    tenant_id   = Column(String, index=True, nullable=False)
    name        = Column(String, nullable=False)
    label       = Column(String, default="")
    permissions = Column(Text, default="[]")    # ← column is `permissions`, not `features`
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))