"""Tenant isolation: trays, integration config, webhook, SMT/WATS data."""
import os
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["ENV"] = "test"
os.environ.setdefault("SECRET_KEY", "test-secret")


@pytest.fixture()
def env(tmp_path):
    from fastapi.testclient import TestClient
    from database import Base, get_db
    import main, api.auth_routes as ar
    from core.rate_limit import limiter
    limiter.enabled = False
    ar.ALLOWED_TENANTS = {"ACME", "GLOBEX"}; ar.OPEN_REGISTRATION = True
    pg = os.getenv("TEST_DATABASE_URL")          # optional: run the same tests on Postgres
    if pg:
        eng = create_engine(pg)
        Base.metadata.drop_all(eng)
    else:
        eng = create_engine(f"sqlite:///{tmp_path/'t.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    S = sessionmaker(bind=eng, autoflush=False)

    def _db():
        d = S()
        try: yield d
        finally: d.close()

    main.app.dependency_overrides[get_db] = _db
    c = TestClient(main.app)

    def admin(tenant):
        c.post("/register", json={"username": f"adm_{tenant}", "password": "secret1", "tenant_id": tenant})
        r = c.post("/login", json={"username": f"adm_{tenant}", "password": "secret1", "tenant_id": tenant})
        assert r.status_code == 200, r.text
        return {"Authorization": "Bearer " + r.json()["token"]}

    yield c, admin, S
    main.app.dependency_overrides.clear()
    ar.ALLOWED_TENANTS = set()


def test_same_tray_id_in_two_tenants(env):
    c, admin, _ = env
    a, g = admin("ACME"), admin("GLOBEX")
    for h in (a, g):
        r = c.post("/trays/create", json={"trays": [{"id": "TRY-001"}]}, headers=h)
        assert r.status_code == 200, r.text
    # each tenant scans ITS tray; stages evolve independently
    assert c.post("/scan", json={"id": "TRY-001", "operator": "x"}, headers=a).status_code == 200
    ta = c.get("/tray/TRY-001", headers=a).json()
    tg = c.get("/tray/TRY-001", headers=g).json()
    assert ta["stage"] != tg["stage"] and tg["stage"] == "CREATED"
    # history is not mixed
    assert len(c.get("/history/TRY-001", headers=g).json()["history"]
               if isinstance(c.get("/history/TRY-001", headers=g).json(), dict)
               else c.get("/history/TRY-001", headers=g).json()) <= 1


def test_tenant_cannot_see_or_delete_other_tenants_tray(env):
    c, admin, _ = env
    a, g = admin("ACME"), admin("GLOBEX")
    c.post("/trays/create", json={"trays": [{"id": "ONLY-A"}]}, headers=a)
    assert c.get("/tray/ONLY-A", headers=g).status_code == 404
    assert c.delete("/tray/ONLY-A", headers=g).status_code == 404
    assert c.get("/tray/ONLY-A", headers=a).status_code == 200


def test_integration_config_is_per_tenant(env):
    c, admin, _ = env
    a, g = admin("ACME"), admin("GLOBEX")
    c.post("/api/integrations/config", json={"wats_url": "http://acme", "wats_api_key": "AK"}, headers=a)
    ga = c.get("/api/integrations/config", headers=a).json()
    gg = c.get("/api/integrations/config", headers=g).json()
    assert ga["wats_url"] == "http://acme" and ga["wats_api_key_set"] is True
    assert gg["wats_url"] == "" and gg["wats_api_key_set"] is False


def test_webhook_per_tenant_secret_and_isolation(env):
    c, admin, S = env
    a, g = admin("ACME"), admin("GLOBEX")
    for h in (a, g):
        c.post("/api/integrations/config", json={"cogiscan_enabled": True, "smt_auto_create": True}, headers=h)
    sa = c.post("/api/integrations/webhook-secret", headers=a).json()
    sg = c.post("/api/integrations/webhook-secret", headers=g).json()
    assert sa["webhook_url"].endswith("/api/webhooks/cogiscan/ACME") and sa["secret"] != sg["secret"]
    # config never reveals the secret again
    assert "secret" not in c.get("/api/integrations/config", headers=a).json()

    panel = {"panel_id": "P-1", "barcode": "BC1", "unit_count": 2}
    # tenant A's secret does NOT work on tenant B's URL
    assert c.post("/api/webhooks/cogiscan/GLOBEX", json=panel, headers={"X-Webhook-Secret": sa["secret"]}).status_code == 401
    assert c.post("/api/webhooks/cogiscan/NOPE", json=panel, headers={"X-Webhook-Secret": sa["secret"]}).status_code == 401
    assert c.post("/api/webhooks/cogiscan/ACME", json=panel, headers={"X-Webhook-Secret": sa["secret"]}).status_code == 204

    from models.integration import SmtEvent, SmtUnitEvent
    s = S()
    assert s.query(SmtEvent).filter_by(tenant_id="ACME").count() == 1
    assert s.query(SmtEvent).filter_by(tenant_id="GLOBEX").count() == 0
    assert s.query(SmtUnitEvent).filter_by(tenant_id="ACME").count() == 2
    s.close()
    # rotation invalidates the old secret
    new = c.post("/api/integrations/webhook-secret", headers=a).json()["secret"]
    assert c.post("/api/webhooks/cogiscan/ACME", json=panel, headers={"X-Webhook-Secret": sa["secret"]}).status_code == 401
    assert c.post("/api/webhooks/cogiscan/ACME", json=panel, headers={"X-Webhook-Secret": new}).status_code == 204


def test_smt_analytics_are_tenant_scoped(env):
    c, admin, S = env
    a, g = admin("ACME"), admin("GLOBEX")
    from models.integration import UnitTestResult, SmtUnitEvent
    now = datetime.now(timezone.utc)
    s = S()
    s.add(UnitTestResult(tenant_id="ACME", unit_serial="U1", status="PASS", run_number=1, retests=0,
                         test_started_at=now, is_final_pass=True))
    s.add(UnitTestResult(tenant_id="GLOBEX", unit_serial="U1", status="FAIL", run_number=1, retests=0,
                         test_started_at=now))
    s.add(SmtUnitEvent(tenant_id="ACME", panel_id="P", unit_serial="U1"))
    s.commit(); s.close()

    sa = c.get("/api/analytics/smt-summary", headers=a).json()
    sg = c.get("/api/analytics/smt-summary", headers=g).json()
    assert (sa["fpy_total"], sa["fpy_pass"]) == (1, 1)
    assert (sg["fpy_total"], sg["fpy_pass"]) == (1, 0)
    assert len(c.get("/api/analytics/unit-results", headers=a).json()) == 1
    ja, jg = c.get("/api/analytics/unit-journey", headers=a).json(), c.get("/api/analytics/unit-journey", headers=g).json()
    assert len(ja) == 1 and ja[0]["total_runs"] == 1 and jg == []


def test_every_read_endpoint_runs(env):
    """Smoke test: all analytics/read endpoints execute without SQL errors on this database."""
    c, admin, S = env
    h = admin("ACME")
    c.post("/trays/create", json={"trays": [{"id": "S-1"}, {"id": "S-2"}]}, headers=h)
    c.post("/scan", json={"id": "S-1", "operator": "op"}, headers=h)
    for path in ["/trays", "/stats", "/alerts", "/stage-load", "/analytics", "/analytics/operators",
                 "/analytics/weekly", "/audit-log", "/scan-log", "/export/trays", "/export/scan-log",
                 "/api/analytics/smt-summary", "/api/analytics/yield", "/api/analytics/cycle-time",
                 "/api/analytics/unit-results", "/api/analytics/unit-journey",
                 "/api/analytics/unit-journey/export", "/pipeline", "/me"]:
        r = c.get(path, headers=h)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
