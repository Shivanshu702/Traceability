from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from api.routes_with_qr import router

app = FastAPI(title="FIFO Traceability API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://traceability-5juam0rny-shivanshu702s-projects.vercel.app",
                   "https://traceability-git-main-shivanshu702s-projects.vercel.app",
                   "http://localhost:5173"],        # keep for local dev
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app.include_router(router)


@app.get("/")
def root():
    return {"message": "FIFO Traceability API v2.0", "status": "ok"}