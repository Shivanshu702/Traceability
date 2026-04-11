from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from api.routes import router

app = FastAPI(title="FIFO Traceability API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # tighten to your Vercel URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app.include_router(router)


@app.get("/")
def root():
    return {"message": "FIFO Traceability API v2.0", "status": "ok"}