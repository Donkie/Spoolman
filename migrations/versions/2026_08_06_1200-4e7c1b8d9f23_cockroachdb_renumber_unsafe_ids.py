"""cockroachdb renumber unsafe ids.

Revision ID: 4e7c1b8d9f23
Revises: 9c1d5f2a7b31
Create Date: 2026-08-06 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "4e7c1b8d9f23"
down_revision = "9c1d5f2a7b31"
branch_labels = None
depends_on = None

# JavaScript numbers are only exact up to 2^53, so any ID above this gets rounded
# by the web UI and every follow-up request 404s (#797).
MAX_SAFE_ID = 2**53

# Parent tables in FK order, with the columns in other tables that reference them.
TABLES = (
    ("vendor", (("filament", "vendor_id"), ("vendor_field", "vendor_id"))),
    ("filament", (("spool", "filament_id"), ("filament_field", "filament_id"))),
    ("spool", (("spool_field", "spool_id"),)),
)


def upgrade() -> None:
    """Renumber CockroachDB rows whose IDs are above 2^53 down into the safe range."""
    """Existing CockroachDB installs got their IDs from unique_rowid(), which"""
    """generates 64-bit values the web UI cannot represent (#797). Each unsafe row"""
    """is copied to a new small ID, referencing rows are repointed and the old row"""
    """is deleted, so foreign keys stay valid at every step. Only the DML lives in"""
    """this migration; the DDL that changes the ID default is in the next one"""
    """(see 304a32906234 for the cockroachdb migration caveat)."""
    connection = op.get_bind()
    if connection.dialect.name != "cockroachdb":
        return

    for table_name, references in TABLES:
        table = sa.Table(table_name, sa.MetaData(), autoload_with=connection)

        unsafe_ids = [
            row.id
            for row in connection.execute(
                sa.select(table.c.id).where(table.c.id > MAX_SAFE_ID).order_by(table.c.id),
            )
        ]
        if not unsafe_ids:
            continue

        next_id = (
            connection.execute(
                sa.select(sa.func.coalesce(sa.func.max(table.c.id), 0)).where(table.c.id <= MAX_SAFE_ID),
            ).scalar_one()
            + 1
        )

        column_names = [column.name for column in table.columns]
        for old_id in unsafe_ids:
            new_id = next_id
            next_id += 1

            select_columns = [
                sa.literal(new_id).label("id") if name == "id" else table.c[name] for name in column_names
            ]
            connection.execute(
                table.insert().from_select(
                    column_names,
                    sa.select(*select_columns).where(table.c.id == old_id),
                ),
            )

            for ref_table_name, ref_column_name in references:
                ref_table = sa.Table(
                    ref_table_name,
                    sa.MetaData(),
                    sa.Column(ref_column_name, sa.BigInteger),
                )
                connection.execute(
                    sa.update(ref_table)
                    .where(ref_table.c[ref_column_name] == old_id)
                    .values({ref_column_name: new_id}),
                )

            connection.execute(sa.delete(table).where(table.c.id == old_id))


def downgrade() -> None:
    """Perform the downgrade."""
    # The old unique_rowid() values carry no meaning, so there is nothing to restore.
