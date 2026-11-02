"""Batch 5: branch info from the server + pipeline orphan guard."""
import os
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["ENV"] = "test"
os.environ.setdefault("SECRET_KEY", "test-secret")


@pytest.fixture()
def api(tmp_path):
    from fastapi.testclient import TestClient
    from database import Base, get_db
    from models import Tray
    import main, api.auth_routes as ar
    from core.rate_limit import limiter
    limiter.enabled = False; ar.ALLOWED_TENANTS = set(); ar.OPEN_REGISTRATION = True
    eng = create_engine(f"sqlite:///{tmp_path/'b.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    S = sessionmaker(bind=eng, autoflush=False)

    def _db():
        d = S()
        try: yield d
        finally: d.close()

    main.app.dependency_overrides[get_db] = _db
    c = TestClient(main.app)
    c.post("/register", json={"username": "adm", "password": "secret1"})
    h = {"Authorization": "Bearer " + c.post("/login", json={"username": "adm", "password": "secret1"}).json()["token"]}

    def add_tray(id_, stage, project="", **kw):
        now = datetime.now(timezone.utc)
        fields = dict(id=id_, tenant_id="default", stage=stage, project=project, total_units=10,
                      created_at=now, last_updated=now, stage_entered_at=now)
        fields.update(kw)
        s = S(); s.add(Tray(**fields)); s.commit(); s.close()

    yield c, h, add_tray
    main.app.dependency_overrides.clear()


def test_tray_reports_branch_options_only_at_branch_point(api):
    c, h, add = api
    cfg = c.get("/admin/pipeline-config", headers=h).json()
    at = cfg["branch"]["atStage"]
    add("AT1", at); add("EARLY", "CREATED")
    t = c.get("/tray/AT1", headers=h).json()
    assert t["is_branch_point"] is True
    assert [o["id"] for o in t["branch_options"]] == [o["id"] for o in cfg["branch"]["options"]]
    e = c.get("/tray/EARLY", headers=h).json()
    assert e["is_branch_point"] is False and e["branch_options"] == []


def test_pipeline_colors_include_branch_options(api):
    c, h, _ = api
    p = c.get("/pipeline", headers=h).json()
    for o in p["branch"]["options"]:
        assert o["id"] in p["stage_colors"]


def test_cannot_delete_stage_holding_trays(api):
    c, h, add = api
    cfg = c.get("/admin/pipeline-config", headers=h).json()
    add("ST1", "TESTING")
    cfg["stages"] = [s for s in cfg["stages"] if s["id"] != "TESTING"]
    for s in cfg["stages"]:
        if s.get("next") == "TESTING":
            s["next"] = "COMPLETE"
    r = c.put("/admin/pipeline-config", json=cfg, headers=h)
    assert r.status_code == 409 and "TESTING" in r.json()["detail"]
    assert c.put("/admin/pipeline-config?force=true", json=cfg, headers=h).status_code == 200


def test_unused_stage_can_be_removed(api):
    c, h, _ = api
    cfg = c.get("/admin/pipeline-config", headers=h).json()
    cfg["stages"] = [s for s in cfg["stages"] if s["id"] != "TESTING"]
    for s in cfg["stages"]:
        if s.get("next") == "TESTING":
            s["next"] = "COMPLETE"
    assert c.put("/admin/pipeline-config", json=cfg, headers=h).status_code == 200


# ── Role permissions ──────────────────────────────────────────────────────────

def _make_user(c, h, name, role):
    assert c.post("/admin/users", json={"username": name, "password": "secret1", "role": role}, headers=h).status_code in (200, 201)
    tok = c.post("/login", json={"username": name, "password": "secret1"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_operator_defaults_and_me(api):
    c, h, _ = api
    op = _make_user(c, h, "op1", "operator")
    me = c.get("/me", headers=op).json()
    assert set(me["permissions"]) == {"scan", "create_trays", "history", "dashboard"}
    assert c.get("/stats", headers=op).status_code == 200
    assert c.get("/alerts", headers=op).status_code == 403
    assert c.get("/export/trays", headers=op).status_code == 403
    assert c.get("/admin/users", headers=op).status_code == 403


def test_custom_role_permissions_enforced(api):
    c, h, add = api
    assert c.post("/admin/roles", json={"name": "viewer", "label": "Read-only viewer",
                                        "permissions": ["dashboard", "history", "bogus"]}, headers=h).status_code == 200
    roles = {r["name"]: r for r in c.get("/admin/roles", headers=h).json()}
    assert roles["viewer"]["label"] == "Read-only viewer" and roles["viewer"]["permissions"] == ["dashboard", "history"]
    v = _make_user(c, h, "vera", "viewer")
    add("V1", "CREATED")
    assert c.get("/stats", headers=v).status_code == 200
    assert c.post("/scan", json={"id": "V1", "operator": "x"}, headers=v).status_code == 403
    assert c.post("/trays/create", json={"trays": [{"id": "N1"}]}, headers=v).status_code == 403
    assert c.get("/history/V1", headers=v).status_code == 200
    # granting a feature takes effect immediately
    c.put("/admin/roles/viewer", json={"permissions": ["dashboard", "history", "scan"]}, headers=h)
    assert c.post("/scan", json={"id": "V1", "operator": "x"}, headers=v).status_code == 200


def test_cannot_delete_role_in_use_or_create_admin_role(api):
    c, h, _ = api
    c.post("/admin/roles", json={"name": "qa", "permissions": ["history"]}, headers=h)
    _make_user(c, h, "quinn", "qa")
    assert c.delete("/admin/roles/qa", headers=h).status_code == 409
    assert c.post("/admin/roles", json={"name": "Admin", "permissions": []}, headers=h).status_code == 400


# ── Batch 7: performed_by + stuck_count project filter ─────────────────────────

def test_scan_records_login_even_when_operator_is_typed(api):
    c, h, add = api
    add("PB1", "CREATED")
    assert c.post("/scan", json={"id": "PB1", "operator": "  Someone Else  "}, headers=h).status_code == 200
    ev = c.get("/history/PB1", headers=h).json()[-1]
    assert ev["operator"] == "Someone Else"          # typed name kept (shared terminals)
    assert ev["performed_by"] == "adm"               # real login, set from the token


def test_stuck_count_respects_project(api):
    c, h, add = api
    from datetime import timedelta
    import models
    old = datetime.now(timezone.utc) - timedelta(days=3)
    add("SA", "RACK1_TOP", project="P_A", stage_entered_at=old)
    add("SB", "RACK1_TOP", project="P_B", stage_entered_at=old)
    assert c.get("/stats", headers=h).json()["stuck_count"] == 2
    assert c.get("/stats?project=P_A", headers=h).json()["stuck_count"] == 1
