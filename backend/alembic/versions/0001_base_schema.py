
from alembic import op
import sqlalchemy as sa

revision      = "0001_base_schema"
down_revision = None
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "trays",
        sa.Column("id",              sa.String(),  primary_key=True),
        sa.Column("tenant_id",       sa.String(),  nullable=False, server_default="default"),
        sa.Column("stage",           sa.String(),  server_default="CREATED"),
        sa.Column("is_done",         sa.Boolean(), server_default="0"),
        sa.Column("is_split_parent", sa.Boolean(), server_default="0"),
        sa.Column("parent_id",       sa.String(),  nullable=True),
        sa.Column("project",         sa.String(),  server_default=""),
        sa.Column("shift",           sa.String(),  server_default=""),
        sa.Column("created_by",      sa.String(),  server_default=""),
        sa.Column("batch_no",        sa.String(),  server_default=""),
        sa.Column("total_units",     sa.Integer(), server_default="450"),
        sa.Column("fifo_violated",   sa.Boolean(), server_default="0"),
        sa.Column("created_at",      sa.DateTime(), nullable=True),
        sa.Column("last_updated",    sa.DateTime(), nullable=True),
        sa.Column("completed_at",    sa.DateTime(), nullable=True),
    )
    op.create_index("ix_trays_tenant_id",    "trays", ["tenant_id"])
    op.create_index("ix_trays_stage",        "trays", ["stage"])
    op.create_index("ix_trays_parent_id",    "trays", ["parent_id"])
    op.create_index("ix_trays_project",      "trays", ["project"])
    op.create_index("ix_trays_last_updated", "trays", ["last_updated"])

    op.create_table(
        "scan_events",
        sa.Column("id",         sa.String(),  primary_key=True),
        sa.Column("tenant_id",  sa.String(),  nullable=False, server_default="default"),
        sa.Column("tray_id",    sa.String(),  nullable=True),
        sa.Column("from_stage", sa.String(),  server_default=""),
        sa.Column("stage",      sa.String(),  nullable=True),
        sa.Column("operator",   sa.String(),  server_default="SYSTEM"),
        sa.Column("fifo_flag",  sa.Boolean(), server_default="0"),
        sa.Column("note",       sa.Text(),    server_default=""),
        sa.Column("timestamp",  sa.DateTime(), nullable=True),
    )
    op.create_index("ix_scan_events_tenant_id", "scan_events", ["tenant_id"])
    op.create_index("ix_scan_events_tray_id",   "scan_events", ["tray_id"])
    op.create_index("ix_scan_events_timestamp", "scan_events", ["timestamp"])

    op.create_table(
        "users",
        sa.Column("id",        sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(),  nullable=False, server_default="default"),
        sa.Column("username",  sa.String(),  nullable=True),
        sa.Column("password",  sa.String(),  nullable=True),
        sa.Column("role",      sa.String(),  server_default="operator"),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_index("ix_users_username",  "users", ["username"])

    op.create_table(
        "audit_logs",
        sa.Column("id",        sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(),  nullable=False, server_default="default"),
        sa.Column("username",  sa.String(),  nullable=True),
        sa.Column("action",    sa.String(),  nullable=True),
        sa.Column("details",   sa.String(),  server_default=""),
        sa.Column("timestamp", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    op.create_index("ix_audit_logs_username",  "audit_logs", ["username"])

    op.create_table(
        "pipeline_configs",
        sa.Column("id",         sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id",  sa.String(),  nullable=False, unique=True),
        sa.Column("config",     sa.Text(),    nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_pipeline_configs_tenant_id", "pipeline_configs", ["tenant_id"])

    op.create_table(
        "email_settings",
        sa.Column("id",                    sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id",             sa.String(),  nullable=False, unique=True),
        sa.Column("smtp_host",             sa.String(),  server_default=""),
        sa.Column("smtp_port",             sa.Integer(), server_default="587"),
        sa.Column("smtp_user",             sa.String(),  server_default=""),
        sa.Column("smtp_password",         sa.String(),  server_default=""),
        sa.Column("smtp_use_tls",          sa.Boolean(), server_default="1"),
        sa.Column("from_email",            sa.String(),  server_default=""),
        sa.Column("alert_recipients",      sa.Text(),    server_default=""),
        sa.Column("stuck_alert_enabled",   sa.Boolean(), server_default="0"),
        sa.Column("stuck_hours",           sa.Integer(), server_default="1"),
        sa.Column("daily_summary_enabled", sa.Boolean(), server_default="0"),
        sa.Column("daily_summary_hour",    sa.Integer(), server_default="8"),
        sa.Column("fifo_alert_enabled",    sa.Boolean(), server_default="1"),
        sa.Column("updated_at",            sa.DateTime(), nullable=True),
    )
    op.create_index("ix_email_settings_tenant_id", "email_settings", ["tenant_id"])

    op.create_table(
        "role_configs",
        sa.Column("id",          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id",   sa.String(),  nullable=False),
        sa.Column("name",        sa.String(),  nullable=False),
        sa.Column("label",       sa.String(),  server_default=""),
        sa.Column("permissions", sa.Text(),    server_default="[]"),
        sa.Column("updated_at",  sa.DateTime(), nullable=True),
    )
    op.create_index("ix_role_configs_tenant_id", "role_configs", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("role_configs")
    op.drop_table("email_settings")
    op.drop_table("pipeline_configs")
    op.drop_table("audit_logs")
    op.drop_table("users")
    op.drop_table("scan_events")
    op.drop_table("trays")