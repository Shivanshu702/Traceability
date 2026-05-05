from alembic import op
import sqlalchemy as sa

revision      = "0006_pending_registrations"
down_revision = "0005_fix_smtp_port_default"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "pending_registrations",
        sa.Column("id",            sa.Integer(),  nullable=False),
        sa.Column("tenant_id",     sa.String(),   nullable=False),
        sa.Column("username",      sa.String(),   nullable=False),
        sa.Column("email",         sa.String(),   nullable=False),
        sa.Column("password_hash", sa.String(),   nullable=False),
        sa.Column("otp_hash",      sa.String(),   nullable=False),
        sa.Column("expires_at",    sa.DateTime(), nullable=False),
        sa.Column("created_at",    sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pending_reg_tenant_user", "pending_registrations", ["tenant_id", "username"])


def downgrade() -> None:
    op.drop_index("ix_pending_reg_tenant_user", table_name="pending_registrations")
    op.drop_table("pending_registrations")