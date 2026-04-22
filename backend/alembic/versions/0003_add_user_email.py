"""Add email column to users table.

Users often have non-email usernames (e.g. "garg", "SHIVANSH").
This migration adds a separate email column so password reset emails
have a destination address regardless of what the username is.

Admin sets the email when creating a user via the Admin → Users panel.
Users can update their own email (future feature).

Revision ID: 0003_add_user_email
Revises: 0002_new_columns
Create Date: 2025-01-01 00:02:00
"""
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