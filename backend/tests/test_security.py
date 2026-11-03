"""Security regression tests (batch 1)."""
import os, sys, importlib
import pytest

os.environ["ENV"] = "test"
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ["DATABASE_URL"] = "sqlite:////tmp/mes_security_test.db"
os.environ["COGISCAN_WEBHOOK_SECRET"] = "s3cret"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture()
def client(tmp_path):
    """Isolated app + fresh SQLite file per test (overrides get_db)."""
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from database import Base, get_db
    import main
    from core.rate_limit import limiter
    limiter.enabled = False
    import api.auth_routes as ar
    ar.ALLOWED_TENANTS = set()          # other tests reload this module with an allow-list
    ar.OPEN_REGISTRATION = True
    eng = create_engine(f"sqlite:///{tmp_path/'t.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng, autocommit=False, autoflush=False)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = _db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _login(c, u, p):
    r = c.post("/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_register_cannot_self_assign_admin(client):
    client.post("/register", json={"username": "first", "password": "secret1"})      # becomes admin
    r = client.post("/register", json={"username": "evil", "password": "secret1", "role": "admin"})
    assert r.status_code == 200 and r.json()["role"] == "operator"


def test_otp_register_validates_tenant(client, monkeypatch):
    import api.auth_routes as ar
    monkeypatch.setattr(ar, "ALLOWED_TENANTS", {"ACME"})
    r = client.post("/register/send-otp", json={
        "username": "x", "email": "x@y.z", "password": "secret1",
        "confirm_password": "secret1", "tenant_id": "EVILCORP"})
    assert r.status_code == 403


def test_secrets_not_returned(client):
    client.post("/register", json={"username": "admin", "password": "secret1"})
    h = _login(client, "admin", "secret1")
    client.put("/admin/email-settings", json={"smtp_password": "hunter2"}, headers=h)
    g = client.get("/admin/email-settings", headers=h).json()
    assert g["smtp_password"] == "" and g["smtp_password_set"] is True
    # empty password on save must not wipe the stored one
    client.put("/admin/email-settings", json={"smtp_password": "", "smtp_host": "h"}, headers=h)
    assert client.get("/admin/email-settings", headers=h).json()["smtp_password_set"] is True

    client.post("/api/integrations/config", json={"wats_api_key": "KEY123"}, headers=h)
    cfg = client.get("/api/integrations/config", headers=h).json()
    assert cfg["wats_api_key"] == "" and cfg["wats_api_key_set"] is True


def test_webhook_requires_secret(client):
    client.post("/register", json={"username": "admin", "password": "secret1"})
    h = _login(client, "admin", "secret1")
    client.get("/api/integrations/config", headers=h)          # creates the tenant's config row
    assert client.post("/api/webhooks/cogiscan", json={}).status_code == 401
    assert client.post("/api/webhooks/cogiscan", json={}, headers={"X-Webhook-Secret": "bad"}).status_code == 401
    # legacy global secret still works for the "default" tenant only
    assert client.post("/api/webhooks/cogiscan", json={}, headers={"X-Webhook-Secret": "s3cret"}).status_code == 204


def test_last_admin_and_self_delete_protected(client):
    client.post("/register", json={"username": "admin", "password": "secret1"})
    h = _login(client, "admin", "secret1")
    assert client.delete("/admin/users/admin", headers=h).status_code == 400
    assert client.put("/admin/users/admin/role", json={"role": "operator"}, headers=h).status_code == 400
    assert client.put("/admin/users/admin/role", json={"role": "nonsense"}, headers=h).status_code == 400


def test_dev_routes_absent_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("ENABLE_DEV_ROUTES", raising=False)
    for m in ("main", "core.auth"):
        sys.modules.pop(m, None)
    monkeypatch.setenv("SECRET_KEY", "x")
    import main
    from fastapi.testclient import TestClient
    assert TestClient(main.app).post("/dev/auth", json={"dev_key": "a"}).status_code == 404
    sys.modules.pop("main", None)
    sys.modules.pop("core.auth", None)


def test_production_refuses_default_secret(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    sys.modules.pop("core.auth", None)
    with pytest.raises(RuntimeError):
        importlib.import_module("core.auth")
    monkeypatch.setenv("SECRET_KEY", "x")
    sys.modules.pop("core.auth", None)


# ── OPEN_REGISTRATION=false must close EVERY registration path ──────────────────

def test_closed_registration_allows_only_first_admin(client, monkeypatch):
    import api.auth_routes as ar
    monkeypatch.setattr(ar, "OPEN_REGISTRATION", False)
    otp_body = lambda u: {"username": u, "email": f"{u}@x.com", "password": "secret1",
                          "confirm_password": "secret1"}
    # fresh database: the first account (admin) can be created through the UI's flow
    r1 = client.post("/register/send-otp", json=otp_body("boss"))
    assert r1.status_code == 200, r1.text
    h = _login(client, "boss", "secret1")
    assert client.get("/me", headers=h).json()["role"] == "admin"
    # afterwards, no self-registration on any endpoint
    assert client.post("/register/send-otp", json=otp_body("intruder")).status_code == 403
    assert client.post("/register", json={"username": "intruder2", "password": "secret1"}).status_code == 403
    # admins can still create users
    assert client.post("/admin/users", json={"username": "op", "password": "secret1", "role": "operator"},
                       headers=h).status_code in (200, 201)
