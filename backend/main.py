"""
main.py
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
from api.auth_routes      import router as auth_router
from api.tray_routes      import router as tray_router
from api.admin_routes     import router as admin_router
from api.analytics_routes import router as analytics_router
from api.export_routes    import router as export_router
from api.pipeline_routes  import router as pipeline_router

ENV = os.getenv("ENV", "production")

# ── Startup / shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app):
    if os.getenv("ENV") != "production":
        # dev/test only: auto-create tables without migrations
        Base.metadata.create_all(bind=engine)
    # production: rely on alembic upgrade head (in start.sh)
    from services.scheduler_service import start_scheduler, stop_scheduler
    start_scheduler()
    yield
    stop_scheduler()


# ── CORS ──────────────────────────────────────────────────────────────────────
_raw = os.getenv("ALLOWED_ORIGINS", "").strip()
if _raw:
    ALLOWED_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()]
else:
    # FIX: Default to localhost only, not "*".
    # In production, always set ALLOWED_ORIGINS to your frontend domain.
    ALLOWED_ORIGINS = ["http://localhost:5173"]


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title     = "FIFO Traceability API",
    version   = "4.1.0",
    lifespan  = lifespan,
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

# ── Routers ───────────────────────────────────────────────────────────────────
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
