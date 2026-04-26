
import logging
import logging.config
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import Base, engine
from core.rate_limit import limiter

# ── Route modules ──────────────────────────────────────────────────────────────
from api.auth_routes      import router as auth_router
from api.tray_routes      import router as tray_router
from api.admin_routes     import router as admin_router
from api.analytics_routes import router as analytics_router
from api.export_routes    import router as export_router
from api.pipeline_routes  import router as pipeline_router

ENV = os.getenv("ENV", "production")




class _JsonFormatter(logging.Formatter):
    """Single-line JSON formatter for log aggregators."""
    import json as _json

    def format(self, record: logging.LogRecord) -> str:
        import json
        from datetime import datetime, timezone
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level":     record.levelname,
            "logger":    record.name,
            "message":   record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

_LOGGING_CONFIG: dict = {
    "version":            1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": _JsonFormatter,
        },
        "human": {
            "format": "%(asctime)s [%(levelname)-8s] %(name)s — %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class":     "logging.StreamHandler",
            "stream":    "ext://sys.stdout",
            # JSON in production (parseable by log drains); human-readable in dev
            "formatter": "json" if ENV == "production" else "human",
        },
    },
    "loggers": {
        # Application code
        "": {
            "handlers": ["console"],
            "level":    _LOG_LEVEL,
            "propagate": False,
        },
        # SQLAlchemy engine — only emit at WARNING+ by default to avoid noise;
        # set LOG_LEVEL=DEBUG to see every query.
        "sqlalchemy.engine": {
            "handlers":  ["console"],
            "level":     "DEBUG" if _LOG_LEVEL == "DEBUG" else "WARNING",
            "propagate": False,
        },
        # Uvicorn access log — forwarded into our handler so it lands in the
        # same structured stream rather than a separate stderr channel.
        "uvicorn.access": {
            "handlers":  ["console"],
            "level":     "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers":  ["console"],
            "level":     "INFO",
            "propagate": False,
        },
    },
}

logging.config.dictConfig(_LOGGING_CONFIG)
logger = logging.getLogger(__name__)


# ── Startup / shutdown ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("ENV") != "production":
        # dev/test only: auto-create tables without migrations
        Base.metadata.create_all(bind=engine)
    # production: rely on alembic upgrade head (in start.sh)
    from services.scheduler_service import start_scheduler, stop_scheduler
    start_scheduler()
    logger.info("Traceability API started (ENV=%s, LOG_LEVEL=%s)", ENV, _LOG_LEVEL)
    yield
    stop_scheduler()
    logger.info("Traceability API shutting down")


# ── CORS ───────────────────────────────────────────────────────────────────────
_raw = os.getenv("ALLOWED_ORIGINS", "").strip()
if _raw:
    ALLOWED_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()]
else:
    # FIX: Default to localhost only, not "*".
    # In production, always set ALLOWED_ORIGINS to your frontend domain.
    ALLOWED_ORIGINS = ["http://localhost:5173"]


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title    = "FIFO Traceability API",
    version  = "4.2.0",
    lifespan = lifespan,
    # FIX: docs are disabled in production to prevent API enumeration.
    docs_url  = "/docs" if ENV != "production" else None,
    redoc_url = None,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ALLOWED_ORIGINS,
    allow_credentials = ALLOWED_ORIGINS != ["*"],
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)




@app.get("/health", tags=["ops"], include_in_schema=ENV != "production")
def health_check():
    from datetime import datetime, timezone
    checks: dict[str, str] = {}
    healthy = True

    # ── Database ───────────────────────────────────────────────────────────────
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        logger.error("Health check: database unreachable — %s", exc)
        checks["database"] = f"error: {exc}"
        healthy = False

    # ── Redis (optional — only checked when REDIS_URL is configured) ──────────
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        try:
            import redis
            r = redis.from_url(redis_url, socket_connect_timeout=1, decode_responses=True)
            r.ping()
            checks["redis"] = "ok"
        except Exception as exc:
            logger.warning("Health check: Redis unreachable — %s", exc)
            # Redis is cache-only; treat as degraded, not fatal
            checks["redis"] = f"degraded: {exc}"

    payload = {
        "status":    "ok" if healthy else "error",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version":   app.version,
        "checks":    checks,
    }

    if not healthy:
        return JSONResponse(status_code=503, content=payload)
    return payload


# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(pipeline_router)
app.include_router(tray_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(export_router)

# FIX: dev_routes is ONLY registered outside of production.
# In production (ENV=production) the /dev/* endpoints do not exist at all.
if ENV != "production":
    from api.dev_routes import router as dev_router
    app.include_router(dev_router)