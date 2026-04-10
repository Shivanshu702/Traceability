from sqlalchemy import Column, String, Boolean, DateTime, Integer
from database import Base
from datetime import datetime

class Tray(Base):
    __tablename__ = "trays"

    id = Column(String, primary_key=True, index=True)
    stage = Column(String, default="CREATED")
    is_done = Column(Boolean, default=False)

    is_split_parent = Column(Boolean, default=False)
    parent_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id = Column(Integer, primary_key=True, index=True)
    tray_id = Column(String)
    stage = Column(String)
    operator = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True)
    password = Column(String)