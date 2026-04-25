
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Make sure the backend package is importable when running `alembic` CLI.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import Base   # noqa: E402  (must be after sys.path insert)
import models               # noqa: F401  (registers all ORM models with Base.metadata)

config       = context.config
target_metadata = Base.metadata

# Read DATABASE_URL from environment (same as the app).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mes.db")

if config.config_file_name:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    context.configure(
        url                      = DATABASE_URL,
        target_metadata          = target_metadata,
        literal_binds            = True,
        dialect_opts             = {"paramstyle": "named"},
        compare_type             = True,
        render_as_batch          = True,   # required for SQLite ALTER TABLE support
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = DATABASE_URL

    connectable = engine_from_config(
        cfg,
        prefix         = "sqlalchemy.",
        poolclass      = pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection      = connection,
            target_metadata = target_metadata,
            compare_type    = True,
            render_as_batch = True,   # required for SQLite ALTER TABLE support
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()