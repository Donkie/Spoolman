"""tags.

Revision ID: fe4970567bb3
Revises: 9c1d5f2a7b31
Create Date: 2026-08-13 10:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "fe4970567bb3"
down_revision = "9c1d5f2a7b31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the tag table mapping physical NFC/RFID tag UIDs to what they identify."""
    # Purely additive: one new table, no existing column touched, so lossless by
    # construction. CREATE TABLE and its indexes ride the same revision, which is the
    # pattern the extra-fields tables already established (b8881bdb716c) and which the
    # 4-DB suite covers; the DDL/DML split cockroachdb needs (see 304a32906234) does not
    # apply here because there is no data migration.
    #
    # Only spools are tagged today, and the table is deliberately wider than that. A tag
    # is a mapping from a UID to "the thing to bring up", and not every such thing is a
    # row: a location in Spoolman is a string on a spool rather than a table, so a tag
    # meaning "show me Shelf A" can only ever carry the value. Getting that wrong here
    # would mean altering a populated table's nullability on four databases later, so
    # the shape is settled now, while nothing has shipped. See models.Tag for the full
    # reasoning.
    op.create_table(
        "tag",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("uid", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("spool_id", sa.Integer(), nullable=True),
        sa.Column("filament_id", sa.Integer(), nullable=True),
        sa.Column("target_value", sa.String(length=64), nullable=True),
        sa.Column("format", sa.String(length=32), nullable=True),
        sa.Column("instance_uuid", sa.String(length=64), nullable=True),
        sa.Column("added", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["spool_id"],
            ["spool.id"],
        ),
        # Filament tags have no ORM relationship yet (nothing writes them), so the
        # database is what stops a deleted filament leaving tag rows behind.
        sa.ForeignKeyConstraint(
            ["filament_id"],
            ["filament.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tag_id"), "tag", ["id"], unique=False)
    op.create_index(op.f("ix_tag_spool_id"), "tag", ["spool_id"], unique=False)
    op.create_index(op.f("ix_tag_filament_id"), "tag", ["filament_id"], unique=False)
    # The whole point of the table: one physical tag means exactly one thing, enforced by
    # the database rather than by whichever client happened to write last.
    op.create_index(op.f("ix_tag_uid"), "tag", ["uid"], unique=True)
    # Not unique: see models.Tag. A payload copied onto a second sticker can carry one
    # instance identity on two rows, both pointing at the same spool.
    op.create_index(op.f("ix_tag_instance_uuid"), "tag", ["instance_uuid"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_tag_instance_uuid"), table_name="tag")
    op.drop_index(op.f("ix_tag_uid"), table_name="tag")
    op.drop_index(op.f("ix_tag_filament_id"), table_name="tag")
    op.drop_index(op.f("ix_tag_spool_id"), table_name="tag")
    op.drop_index(op.f("ix_tag_id"), table_name="tag")
    op.drop_table("tag")
