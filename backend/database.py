# C:\SHIVANSH\Traceability\backend\database.py

from sqlalchemy import create_engine # type: ignore
from sqlalchemy.orm import sessionmaker, declarative_base # type: ignore

import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mes.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()
