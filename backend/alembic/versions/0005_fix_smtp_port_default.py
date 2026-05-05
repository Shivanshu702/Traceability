from alembic import op

revision      = "0005_fix_smtp_port_default"
down_revision = "0004_unique_username"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("UPDATE email_settings SET smtp_port = 465 WHERE smtp_port = 587")


def downgrade() -> None:
    op.execute("UPDATE email_settings SET smtp_port = 587 WHERE smtp_port = 465")