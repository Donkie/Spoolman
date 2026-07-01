"""DB-level ON DELETE CASCADE for the extra-field tables.

The vendor_field/filament_field/spool_field foreign keys were created without
ondelete, so orphan cleanup relied entirely on the ORM relationship cascade.
Direct SQL deletes (or any future code path that bypasses the ORM) would either
fail on the FK or leave orphaned field rows, depending on dialect. This adds
the cascade at the database level as defense-in-depth.

Revision ID: e7a41c9d2b53
Revises: c3a7f2e8b091
Create Date: 2026-07-01 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "e7a41c9d2b53"
down_revision = "c3a7f2e8b091"
branch_labels = None
depends_on = None

FIELD_TABLES = (
    ("vendor_field", "vendor_id", "vendor"),
    ("filament_field", "filament_id", "filament"),
    ("spool_field", "spool_id", "spool"),
)

# The original FKs are unnamed; on SQLite the batch rebuild needs a naming
# convention so the reflected constraint gets a predictable, droppable name.
NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def _fk_name(table: str, column: str, reftable: str) -> str:
    return f"fk_{table}_{column}_{reftable}"


def _existing_fk_name(table: str, column: str) -> str | None:
    inspector = sa.inspect(op.get_bind())
    for fk in inspector.get_foreign_keys(table):
        if fk["constrained_columns"] == [column]:
            return fk["name"]
    return None


def _recreate_fks(*, ondelete: str | None) -> None:
    dialect = op.get_bind().dialect.name
    for table, column, reftable in FIELD_TABLES:
        name = _fk_name(table, column, reftable)
        if dialect == "sqlite":
            # Batch mode rebuilds the table; the naming convention assigns the
            # reflected (unnamed) FK the same deterministic name we drop.
            with op.batch_alter_table(table, naming_convention=NAMING_CONVENTION) as batch_op:
                batch_op.drop_constraint(name, type_="foreignkey")
                batch_op.create_foreign_key(name, reftable, [column], ["id"], ondelete=ondelete)
        else:
            existing = _existing_fk_name(table, column)
            if existing is not None:
                op.drop_constraint(existing, table, type_="foreignkey")
            op.create_foreign_key(name, table, reftable, [column], ["id"], ondelete=ondelete)


def upgrade() -> None:
    """Perform the upgrade."""
    _recreate_fks(ondelete="CASCADE")


def downgrade() -> None:
    """Perform the downgrade."""
    _recreate_fks(ondelete=None)
