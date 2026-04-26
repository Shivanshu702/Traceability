
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision      = "0004_unique_username"
down_revision = "0003_add_user_email"
branch_labels = None
depends_on    = None


def _constraint_exists(table: str, constraint_name: str) -> bool:
    """Check if a named unique constraint already exists (idempotency guard)."""
    conn = op.get_bind()
    try:
        ucs = inspect(conn).get_unique_constraints(table)
        return any(uc["name"] == constraint_name for uc in ucs)
    except Exception:
        return False


def upgrade() -> None:
    constraint_name = "uq_users_tenant_username"

    if _constraint_exists("users", constraint_name):
        return   


    with op.batch_alter_table("users") as batch_op:
        batch_op.create_unique_constraint(
            constraint_name,
            ["tenant_id", "username"],
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("uq_users_tenant_username", type_="unique")