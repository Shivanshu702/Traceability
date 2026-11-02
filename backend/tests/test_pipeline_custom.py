"""Batch 2: customizable pipeline is honoured end to end."""
import pytest
from datetime import datetime, timedelta, timezone
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Tray
from schemas import PipelineConfigIn
from services.pipeline_service import build_default_config, get_stuck_limits, is_terminal_stage
from services.tray_service import advance_tray
from services.analytics_service import detect_bottlenecks, get_analytics


@pytest.fixture()
def db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False})
    from sqlalchemy.pool import StaticPool
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng, autoflush=False)()
    yield s
    s.close()


def _tray(db, id_, stage, age_s=0, **kw):
    t0 = datetime.now(timezone.utc) - timedelta(seconds=age_s)
    t = Tray(id=id_, tenant_id="default", stage=stage, project="", total_units=10,
             stage_entered_at=t0, last_updated=t0, created_at=t0, **kw)
    db.add(t); db.commit()
    return t


def _linear(*ids):
    cfg = build_default_config()
    cfg["stages"] = [{"id": i, "label": i, "next": (ids[n + 1] if n + 1 < len(ids) else None),
                      "stuckLimitSeconds": 60} for n, i in enumerate(ids)]
    cfg["split"]["enabled"] = False
    cfg["branch"]["enabled"] = False
    return cfg


def test_custom_final_stage_completes_tray(db):
    cfg = _linear("A", "B", "FINISHED")
    t = _tray(db, "T1", "A")
    advance_tray(db, t, config=cfg)
    assert not t.is_done and t.stage == "B"
    advance_tray(db, t, config=cfg)
    assert t.stage == "FINISHED" and t.is_done and t.completed_at is not None
    assert "already complete" in advance_tray(db, t, config=cfg)["error"]


def test_legacy_complete_still_terminal():
    assert is_terminal_stage("COMPLETE", build_default_config())


def test_branch_point_is_not_terminal():
    cfg = build_default_config()
    assert not is_terminal_stage(cfg["branch"]["atStage"], cfg)


def test_stuck_limits_follow_config(db, monkeypatch):
    cfg = _linear("A", "FINISHED")
    cfg["stages"][0]["stuckLimitSeconds"] = 120
    monkeypatch.setattr("services.analytics_service.get_pipeline_config", lambda d, t: cfg)
    assert get_stuck_limits(cfg)["A"] == 120
    _tray(db, "OLD", "A", age_s=600)
    _tray(db, "FRESH", "A", age_s=10)
    ids = [b["tray_id"] for b in detect_bottlenecks(db, "default")]
    assert ids == ["OLD"]


def test_analytics_portable_and_correct(db):
    done = _tray(db, "D1", "COMPLETE", age_s=3600, is_done=True)
    done.completed_at = done.created_at + timedelta(seconds=1800); db.commit()
    _tray(db, "W1", "RACK1_TOP")
    r = get_analytics(db, "default")
    assert r["total"] == 2 and r["completed"] == 1 and r["wip"] == 1
    assert r["avg_cycle_time_sec"] == pytest.approx(1800, abs=1)


def _cfg_in(**over):
    d = build_default_config()
    d.update(over)
    return d


def test_validation_rejects_dangling_next():
    d = _cfg_in(stages=[{"id": "A", "label": "A", "next": "NOPE"}, {"id": "Z", "label": "Z", "next": None}],
                split={"enabled": False, "atStage": "A", "resumeAtStage": "Z"},
                branch={"enabled": False, "atStage": "A", "options": [{"id": "X", "label": "X"}]})
    with pytest.raises(ValidationError, match="unknown next stage"):
        PipelineConfigIn(**d)


def test_validation_requires_final_stage():
    d = _cfg_in(stages=[{"id": "A", "label": "A", "next": "B"}, {"id": "B", "label": "B", "next": "A"}],
                split={"enabled": False, "atStage": "A", "resumeAtStage": "B"},
                branch={"enabled": False, "atStage": "A", "options": [{"id": "X", "label": "X"}]})
    with pytest.raises(ValidationError, match="final stage"):
        PipelineConfigIn(**d)


def test_validation_rejects_reserved_and_unknown_project_stage():
    base = dict(split={"enabled": False, "atStage": "A", "resumeAtStage": "Z"},
                branch={"enabled": False, "atStage": "A", "options": [{"id": "X", "label": "X"}]})
    with pytest.raises(ValidationError, match="reserved"):
        PipelineConfigIn(**_cfg_in(stages=[{"id": "SPLIT", "label": "s", "next": None}], **base))
    with pytest.raises(ValidationError, match="unknown stages"):
        PipelineConfigIn(**_cfg_in(
            stages=[{"id": "A", "label": "A", "next": "Z"}, {"id": "Z", "label": "Z", "next": None}],
            projects=[{"id": "P", "label": "P", "stageIds": ["A", "GHOST"]}], **base))


def test_default_config_still_valid():
    PipelineConfigIn(**build_default_config())
