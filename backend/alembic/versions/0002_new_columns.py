
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision      = "0002_new_columns"
down_revision = "0001_base_schema"
branch_labels = None
depends_on    = None


def _column_exists(table: str, column: str) -> bool:
    """Return True if the column already exists (idempotency guard)."""
    conn = op.get_bind()
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def _table_exists(table: str) -> bool:
    conn = op.get_bind()
    return inspect(conn).has_table(table)


def upgrade() -> None:
    # ── new columns on trays ─────────────────────────────────────────────────
    # Guard against re-running on a DB where create_all() already added them.
    if not _column_exists("trays", "stage_entered_at"):
        with op.batch_alter_table("trays") as batch_op:
            batch_op.add_column(sa.Column("stage_entered_at", sa.DateTime(), nullable=True))

    if not _column_exists("trays", "last_stuck_alert_at"):
        with op.batch_alter_table("trays") as batch_op:
            batch_op.add_column(sa.Column("last_stuck_alert_at", sa.DateTime(), nullable=True))

    # Back-fill stage_entered_at for FIFO comparison on pre-existing rows.
    op.execute(
        "UPDATE trays SET stage_entered_at = last_updated "
        "WHERE stage_entered_at IS NULL AND last_updated IS NOT NULL"
    )

    # ── password_reset_tokens ────────────────────────────────────────────────
    if not _table_exists("password_reset_tokens"):
        op.create_table(
            "password_reset_tokens",
            sa.Column("id",         sa.Integer(),  primary_key=True, autoincrement=True),
            sa.Column("tenant_id",  sa.String(),   nullable=False),
            sa.Column("username",   sa.String(),   nullable=False),
            sa.Column("token_hash", sa.String(),   nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used",       sa.Boolean(),  server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index(
            "ix_prt_tenant_username",
            "password_reset_tokens",
            ["tenant_id", "username"],
        )


def downgrade() -> None:
    if _table_exists("password_reset_tokens"):
        op.drop_index("ix_prt_tenant_username", table_name="password_reset_tokens")
        op.drop_table("password_reset_tokens")

    if _column_exists("trays", "last_stuck_alert_at"):
        with op.batch_alter_table("trays") as batch_op:
            batch_op.drop_column("last_stuck_alert_at")

    if _column_exists("trays", "stage_entered_at"):
        with op.batch_alter_table("trays") as batch_op:
            batch_op.drop_column("stage_entered_at")