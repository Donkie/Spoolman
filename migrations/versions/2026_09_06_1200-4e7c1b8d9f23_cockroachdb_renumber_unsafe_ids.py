"""cockroachdb renumber unsafe ids.

Revision ID: 4e7c1b8d9f23
Revises: fe4970567bb3
Create Date: 2026-09-06 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "4e7c1b8d9f23"
down_revision = "fe4970567bb3"
branch_labels = None
depends_on = None

# JavaScript numbers can't tell 2^53 apart from 2^53 + 1 (Number.MAX_SAFE_INTEGER is 2^53 - 1),
# so the web UI rounds any ID from here up and every follow-up request 404s (#797).
UNSAFE_ID = 2**53

# Tables in FK order, with the columns in other tables that reference them.
TABLES = (
    ("vendor", (("filament", "vendor_id"), ("vendor_field", "vendor_id"))),
    ("filament", (("spool", "filament_id"), ("filament_field", "filament_id"), ("tag", "filament_id"))),
    ("spool", (("spool_field", "spool_id"), ("tag", "spool_id"))),
    ("tag", ()),
)


def upgrade() -> None:
    """Renumber CockroachDB rows whose IDs are 2^53 or above down into the safe range."""
    """Existing CockroachDB installs got their IDs from unique_rowid(), which"""
    """generates 64-bit values the web UI cannot represent (#797). The unsafe rows"""
    """of each table get the IDs after its largest safe one, in their old order."""
    """Vendors, filaments and spools are copied to their new IDs, the references to"""
    """them are repointed and the old rows deleted, so foreign keys hold after every"""
    """statement. Nothing references a tag, so tags are renumbered in place. That is"""
    """a few statements per table, all in this migration's one transaction, so an"""
    """interrupted upgrade rolls back completely and simply runs again. Only the DML"""
    """lives here; the DDL that changes the ID default is in the next migration"""
    """(see 304a32906234 for the cockroachdb migration caveat)."""
    connection = op.get_bind()
    if connection.dialect.name != "cockroachdb":
        return

    inspector = sa.inspect(connection)
    for table_name, references in TABLES:
        # Only the columns are reflected: reflecting the whole table also reads its indexes, and
        # that query alone can take half a minute on cockroachdb.
        table = sa.table(
            table_name,
            *(sa.column(column["name"], column["type"]) for column in inspector.get_columns(table_name)),
        )
        unsafe = table.c.id >= UNSAFE_ID

        count = connection.execute(sa.select(sa.func.count()).select_from(table).where(unsafe)).scalar_one()
        if count == 0:
            continue

        first_id = connection.execute(
            sa.select(sa.func.coalesce(sa.func.max(table.c.id), 0) + 1).where(~unsafe)
        ).scalar_one()
        if first_id + count > UNSAFE_ID:
            raise RuntimeError(f"Cannot renumber {count} {table_name} rows, there are no free IDs left below 2^53.")

        # The n-th unsafe ID, counting up, becomes first_id + n - 1.
        new_id = sa.func.row_number().over(order_by=table.c.id) + (first_id - 1)
        id_map = sa.select(table.c.id.label("old_id"), new_id.label("new_id")).where(unsafe).subquery()

        if not references:
            connection.execute(sa.update(table).where(table.c.id == id_map.c.old_id).values(id=id_map.c.new_id))
            continue

        copies = sa.select(*(new_id.label("id") if column.name == "id" else column for column in table.c)).where(unsafe)
        connection.execute(table.insert().from_select([column.name for column in table.c], copies))
        for ref_table_name, ref_column_name in references:
            ref_table = sa.table(ref_table_name, sa.column(ref_column_name))
            connection.execute(
                sa.update(ref_table)
                .where(ref_table.c[ref_column_name] == id_map.c.old_id)
                .values({ref_column_name: id_map.c.new_id}),
            )
        connection.execute(sa.delete(table).where(unsafe))


def downgrade() -> None:
    """Perform the downgrade."""
    # The old unique_rowid() values carry no meaning, so there is nothing to restore.
