"""cockroachdb renumber unsafe ids.

Revision ID: 4e7c1b8d9f23
Revises: fe4970567bb3
Create Date: 2026-09-06 12:00:00.000000
"""

import json

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

# The settings the web UI saves its custom spool orders in: {location: [spool IDs]} and
# {field: {group: [spool IDs]}}.
SPOOL_ORDER_SETTINGS = ("locations_spoolorders", "dashboard_spoolorders")


def remap_spool_ids(value: object, spool_ids: dict[int, int]) -> object:
    """Replace the old spool IDs in a saved spool order with the new ones.

    The web UI saved these IDs, so an unsafe one is stored rounded to the nearest double and has to
    be looked up as a float, since Python compares an int and a float exactly. Old IDs that round
    to the same double were all shown under that one ID, so they all take its place, in their old
    order and once per list. Keys are names and stay as they are, and so does everything that isn't
    the ID of a renumbered spool, like the IDs of spools deleted since.
    """
    new_ids_of: dict[float, list[int]] = {}
    for old_id, new_id in sorted(spool_ids.items()):
        new_ids_of.setdefault(float(old_id), []).append(new_id)

    def remap(value: object) -> object:
        if isinstance(value, dict):
            return {key: remap(item) for key, item in value.items()}
        if not isinstance(value, list):
            return value
        result = []
        added = set()
        for item in value:
            # bool is an int too, and float() can't take huge ints, which are no spool IDs anyway.
            if isinstance(item, (int, float)) and not isinstance(item, bool) and abs(item) < 2**64:
                new_ids = new_ids_of.get(float(item))
                if new_ids:
                    result += [new_id for new_id in new_ids if new_id not in added]
                    added.update(new_ids)
                    continue
            result.append(remap(item))
        return result

    return remap(value)


def remap_spool_orders(connection: sa.Connection, spool_ids: dict[int, int]) -> None:
    """Point the spool orders the web UI saved at the renumbered spools."""
    setting = sa.table("setting", sa.column("key"), sa.column("value"))
    saved = connection.execute(sa.select(setting.c.key, setting.c.value).where(setting.c.key.in_(SPOOL_ORDER_SETTINGS)))
    for key, text in saved.all():
        try:
            value = json.loads(text)
        except ValueError:
            continue
        if not isinstance(value, dict):
            continue
        remapped = remap_spool_ids(value, spool_ids)
        if remapped != value:
            # Written the way JSON.stringify() does it. last_updated stays, no user changed anything.
            remapped_text = json.dumps(remapped, separators=(",", ":"), ensure_ascii=False)
            connection.execute(sa.update(setting).where(setting.c.key == key).values(value=remapped_text))


def upgrade() -> None:
    """Renumber CockroachDB rows whose IDs are 2^53 or above down into the safe range."""
    """Existing CockroachDB installs got their IDs from unique_rowid(), which"""
    """generates 64-bit values the web UI cannot represent (#797). The unsafe rows"""
    """of each table get the IDs after its largest safe one, in their old order."""
    """Vendors, filaments and spools are copied to their new IDs, the references to"""
    """them are repointed and the old rows deleted, so foreign keys hold after every"""
    """statement. Nothing references a tag, so tags are renumbered in place. The spool"""
    """orders the web UI saves in two settings are pointed at the new spool IDs. That"""
    """is a few statements per table, all in this migration's one transaction, so an"""
    """interrupted upgrade rolls back completely and simply runs again. Only the DML"""
    """lives here; the DDL that changes the ID default is in the next migration"""
    """(see 304a32906234 for the cockroachdb migration caveat)."""
    connection = op.get_bind()
    if connection.dialect.name != "cockroachdb":
        return

    inspector = sa.inspect(connection)
    spool_ids: dict[int, int] = {}
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
        if table_name == "spool":
            spool_ids = dict(connection.execute(sa.select(id_map.c.old_id, id_map.c.new_id)).all())

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

    if spool_ids:
        remap_spool_orders(connection, spool_ids)


def downgrade() -> None:
    """Perform the downgrade."""
    # The old unique_rowid() values carry no meaning, so there is nothing to restore.
