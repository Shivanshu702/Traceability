from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision      = "0003_add_user_email"
down_revision = "0002_new_columns"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # SQLite does not support ADD COLUMN IF NOT EXISTS — check manually first
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns("users")]
    if "email" not in columns:
        op.add_column("users", sa.Column("email", sa.String(), nullable=True))


def downgrade() -> None:
    # SQLite does not support DROP COLUMN IF EXISTS either
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns("users")]
    if "email" in columns:
        op.drop_column("users", "email")
        