
import sys
import os

# Ensure the backend package root is on the path when running pytest from repo root.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base


@pytest.fixture()
def db():
    """Fresh in-memory SQLite session per test. Auto-rolls back on teardown."""
    engine  = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture()
def default_pipeline():
    """Return the default pipeline config for use in service calls."""
    from services.pipeline_service import build_default_config
    return build_default_config()