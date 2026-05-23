"""0008_unit_tracking

Adds smt_unit_events table and run_number/is_final_pass to unit_test_results.
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_unit_tracking"
down_revision = "0007_integration_tables"

def upgrade():
    op.create_table(
        "smt_unit_events",
        sa.Column("id",           sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("panel_id",     sa.String(),  nullable=False),
        sa.Column("unit_serial",  sa.String(),  nullable=False),
        sa.Column("position",     sa.String(),  nullable=True),
        sa.Column("project_id",   sa.String(),  nullable=True),
        sa.Column("smt_entry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("smt_exit_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sue_panel_id",    "smt_unit_events", ["panel_id"])
    op.create_index("ix_sue_unit_serial", "smt_unit_events", ["unit_serial"])

    op.add_column("unit_test_results",
        sa.Column("run_number",    sa.Integer(), nullable=False, server_default="1"))
    op.add_column("unit_test_results",
        sa.Column("is_final_pass", sa.Boolean(), nullable=False, server_default="0"))

def downgrade():
    op.drop_column("unit_test_results", "is_final_pass")
    op.drop_column("unit_test_results", "run_number")
    op.drop_table("smt_unit_events")