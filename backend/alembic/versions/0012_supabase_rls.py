"""0012_supabase_rls

Supabase exposes every table in the `public` schema through its auto-generated REST API
(PostgREST). Tables created by Alembic have Row Level Security OFF, so anyone holding the
project's public "anon" key could read them (including password hashes) — even though this
app never uses that API.

Enabling RLS with NO policies denies the anon/authenticated roles everything. The backend
is unaffected: it connects as the table OWNER, and owners bypass RLS (we never use FORCE).

No-op on any database that is not Supabase (detected by the existence of the `anon` role).
Future tables: re-run this migration's SQL, or create them with RLS enabled.
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_supabase_rls"
down_revision = "0011_scan_performed_by"
branch_labels = None
depends_on = None

_ENABLE = """
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
"""


def _is_supabase(conn) -> bool:
    if conn.dialect.name != "postgresql":
        return False
    return conn.execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = 'anon'")).first() is not None


def upgrade():
    conn = op.get_bind()
    if _is_supabase(conn):
        op.execute(_ENABLE)


def downgrade():
    # Intentionally left enabled: turning RLS off would re-expose the tables.
    pass
