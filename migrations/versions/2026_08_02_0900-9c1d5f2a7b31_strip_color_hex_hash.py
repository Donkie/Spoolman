"""strip color hex hash.

Revision ID: 9c1d5f2a7b31
Revises: 415a8f855e14
Create Date: 2026-08-02 09:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "9c1d5f2a7b31"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Strip leading # characters from stored filament color codes."""
    """Rows are rewritten one by one through the connection rather than with SQL"""
    """string functions, so this behaves identically on sqlite, postgres, mysql"""
    """and cockroachdb (see 304a32906234 for the cockroachdb caveat)."""
    filament = sa.Table(
        "filament",
        sa.MetaData(),
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("color_hex", sa.String(length=8), nullable=True),
        sa.Column("multi_color_hexes", sa.String(length=128), nullable=True),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.select(filament.c.id, filament.c.color_hex, filament.c.multi_color_hexes),
    ).fetchall()

    for row in rows:
        values = {}

        if row.color_hex is not None and "#" in row.color_hex:
            values["color_hex"] = row.color_hex.replace("#", "")

        if row.multi_color_hexes is not None and "#" in row.multi_color_hexes:
            values["multi_color_hexes"] = row.multi_color_hexes.replace("#", "")

        if values:
            connection.execute(sa.update(filament).where(filament.c.id == row.id).values(**values))


def downgrade() -> None:
    """Perform the downgrade."""
    # The leading # was never valid, so there is nothing to restore.
