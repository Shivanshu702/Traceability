"""Add stage_entered_at and last_stuck_alert_at to trays;
create password_reset_tokens table.

Revision ID: 0002_new_columns
Revises: 0001_base_schema
Create Date: 2025-01-01 00:01:00
"""
from alembic import op
import sqlalchemy as sa

revision      = "0002_new_columns"
down_revision = "0001_base_schema"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ── trays: two new columns ───────────────────────────────────────────────
    with op.batch_alter_table("trays") as batch_op:
        batch_op.add_column(
            sa.Column("stage_entered_at",    sa.DateTime(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("last_stuck_alert_at", sa.DateTime(), nullable=True)
        )

    # Back-fill stage_entered_at so FIFO comparisons work on existing rows.
    op.execute(
        "UPDATE trays SET stage_entered_at = last_updated "
        "WHERE stage_entered_at IS NULL AND last_updated IS NOT NULL"
    )

    # ── password_reset_tokens ────────────────────────────────────────────────
    op.create_table(
        "password_reset_tokens",
        sa.Column("id",         sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id",  sa.String(),  nullable=False),
        sa.Column("username",   sa.String(),  nullable=False),
        sa.Column("token_hash", sa.String(),  nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used",       sa.Boolean(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_prt_tenant_username",
        "password_reset_tokens",
        ["tenant_id", "username"],
    )


def downgrade() -> None:
    op.drop_table("password_reset_tokens")

    with op.batch_alter_table("trays") as batch_op:
        batch_op.drop_column("last_stuck_alert_at")
        batch_op.drop_column("stage_entered_at")