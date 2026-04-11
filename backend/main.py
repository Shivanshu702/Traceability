from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from api.routes_with_qr import router

app = FastAPI(title="FIFO Traceability API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # temporary — tighten after it works
    allow_credentials=False,  # must be False when using allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app.include_router(router)


@app.get("/")
def root():
    return {"message": "FIFO Traceability API v2.0", "status": "ok"}