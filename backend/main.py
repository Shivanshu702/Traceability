"""
main.py
───────
Application entry point.
Registers all route modules and middleware.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from database import Base, engine
from core.rate_limit import limiter
import os

# ── Route modules ─────────────────────────────────────────────────────────────
from api.auth_routes     import router as auth_router
from api.tray_routes     import router as tray_router
from api.admin_routes    import router as admin_router
from api.analytics_routes import router as analytics_router
from api.export_routes   import router as export_router
from api.pipeline_routes import router as pipeline_router
from api.dev_routes      import router as dev_router


# ── Startup / shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from services.scheduler_service import start_scheduler, stop_scheduler
    start_scheduler()
    yield
    stop_scheduler()


# ── CORS ──────────────────────────────────────────────────────────────────────
_raw = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()] if _raw else ["*"]


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title     = "FIFO Traceability API",
    version   = "4.0.0",
    lifespan  = lifespan,
    docs_url  = "/docs" if os.getenv("ENV", "production") != "production" else None,
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

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(pipeline_router)
app.include_router(tray_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(export_router)
app.include_router(dev_router)


# ── Root + Health ─────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "FIFO Traceability API v4.0", "status": "ok"}


@app.get("/health")
def health():
    """Health check — verifies DB connectivity. Use for uptime monitoring."""
    from database import SessionLocal
    import sqlalchemy
    try:
        db = SessionLocal()
        db.execute(sqlalchemy.text("SELECT 1"))
        db.close()
        return {"status": "healthy", "db": "ok", "version": "4.0.0"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "db": str(e)},
        )


@app.get("/cache/stats")
def cache_stats():
    """
    Cache hit/miss statistics for monitoring.
    Only accessible in dev (docs are disabled in production).
    """
    from core.cache import pipeline_cache, stats_cache, stage_load_cache
    return {
        "pipeline": pipeline_cache.stats,
        "stats":    stats_cache.stats,
        "stage_load": stage_load_cache.stats,
    }
