"""initial.

Revision ID: 684d32cf7e4d
Create Date: 2023-05-27 21:46:24.361353
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = "684d32cf7e4d"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)  # type: ignore[arg-type]
    tables = inspector.get_table_names()
    if "vendor" in tables:
        # If the vendor table exists, we assume that the initial migration has already been performed.
        return

    op.create_table(
        "vendor",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendor_id"), "vendor", ["id"], unique=False)
    op.create_table(
        "filament",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("name", sa.String(length=64), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("material", sa.String(length=64), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("density", sa.Float(), nullable=False),
        sa.Column("diameter", sa.Float(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=True, comment="The filament weight of a full spool (net weight)."),
        sa.Column("spool_weight", sa.Float(), nullable=True, comment="The weight of an empty spool."),
        sa.Column("article_number", sa.String(length=64), nullable=True),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(
            ["vendor_id"],
            ["vendor.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_filament_id"), "filament", ["id"], unique=False)
    op.create_table(
        "spool",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("first_used", sa.DateTime(), nullable=True),
        sa.Column("last_used", sa.DateTime(), nullable=True),
        sa.Column("filament_id", sa.Integer(), nullable=False),
        sa.Column("used_weight", sa.Float(), nullable=False),
        sa.Column("location", sa.String(length=64), nullable=True),
        sa.Column("lot_nr", sa.String(length=64), nullable=True),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(
            ["filament_id"],
            ["filament.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_spool_id"), "spool", ["id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_spool_id"), table_name="spool")
    op.drop_table("spool")
    op.drop_index(op.f("ix_filament_id"), table_name="filament")
    op.drop_table("filament")
    op.drop_index(op.f("ix_vendor_id"), table_name="vendor")
    op.drop_table("vendor")
