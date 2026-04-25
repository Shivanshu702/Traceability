
import json
from sqlalchemy.orm import Session
from models import PipelineConfig
from core.stages import (
    STAGES, STAGE_COLORS, SCAN_ACTIONS, STAGE_STUCK_LIMITS,
    SPLIT_STAGE, SPLIT_NEXT_STAGE, BRANCH_STAGE, BRANCH_OPTIONS, PROJECTS,
)
from datetime import datetime


# ── Default config builder ────────────────────────────────────────────────────

def build_default_config() -> dict:
    """Build a full pipeline config dict from hardcoded constants.
    This is returned when no custom config has been saved for the tenant."""
    branch_ids = {b["id"] for b in BRANCH_OPTIONS}
    main_stages = [s for s in STAGES if s["id"] not in branch_ids]

    return {
        "tray": {
            "idPrefix":    "TRY",
            "unitsPerTray": 450,
        },
        "projects": [
            {
                "id":           p["id"],
                "label":        p["label"],
                "panels":       p["panels"],
                "unitsPerPanel": p["unitsPerPanel"],
                "unitsPerTray": p["panels"] * p["unitsPerPanel"],
                # Per-project overrides — empty = use global pipeline
                "stageIds":       [],         # [] means use all global stages
                "splitOverride":  "inherit",  # "inherit" | "enabled" | "disabled"
                "branchOverride": "inherit",  # "inherit" | "enabled" | "disabled" | "custom"
                "branchOptions":  [],         # used only when branchOverride == "custom"
            }
            for p in PROJECTS
        ],
        "stages": [
            {
                "id":               s["id"],
                "label":            s["label"],
                "color":            STAGE_COLORS.get(s["id"], "#888780"),
                "next":             s.get("next"),
                "scanNote":         SCAN_ACTIONS.get(s["id"], ""),
                "stuckLimitSeconds": STAGE_STUCK_LIMITS.get(s["id"], 3600),
            }
            for s in main_stages
        ],
        "split": {
            "enabled":        True,
            "atStage":        SPLIT_STAGE,
            "resumeAtStage":  SPLIT_NEXT_STAGE,
        },
        "branch": {
            "enabled": True,
            "atStage": BRANCH_STAGE,
            "options": [
                {
                    "id":    b["id"],
                    "label": b["label"],
                    "icon":  b["icon"],
                    "color": STAGE_COLORS.get(b["id"], "#888780"),
                    "next":  next(
                        (s.get("next") for s in STAGES if s["id"] == b["id"]), None
                    ),
                    "scanNote": SCAN_ACTIONS.get(b["id"], ""),
                }
                for b in BRANCH_OPTIONS
            ],
        },
    }


# ── DB load / save ────────────────────────────────────────────────────────────

def get_pipeline_config(db: Session, tenant_id: str = "default") -> dict:
    """Load pipeline config from DB; fall back to hardcoded defaults."""
    row = db.query(PipelineConfig).filter(
        PipelineConfig.tenant_id == tenant_id
    ).first()

    if row and row.config:
        try:
            return json.loads(row.config)
        except (json.JSONDecodeError, TypeError):
            pass

    return build_default_config()


def save_pipeline_config(db: Session, tenant_id: str, config: dict) -> dict:
    """Persist a pipeline config to the DB for a tenant."""
    row = db.query(PipelineConfig).filter(
        PipelineConfig.tenant_id == tenant_id
    ).first()

    json_str = json.dumps(config, ensure_ascii=False)

    if row:
        row.config     = json_str
        row.updated_at = datetime.utcnow()
    else:
        row = PipelineConfig(tenant_id=tenant_id, config=json_str)
        db.add(row)

    db.commit()
    return config


# ── Per-project helpers ───────────────────────────────────────────────────────

def get_effective_stages(project_id: str | None, config: dict) -> list:
    """Return the ordered stage list for a project.
    If the project has a non-empty stageIds override, only those stages
    are returned and their `next` pointers are recomputed from the list order."""
    all_stages = config.get("stages", [])

    if not project_id:
        return all_stages

    for proj in config.get("projects", []):
        if proj["id"] == project_id:
            stage_ids = proj.get("stageIds") or []
            if not stage_ids:
                return all_stages                    # no override → use global

            stage_map = {s["id"]: s for s in all_stages}
            filtered  = []
            for i, sid in enumerate(stage_ids):
                if sid not in stage_map:
                    continue
                s = dict(stage_map[sid])             # shallow copy to avoid mutating global
                s["next"] = stage_ids[i + 1] if i + 1 < len(stage_ids) else None
                filtered.append(s)
            return filtered

    return all_stages


def get_stage_def(stage_id: str, config: dict, project_id: str | None = None) -> dict | None:
    """Look up a stage by ID (checks project-specific stages first, then branch options)."""
    stages = get_effective_stages(project_id, config) if project_id else config.get("stages", [])

    for s in stages:
        if s["id"] == stage_id:
            return s

    # Branch options are global (not project-overridable at the stage-def level)
    for b in config.get("branch", {}).get("options", []):
        if b["id"] == stage_id:
            return b

    return None


def get_branch_options(project_id: str | None, config: dict) -> list:
    """Return branch options for a project, respecting per-project overrides."""
    branch_cfg = config.get("branch", {})
    if not branch_cfg.get("enabled"):
        return []

    global_options = branch_cfg.get("options", [])

    if not project_id:
        return global_options

    for proj in config.get("projects", []):
        if proj["id"] == project_id:
            override = proj.get("branchOverride", "inherit")
            if override == "disabled":
                return []
            if override == "custom":
                custom = proj.get("branchOptions") or []
                return custom if custom else global_options
            # "enabled" | "inherit" → global options
            return global_options

    return global_options


def is_split_enabled(project_id: str | None, config: dict) -> bool:
    """Check whether the split is active for a given project."""
    global_enabled = config.get("split", {}).get("enabled", True)

    if not project_id:
        return global_enabled

    for proj in config.get("projects", []):
        if proj["id"] == project_id:
            override = proj.get("splitOverride", "inherit")
            if override == "enabled":
                return True
            if override == "disabled":
                return False
            return global_enabled   # "inherit"

    return global_enabled


def get_units_for_project_cfg(project_id: str, config: dict) -> int:
    """Return total units per tray for a project from the pipeline config."""
    for proj in config.get("projects", []):
        if proj["id"] == project_id:
            return proj.get("unitsPerTray") or (
                (proj.get("panels", 50)) * (proj.get("unitsPerPanel", 9))
            )
    return config.get("tray", {}).get("unitsPerTray", 450)
