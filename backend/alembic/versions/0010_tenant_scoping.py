"""0010_tenant_scoping

Close the multi-tenancy gaps:

  * trays: primary key (id)  ->  (tenant_id, id). Two organisations can now both use "TRY-001".
  * integration_config: one row PER TENANT (tenant_id, unique) + hashed webhook secret.
  * unit_test_results / smt_events / smt_unit_events: tenant_id column.

Existing integration rows belong to a single organisation by construction (the old tables had
no tenant column). They are assigned to the only tenant that has users; if there are several,
to "default". Re-assign manually afterwards if that guess is wrong:
    UPDATE integration_config SET tenant_id='ACME' WHERE tenant_id='default';
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_tenant_scoping"
down_revision = "0009_fix_wats_tray_id"
branch_labels = None
depends_on = None

_TENANT_TABLES = ["unit_test_results", "smt_events", "smt_unit_events"]


def _owner_tenant(conn) -> str:
    rows = conn.execute(sa.text("SELECT DISTINCT tenant_id FROM users")).fetchall()
    return rows[0][0] if len(rows) == 1 else "default"


def upgrade():
    conn   = op.get_bind()
    owner  = _owner_tenant(conn)

    # ── trays: composite primary key ──────────────────────────────────────────
    if conn.dialect.name == "sqlite":
        # SQLite cannot ALTER a primary key: rebuild the table. (SQLAlchemy emits a harmless
        # warning here about the old PK flag; the resulting table is correct — verified.)
        with op.batch_alter_table("trays", recreate="always") as b:
            b.create_primary_key("pk_trays", ["tenant_id", "id"])
    else:
        op.drop_constraint("trays_pkey", "trays", type_="primary")
        op.create_primary_key("pk_trays", "trays", ["tenant_id", "id"])

    # ── integration_config: one row per tenant ────────────────────────────────
    with op.batch_alter_table("integration_config") as b:
        b.add_column(sa.Column("tenant_id", sa.String(), nullable=True))
        b.add_column(sa.Column("webhook_secret_hash", sa.String(), nullable=True))
    conn.execute(sa.text("UPDATE integration_config SET tenant_id = :t WHERE tenant_id IS NULL"), {"t": owner})
    with op.batch_alter_table("integration_config") as b:
        b.alter_column("tenant_id", existing_type=sa.String(), nullable=False)
        b.create_index("ix_integration_config_tenant_id", ["tenant_id"], unique=True)

    # ── per-tenant data tables ────────────────────────────────────────────────
    for table in _TENANT_TABLES:
        with op.batch_alter_table(table) as b:
            b.add_column(sa.Column("tenant_id", sa.String(), nullable=True))
        conn.execute(sa.text(f"UPDATE {table} SET tenant_id = :t WHERE tenant_id IS NULL"), {"t": owner})
        with op.batch_alter_table(table) as b:
            b.alter_column("tenant_id", existing_type=sa.String(), nullable=False)
            b.create_index(f"ix_{table}_tenant_id", ["tenant_id"])


def downgrade():
    conn = op.get_bind()
    for table in _TENANT_TABLES:
        with op.batch_alter_table(table) as b:
            b.drop_index(f"ix_{table}_tenant_id")
            b.drop_column("tenant_id")
    with op.batch_alter_table("integration_config") as b:
        b.drop_index("ix_integration_config_tenant_id")
        b.drop_column("webhook_secret_hash")
        b.drop_column("tenant_id")

    # Going back to a global primary key is only possible if ids are unique across tenants.
    dup = conn.execute(sa.text("SELECT id FROM trays GROUP BY id HAVING COUNT(*) > 1 LIMIT 1")).fetchone()
    if dup:
        raise RuntimeError(f"Cannot downgrade: tray id '{dup[0]}' exists in several tenants")
    if conn.dialect.name == "sqlite":
        with op.batch_alter_table("trays", recreate="always") as b:
            b.create_primary_key("pk_trays_old", ["id"])
    else:
        op.drop_constraint("pk_trays", "trays", type_="primary")
        op.create_primary_key("trays_pkey", "trays", ["id"])
