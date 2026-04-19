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
    # Use raw SQL with IF NOT EXISTS — safe regardless of what create_all()
    # already created on this database.

    # ── new columns on trays ─────────────────────────────────────────────────
    op.execute(
        "ALTER TABLE trays ADD COLUMN IF NOT EXISTS "
        "stage_entered_at TIMESTAMP WITHOUT TIME ZONE"
    )
    op.execute(
        "ALTER TABLE trays ADD COLUMN IF NOT EXISTS "
        "last_stuck_alert_at TIMESTAMP WITHOUT TIME ZONE"
    )

    # Back-fill stage_entered_at so FIFO comparisons work on existing rows.
    op.execute(
        "UPDATE trays SET stage_entered_at = last_updated "
        "WHERE stage_entered_at IS NULL AND last_updated IS NOT NULL"
    )

    # ── password_reset_tokens ────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id         SERIAL PRIMARY KEY,
            tenant_id  VARCHAR NOT NULL,
            username   VARCHAR NOT NULL,
            token_hash VARCHAR NOT NULL UNIQUE,
            expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            used       BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITHOUT TIME ZONE
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_prt_tenant_username "
        "ON password_reset_tokens (tenant_id, username)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS password_reset_tokens")
    op.execute("ALTER TABLE trays DROP COLUMN IF EXISTS last_stuck_alert_at")
    op.execute("ALTER TABLE trays DROP COLUMN IF EXISTS stage_entered_at")