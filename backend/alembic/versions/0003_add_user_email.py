
from alembic import op

revision      = "0003_add_user_email"
down_revision = "0002_new_columns"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # Add email column — nullable so existing users are unaffected.
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email")