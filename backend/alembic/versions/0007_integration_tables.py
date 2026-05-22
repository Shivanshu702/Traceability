"""0007_integration_tables

Revision ID: 0007
Revises: 0006
Create Date: 2025-01-01 00:00:00.000000

Adds three tables for the Cogiscan + WATS integration layer:
  - integration_config   (single-row Cogiscan + WATS credentials and toggles)
  - unit_test_results    (per-unit WATS test outcomes)
  - smt_events           (raw Cogiscan panel events — audit trail)
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision  = "0007"
down_revision = "0006"
branch_labels = None
depends_on    = None


def upgrade() -> None:

    # ── integration_config ────────────────────────────────────────────────────
    op.create_table(
        "integration_config",
        sa.Column("id",                  sa.Integer(),  primary_key=True),
        sa.Column("cogiscan_enabled",    sa.Boolean(),  nullable=False, server_default="0"),
        sa.Column("cogiscan_url",        sa.String(),   nullable=False, server_default=""),
        sa.Column("cogiscan_api_key",    sa.String(),   nullable=False, server_default=""),
        sa.Column("cogiscan_poll_sec",   sa.Integer(),  nullable=False, server_default="30"),
        sa.Column("smt_auto_create",     sa.Boolean(),  nullable=False, server_default="0"),
        sa.Column("cogiscan_last_sync",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("wats_enabled",        sa.Boolean(),  nullable=False, server_default="0"),
        sa.Column("wats_url",            sa.String(),   nullable=False, server_default=""),
        sa.Column("wats_api_key",        sa.String(),   nullable=False, server_default=""),
        sa.Column("wats_sync_mode",      sa.String(),   nullable=False, server_default="manual"),
        sa.Column("wats_last_sync",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at",          sa.DateTime(timezone=True), nullable=True),
    )

    # ── unit_test_results ─────────────────────────────────────────────────────
    op.create_table(
        "unit_test_results",
        sa.Column("id",                sa.Integer(),  primary_key=True, autoincrement=True),
        sa.Column("unit_serial",       sa.String(),   nullable=False),
        sa.Column("tray_id",           sa.String(),   nullable=False),
        sa.Column("wats_result_id",    sa.String(),   nullable=True),
        sa.Column("smt_exit_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("test_started_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("test_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status",            sa.String(),   nullable=False),
        sa.Column("failure_code",      sa.String(),   nullable=True),
        sa.Column("failure_step",      sa.String(),   nullable=True),
        sa.Column("test_duration_sec", sa.Integer(),  nullable=True),
        sa.Column("retests",           sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("shift",             sa.String(),   nullable=True),
        sa.Column("operator",          sa.String(),   nullable=True),
        sa.Column("project",           sa.String(),   nullable=True),
        sa.Column("measurements",      sa.JSON(),     nullable=True),
        sa.Column("raw_wats_payload",  sa.JSON(),     nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_utr_unit_serial",  "unit_test_results", ["unit_serial"])
    op.create_index("ix_utr_tray_id",      "unit_test_results", ["tray_id"])
    op.create_index("ix_utr_status",       "unit_test_results", ["status"])
    op.create_index("ix_utr_started_at",   "unit_test_results", ["test_started_at"])

    # ── smt_events ────────────────────────────────────────────────────────────
    op.create_table(
        "smt_events",
        sa.Column("id",                    sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("panel_id",              sa.String(),  nullable=False),
        sa.Column("datamatrix_code",       sa.String(),  nullable=False),
        sa.Column("smt_exit_at",           sa.DateTime(timezone=True), nullable=True),
        sa.Column("unit_count",            sa.Integer(), nullable=True),
        sa.Column("project_id",            sa.String(),  nullable=True),
        sa.Column("tray_id",               sa.String(),  nullable=True),
        sa.Column("processed",             sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("raw_cogiscan_payload",  sa.JSON(),    nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_smt_panel_id",   "smt_events", ["panel_id"])
    op.create_index("ix_smt_datamatrix", "smt_events", ["datamatrix_code"])
    op.create_index("ix_smt_tray_id",    "smt_events", ["tray_id"])


def downgrade() -> None:
    op.drop_table("smt_events")
    op.drop_table("unit_test_results")
    op.drop_table("integration_config")