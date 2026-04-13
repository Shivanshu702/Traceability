from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from api.routes_with_qr import router


# ── Startup / shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all DB tables (idempotent)
    Base.metadata.create_all(bind=engine)

    # Start background scheduler (stuck alerts + daily summary)
    from services.scheduler_service import start_scheduler, stop_scheduler
    start_scheduler()

    yield   # ← app runs here

    stop_scheduler()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title    = "FIFO Traceability API",
    version  = "3.0.0",
    lifespan = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # tighten to your frontend domain in production
    allow_credentials = False,   # must be False when allow_origins=["*"]
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"message": "FIFO Traceability API v3.0", "status": "ok"}
