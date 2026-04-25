
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from core.auth import get_current_user, tenant
from core.cache import pipeline_cache
from services.pipeline_service import get_pipeline_config

router = APIRouter(tags=["pipeline"])


@router.get("/pipeline")
def get_pipeline(
    user: dict    = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    tid       = tenant(user)
    cache_key = f"pipeline:{tid}"
    cached    = pipeline_cache.get(cache_key)
    if cached:
        return cached

    cfg = get_pipeline_config(db, tid)
    result = {
        "stages":         cfg.get("stages", []),
        "stage_colors":   {s["id"]: s.get("color", "#888780") for s in cfg.get("stages", [])},
        "branch_options": cfg.get("branch", {}).get("options", []),
        "projects":       cfg.get("projects", []),
        "split":          cfg.get("split", {}),
        "branch":         cfg.get("branch", {}),
    }
    pipeline_cache.set(cache_key, result)
    return result
