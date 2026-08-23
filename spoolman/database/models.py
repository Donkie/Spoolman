"""SQLAlchemy data models."""

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# The three `extra` collections below MUST NOT go back to lazy="joined".
#
# A spool listing joins spool -> filament -> vendor, so joined eager loading of all
# three `extra` collections multiplies their rows together: with ~12 spool, ~9
# filament and ~9 vendor extra fields, one spool costs ~1000 result rows. Measured
# on a 4911-spool database, a single `GET /spool?limit=30` made SQLite materialize
# 35674 wide rows and took 431 ms (1358 ms at limit=100) — most of it spent in
# SQLAlchemy de-duplicating those rows back into 30 objects.
#
# selectin loading fetches each collection in one extra `WHERE id IN (...)` query
# instead, so nothing multiplies: the same request drops to 12 ms / 23 ms (5
# queries instead of 2) with byte-identical responses.


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Vendor(Base):
    __tablename__ = "vendor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    name: Mapped[str] = mapped_column(String(64))
    empty_spool_weight: Mapped[float | None] = mapped_column(comment="The weight of an empty spool.")
    comment: Mapped[str | None] = mapped_column(String(1024))
    filaments: Mapped[list["Filament"]] = relationship(back_populates="vendor")
    external_id: Mapped[str | None] = mapped_column(String(256))
    extra: Mapped[list["VendorField"]] = relationship(
        back_populates="vendor",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )


class Filament(Base):
    __tablename__ = "filament"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    name: Mapped[str | None] = mapped_column(String(64))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendor.id"))
    vendor: Mapped[Optional["Vendor"]] = relationship(back_populates="filaments")
    spools: Mapped[list["Spool"]] = relationship(back_populates="filament")
    material: Mapped[str | None] = mapped_column(String(64))
    price: Mapped[float | None] = mapped_column()
    density: Mapped[float] = mapped_column()
    diameter: Mapped[float] = mapped_column()
    weight: Mapped[float | None] = mapped_column(comment="The filament weight of a full spool (net weight).")
    spool_weight: Mapped[float | None] = mapped_column(comment="The weight of an empty spool.")
    article_number: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(String(1024))
    settings_extruder_temp: Mapped[int | None] = mapped_column(comment="Overridden extruder temperature.")
    settings_bed_temp: Mapped[int | None] = mapped_column(comment="Overridden bed temperature.")
    color_hex: Mapped[str | None] = mapped_column(String(8))
    multi_color_hexes: Mapped[str | None] = mapped_column(String(128))
    multi_color_direction: Mapped[str | None] = mapped_column(String(16))
    external_id: Mapped[str | None] = mapped_column(String(256))
    extra: Mapped[list["FilamentField"]] = relationship(
        back_populates="filament",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )


class Spool(Base):
    __tablename__ = "spool"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    first_used: Mapped[datetime | None] = mapped_column()
    last_used: Mapped[datetime | None] = mapped_column()
    price: Mapped[float | None] = mapped_column()
    filament_id: Mapped[int] = mapped_column(ForeignKey("filament.id"))
    filament: Mapped["Filament"] = relationship(back_populates="spools")
    initial_weight: Mapped[float | None] = mapped_column()
    spool_weight: Mapped[float | None] = mapped_column()
    used_weight: Mapped[float] = mapped_column()
    location: Mapped[str | None] = mapped_column(String(64))
    lot_nr: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(String(1024))
    archived: Mapped[bool | None] = mapped_column()
    extra: Mapped[list["SpoolField"]] = relationship(
        back_populates="spool",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )
    # selectin for the same reason as `extra` above: a spool listing already joins
    # filament and vendor, and a joined collection here would multiply against the
    # extra-field rows.
    tags: Mapped[list["Tag"]] = relationship(
        back_populates="spool",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )


class Setting(Base):
    __tablename__ = "setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())
    last_updated: Mapped[datetime] = mapped_column()


class VendorField(Base):
    __tablename__ = "vendor_field"

    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendor.id"), primary_key=True, index=True)
    vendor: Mapped["Vendor"] = relationship(back_populates="extra")
    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())


class FilamentField(Base):
    __tablename__ = "filament_field"

    filament_id: Mapped[int] = mapped_column(ForeignKey("filament.id"), primary_key=True, index=True)
    filament: Mapped["Filament"] = relationship(back_populates="extra")
    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())


class SpoolField(Base):
    __tablename__ = "spool_field"

    spool_id: Mapped[int] = mapped_column(ForeignKey("spool.id"), primary_key=True, index=True)
    spool: Mapped["Spool"] = relationship(back_populates="extra")
    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())


class Tag(Base):
    """A physical NFC/RFID tag, and the thing tapping it should bring up.

    Many tags per target is a real case rather than a hypothetical: copying a Prusa NFC-V
    tag's payload onto an NTAG215 so a PN532 can read it leaves one spool carrying two
    physical tags with two different UIDs (#776).

    The unique index on `uid` is the point of the table -- one physical tag means exactly
    one thing, enforced. It only means that because every write goes through
    `spoolman.tags.normalize_uid`; see the module docstring there.

    ## Why the target is not just `spool_id`

    Only spools are tagged today. The columns are wider than that because the shapes a
    tag might point at are not all rows, and finding that out after release would mean
    altering a populated table's nullability on four databases:

    * `spool_id` / `filament_id` -- targets that ARE rows, so they are real foreign keys
      and the database keeps them honest.
    * `target_value` -- targets that are not rows at all. A location in Spoolman is a
      string on a spool (`Spool.location`), not a table, so a tag that means "show me
      Shelf A" can only carry the value. Adding such a kind later needs no migration:
      only a new `target_type`.

    `target_type` says which of those is in force rather than leaving readers to infer it
    from whichever column is non-null, so a future kind that populates nothing (or
    something new) stays legible.

    Exactly-one-target is enforced in `spoolman.database.tag`, not by a CHECK constraint:
    no migration in this tree uses one, and MySQL below 8.0.16 accepts and silently
    ignores them, so a constraint here would be real on three databases out of four --
    worse than a single enforced path. Same reasoning as `normalize_uid`.
    """

    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # Which kind of thing this tag points at; see the class docstring. Values live in
    # spoolman.tags. A string rather than an enum for the same reason `format` is one:
    # new kinds should not need a schema migration on four databases.
    target_type: Mapped[str] = mapped_column(String(16))
    spool_id: Mapped[int | None] = mapped_column(ForeignKey("spool.id"), index=True)
    spool: Mapped["Spool | None"] = relationship(back_populates="tags")
    # No ORM relationship yet, deliberately. Nothing writes filament tags, and a
    # `selectin` collection on Filament would add a query to every filament listing for
    # rows that cannot exist. ON DELETE CASCADE keeps the database honest in the
    # meantime; the relationship arrives with the feature that needs it.
    filament_id: Mapped[int | None] = mapped_column(
        ForeignKey("filament.id", ondelete="CASCADE"),
        index=True,
    )
    # For target kinds addressed by value rather than by row -- a location name. Sized to
    # match Spool.location, which is what it would hold.
    target_value: Mapped[str | None] = mapped_column(String(64))
    # Free-ish string (openprinttag, ntag, bambu, ...) rather than an enum: informational
    # in phase 1, and new tag types appear faster than migrations should.
    format: Mapped[str | None] = mapped_column(String(32))
    added: Mapped[datetime] = mapped_column()
