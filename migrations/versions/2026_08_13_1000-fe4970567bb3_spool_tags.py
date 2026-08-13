"""spool tags.

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
    """Create the spool_tag table linking physical NFC/RFID tags to spools."""
    # Purely additive: one new table, no existing column touched, so lossless by
    # construction. CREATE TABLE and its indexes ride the same revision, which is the
    # pattern the extra-fields tables already established (b8881bdb716c) and which the
    # 4-DB suite covers; the DDL/DML split cockroachdb needs (see 304a32906234) does not
    # apply here because there is no data migration.
    op.create_table(
        "spool_tag",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("spool_id", sa.Integer(), nullable=False),
        sa.Column("uid", sa.String(length=64), nullable=False),
        sa.Column("format", sa.String(length=32), nullable=True),
        sa.Column("added", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["spool_id"],
            ["spool.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_spool_tag_id"), "spool_tag", ["id"], unique=False)
    op.create_index(op.f("ix_spool_tag_spool_id"), "spool_tag", ["spool_id"], unique=False)
    # The whole point of the table: one tag, one spool, enforced by the database rather
    # than by whichever client happened to write last.
    op.create_index(op.f("ix_spool_tag_uid"), "spool_tag", ["uid"], unique=True)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_spool_tag_uid"), table_name="spool_tag")
    op.drop_index(op.f("ix_spool_tag_spool_id"), table_name="spool_tag")
    op.drop_index(op.f("ix_spool_tag_id"), table_name="spool_tag")
    op.drop_table("spool_tag")
