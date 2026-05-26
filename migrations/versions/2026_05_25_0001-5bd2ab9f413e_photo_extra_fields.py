"""Add photo extra field storage.

Revision ID: 5bd2ab9f413e
Revises: 415a8f855e14
Create Date: 2026-05-25 20:30:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "5bd2ab9f413e"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


CHUNK_SIZE = 49152


def upgrade() -> None:
    """Create photo storage tables."""
    op.create_table(
        "photo_file",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("filename", sa.String(length=256), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("original_content_type", sa.String(length=64), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("original_size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_photo_file_id"), "photo_file", ["id"], unique=False)
    op.create_index(op.f("ix_photo_file_sha256"), "photo_file", ["sha256"], unique=False)

    op.create_table(
        "photo_file_chunk",
        sa.Column("photo_file_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(length=CHUNK_SIZE), nullable=False),
        sa.ForeignKeyConstraint(["photo_file_id"], ["photo_file.id"]),
        sa.PrimaryKeyConstraint("photo_file_id", "chunk_index"),
    )
    op.create_index(op.f("ix_photo_file_chunk_photo_file_id"), "photo_file_chunk", ["photo_file_id"], unique=False)

    op.create_table(
        "vendor_photo",
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(length=64), nullable=False),
        sa.Column("photo_file_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["photo_file_id"], ["photo_file.id"]),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendor.id"]),
        sa.PrimaryKeyConstraint("vendor_id", "field_key", "photo_file_id"),
    )
    op.create_index(op.f("ix_vendor_photo_field_key"), "vendor_photo", ["field_key"], unique=False)
    op.create_index(op.f("ix_vendor_photo_photo_file_id"), "vendor_photo", ["photo_file_id"], unique=False)
    op.create_index(op.f("ix_vendor_photo_vendor_id"), "vendor_photo", ["vendor_id"], unique=False)

    op.create_table(
        "filament_photo",
        sa.Column("filament_id", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(length=64), nullable=False),
        sa.Column("photo_file_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["filament_id"], ["filament.id"]),
        sa.ForeignKeyConstraint(["photo_file_id"], ["photo_file.id"]),
        sa.PrimaryKeyConstraint("filament_id", "field_key", "photo_file_id"),
    )
    op.create_index(op.f("ix_filament_photo_field_key"), "filament_photo", ["field_key"], unique=False)
    op.create_index(op.f("ix_filament_photo_filament_id"), "filament_photo", ["filament_id"], unique=False)
    op.create_index(op.f("ix_filament_photo_photo_file_id"), "filament_photo", ["photo_file_id"], unique=False)

    op.create_table(
        "spool_photo",
        sa.Column("spool_id", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(length=64), nullable=False),
        sa.Column("photo_file_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["photo_file_id"], ["photo_file.id"]),
        sa.ForeignKeyConstraint(["spool_id"], ["spool.id"]),
        sa.PrimaryKeyConstraint("spool_id", "field_key", "photo_file_id"),
    )
    op.create_index(op.f("ix_spool_photo_field_key"), "spool_photo", ["field_key"], unique=False)
    op.create_index(op.f("ix_spool_photo_photo_file_id"), "spool_photo", ["photo_file_id"], unique=False)
    op.create_index(op.f("ix_spool_photo_spool_id"), "spool_photo", ["spool_id"], unique=False)


def downgrade() -> None:
    """Drop photo storage tables."""
    op.drop_index(op.f("ix_spool_photo_spool_id"), table_name="spool_photo")
    op.drop_index(op.f("ix_spool_photo_photo_file_id"), table_name="spool_photo")
    op.drop_index(op.f("ix_spool_photo_field_key"), table_name="spool_photo")
    op.drop_table("spool_photo")

    op.drop_index(op.f("ix_filament_photo_photo_file_id"), table_name="filament_photo")
    op.drop_index(op.f("ix_filament_photo_filament_id"), table_name="filament_photo")
    op.drop_index(op.f("ix_filament_photo_field_key"), table_name="filament_photo")
    op.drop_table("filament_photo")

    op.drop_index(op.f("ix_vendor_photo_vendor_id"), table_name="vendor_photo")
    op.drop_index(op.f("ix_vendor_photo_photo_file_id"), table_name="vendor_photo")
    op.drop_index(op.f("ix_vendor_photo_field_key"), table_name="vendor_photo")
    op.drop_table("vendor_photo")

    op.drop_index(op.f("ix_photo_file_chunk_photo_file_id"), table_name="photo_file_chunk")
    op.drop_table("photo_file_chunk")

    op.drop_index(op.f("ix_photo_file_sha256"), table_name="photo_file")
    op.drop_index(op.f("ix_photo_file_id"), table_name="photo_file")
    op.drop_table("photo_file")
