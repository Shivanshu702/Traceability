"""0011_scan_performed_by

scan_events.operator is free text typed on shared shop-floor terminals and can be mistyped
or spoofed. Add `performed_by`: the authenticated login, set server-side from the JWT.
Existing rows are backfilled with their operator value.
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_scan_performed_by"
down_revision = "0010_tenant_scoping"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("scan_events") as b:
        b.add_column(sa.Column("performed_by", sa.String(), nullable=True, server_default=""))
    op.execute("UPDATE scan_events SET performed_by = operator WHERE performed_by IS NULL OR performed_by = ''")


def downgrade():
    with op.batch_alter_table("scan_events") as b:
        b.drop_column("performed_by")
