"""Batch 3: WATS data flow, FPY, shift mapping, child QR labels."""
import asyncio, base64, io, os, sys
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["ENV"] = "test"
os.environ.setdefault("SECRET_KEY", "test-secret")
from database import Base
from models.integration import IntegrationConfig, UnitTestResult
from schemas.integration import UnitTestResultOut
from core.timeutil import shift_for
import services.wats as wats


@pytest.fixture()
def db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng, autoflush=False)()
    yield s
    s.close()


def _raw(i, serial, status, hour=9):
    return {"id": i, "serialNumber": serial, "status": status,
            "started": f"2026-03-02T{hour:02d}:00:00Z", "duration": 30}


def _sync(db, results):
    async def fake(**kw): return results
    wats.fetch_results = fake
    cfg = IntegrationConfig(tenant_id="default", wats_url="http://x", wats_api_key="k")
    db.add(cfg); db.commit()
    return asyncio.run(wats.run_sync(db, cfg)), cfg


def test_sync_same_serial_in_one_batch_gets_sequential_runs(db):
    res, cfg = _sync(db, [_raw(1, "U1", "Failed"), _raw(2, "U1", "Failed"), _raw(3, "U1", "Passed")])
    assert res["errors"] == [] and res["results_created"] == 3
    rows = db.query(UnitTestResult).order_by(UnitTestResult.run_number).all()
    assert [r.run_number for r in rows] == [1, 2, 3]
    assert [r.retests for r in rows] == [0, 1, 2]
    assert [r.is_final_pass for r in rows] == [False, False, True]
    assert all(r.tray_id is None for r in rows)
    assert cfg.wats_last_sync is not None


def test_results_serialise_without_tray(db):
    _sync(db, [_raw(1, "U1", "Passed")])
    r = db.query(UnitTestResult).first()
    out = UnitTestResultOut(id=r.id, unit_serial=r.unit_serial, tray_id=r.tray_id, status=r.status)
    assert out.tray_id is None


def test_cursor_not_advanced_when_errors(db):
    res, cfg = _sync(db, [{"id": 9, "serialNumber": "U9", "status": "Passed", "started": "not-a-date"}])
    assert res["errors"] and cfg.wats_last_sync is None


def test_fpy_counts_only_first_runs(db):
    _sync(db, [_raw(1, "A", "Failed"), _raw(2, "A", "Passed"), _raw(3, "B", "Passed")])
    first = db.query(UnitTestResult).filter(UnitTestResult.run_number == 1)
    assert first.count() == 2 and first.filter(UnitTestResult.status == "PASS").count() == 1   # FPY 50 %


def test_shift_mapping(monkeypatch):
    monkeypatch.delenv("SHIFT_TZ", raising=False)
    t = lambda h: datetime(2026, 3, 2, h, 0, tzinfo=timezone.utc)
    assert (shift_for(t(5)), shift_for(t(6)), shift_for(t(14)), shift_for(t(21)), shift_for(t(22)), shift_for(t(0))) == \
           ("Night", "Morning", "Afternoon", "Afternoon", "Night", "Night")
    monkeypatch.setenv("SHIFT_TZ", "Europe/Warsaw")      # UTC+1 in March
    assert shift_for(t(5)) == "Morning"


def test_create_returns_child_qr_for_split_projects(tmp_path):
    from fastapi.testclient import TestClient
    from database import get_db
    import main
    import api.auth_routes as ar
    from core.rate_limit import limiter
    limiter.enabled = False; ar.ALLOWED_TENANTS = set(); ar.OPEN_REGISTRATION = True
    eng = create_engine(f"sqlite:///{tmp_path/'q.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    S = sessionmaker(bind=eng, autoflush=False)
    def _db():
        d = S()
        try: yield d
        finally: d.close()
    main.app.dependency_overrides[get_db] = _db
    try:
        c = TestClient(main.app)
        c.post("/register", json={"username": "adm", "password": "secret1"})
        tok = c.post("/login", json={"username": "adm", "password": "secret1"}).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        pipe = c.get("/pipeline", headers=h).json()
        split_proj = next((p["id"] for p in pipe.get("projects", [])), "")
        r = c.post("/trays/create", headers=h, json={"trays": [{"id": "TRY-1", "project": split_proj}]}).json()
        t = r["trays"][0]
        assert t["child_qr_a"] and t["child_qr_b"]
        assert len({t["qr_base64"], t["child_qr_a"], t["child_qr_b"]}) == 3   # three DIFFERENT codes
    finally:
        main.app.dependency_overrides.clear()
