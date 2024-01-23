"""Added extra fields.

Revision ID: b8881bdb716c
Revises: ccbb17aeda7c
Create Date: 2024-01-04 22:09:34.417527
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b8881bdb716c"
down_revision = "ccbb17aeda7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "vendor_field",
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["vendor_id"],
            ["vendor.id"],
        ),
        sa.PrimaryKeyConstraint("vendor_id", "key"),
    )
    op.create_index(op.f("ix_vendor_field_key"), "vendor_field", ["key"], unique=False)
    op.create_index(op.f("ix_vendor_field_vendor_id"), "vendor_field", ["vendor_id"], unique=False)

    op.create_table(
        "filament_field",
        sa.Column("filament_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["filament_id"],
            ["filament.id"],
        ),
        sa.PrimaryKeyConstraint("filament_id", "key"),
    )
    op.create_index(op.f("ix_filament_field_filament_id"), "filament_field", ["filament_id"], unique=False)
    op.create_index(op.f("ix_filament_field_key"), "filament_field", ["key"], unique=False)

    op.create_table(
        "spool_field",
        sa.Column("spool_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["spool_id"],
            ["spool.id"],
        ),
        sa.PrimaryKeyConstraint("spool_id", "key"),
    )
    op.create_index(op.f("ix_spool_field_key"), "spool_field", ["key"], unique=False)
    op.create_index(op.f("ix_spool_field_spool_id"), "spool_field", ["spool_id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_spool_field_spool_id"), table_name="spool_field")
    op.drop_index(op.f("ix_spool_field_key"), table_name="spool_field")
    op.drop_table("spool_field")

    op.drop_index(op.f("ix_filament_field_key"), table_name="filament_field")
    op.drop_index(op.f("ix_filament_field_filament_id"), table_name="filament_field")
    op.drop_table("filament_field")

    op.drop_index(op.f("ix_vendor_field_vendor_id"), table_name="vendor_field")
    op.drop_index(op.f("ix_vendor_field_key"), table_name="vendor_field")
    op.drop_table("vendor_field")
