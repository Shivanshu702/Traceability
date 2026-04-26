from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mes.db")

_is_sqlite = DATABASE_URL.startswith("sqlite")

# ── Connection arguments ───────────────────────────────────────────────────────

connect_args = {"check_same_thread": False} if _is_sqlite else {}


engine = create_engine(
    DATABASE_URL,
    connect_args  = connect_args,
    pool_size     = int(os.getenv("DB_POOL_SIZE",    "5")),
    max_overflow  = int(os.getenv("DB_MAX_OVERFLOW", "10")),

    pool_pre_ping = True,

    pool_recycle  = int(os.getenv("DB_POOL_RECYCLE", "1800")),
)

# ── Log pool events at DEBUG level (visible when LOG_LEVEL=DEBUG) ──────────────
if not _is_sqlite:
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, connection_record):
        logger.debug("DB pool: new connection opened")

    @event.listens_for(engine, "checkout")
    def _on_checkout(dbapi_conn, connection_record, connection_proxy):
        logger.debug("DB pool: connection checked out")

    @event.listens_for(engine, "checkin")
    def _on_checkin(dbapi_conn, connection_record):
        logger.debug("DB pool: connection returned")


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


# ── Dependency for FastAPI routes ──────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()