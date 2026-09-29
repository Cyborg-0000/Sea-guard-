from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.session import engine, Base
from api.router import router as api_router

from fastapi.staticfiles import StaticFiles
import os

# Create all tables in the engine.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MarineGuard AI API",
    description="API for MarineGuard AI - Maritime Oil Spill Detection & Vessel Attribution",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For MVP, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

hist_path = os.path.join(os.path.dirname(__file__), "..", "data", "historical")
if os.path.exists(hist_path):
    app.mount("/api/historical", StaticFiles(directory=hist_path), name="historical")

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

