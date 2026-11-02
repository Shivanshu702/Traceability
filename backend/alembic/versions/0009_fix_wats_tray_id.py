"""0009_fix_wats_tray_id

unit_test_results.tray_id was NOT NULL in 0007 but WATS results arrive without a tray
(model/schema treat it as optional). Make it nullable, and backfill the `retests`
counter (previously never populated) from run_number.
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_fix_wats_tray_id"
down_revision = "0008_unit_tracking"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("unit_test_results") as batch:
        batch.alter_column("tray_id", existing_type=sa.String(), nullable=True)
    op.execute("UPDATE unit_test_results SET retests = run_number - 1 WHERE retests = 0 AND run_number > 1")


def downgrade():
    op.execute("UPDATE unit_test_results SET tray_id = '' WHERE tray_id IS NULL")
    with op.batch_alter_table("unit_test_results") as batch:
        batch.alter_column("tray_id", existing_type=sa.String(), nullable=False)
