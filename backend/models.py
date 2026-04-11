from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text
from database import Base
from datetime import datetime


class Tray(Base):
    __tablename__ = "trays"

    id              = Column(String, primary_key=True, index=True)
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


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id          = Column(String, primary_key=True)       # UUID string
    tray_id     = Column(String, index=True)
    from_stage  = Column(String, default="")
    stage       = Column(String)                         # to_stage
    operator    = Column(String, default="SYSTEM")
    fifo_flag   = Column(Boolean, default=False)
    note        = Column(Text, default="")
    timestamp   = Column(DateTime, default=datetime.utcnow, index=True)


class User(Base):
    __tablename__ = "users"

    id       = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    role     = Column(String, default="operator")        # "admin" | "operator"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id        = Column(Integer, primary_key=True, index=True)
    username  = Column(String, index=True)
    action    = Column(String)
    details   = Column(String, default="")
    timestamp = Column(DateTime, default=datetime.utcnow)