"""spool weight population.

Revision ID: 304a32906234
Revises: aafcd7fb0e84
Create Date: 2024-03-26 13:49:26.594399
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "304a32906234"
down_revision = "aafcd7fb0e84"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Pre-populate the spool weights."""
    """This must be done in a separate migration because"""
    """of cockroachdb's execution of alembic migrations"""
    filament = sa.Table(
        "filament",
        sa.MetaData(),
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("spool_weight", sa.Float(), nullable=True),
    )

    spool = sa.Table(
        "spool",
        sa.MetaData(),
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filament_id", sa.Integer),
        sa.Column(
            "initial_weight",
            sa.Float(),
            nullable=False,
        ),
        sa.Column(
            "empty_weight",
            sa.Float(),
            nullable=False,
        ),
    )

    initial_weight = (
        sa.select((filament.c.weight + filament.c.spool_weight).label("initial_weight"))
        .where(filament.c.id == spool.c.filament_id)
        .scalar_subquery()
    )
    empty_weight = sa.select(filament.c.spool_weight).where(filament.c.id == spool.c.filament_id).scalar_subquery()

    set_initial_weight = sa.update(spool).values(initial_weight=initial_weight)
    op.execute(set_initial_weight)

    set_empty_weight = sa.update(spool).values(empty_weight=empty_weight)
    op.execute(set_empty_weight)
    pass


def downgrade() -> None:
    """Perform the downgrade."""
