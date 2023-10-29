"""SQLAlchemy data models."""

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Vendor(Base):
    __tablename__ = "vendor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    name: Mapped[str] = mapped_column(String(64))
    comment: Mapped[Optional[str]] = mapped_column(String(1024))
    filaments: Mapped[list["Filament"]] = relationship(back_populates="vendor")


class Filament(Base):
    __tablename__ = "filament"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    name: Mapped[Optional[str]] = mapped_column(String(64))
    vendor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vendor.id"))
    vendor: Mapped[Optional["Vendor"]] = relationship(back_populates="filaments")
    spools: Mapped[list["Spool"]] = relationship(back_populates="filament")
    material: Mapped[Optional[str]] = mapped_column(String(64))
    price: Mapped[Optional[float]] = mapped_column()
    density: Mapped[float] = mapped_column()
    diameter: Mapped[float] = mapped_column()
    weight: Mapped[Optional[float]] = mapped_column(comment="The filament weight of a full spool (net weight).")
    spool_weight: Mapped[Optional[float]] = mapped_column(comment="The weight of an empty spool.")
    article_number: Mapped[Optional[str]] = mapped_column(String(64))
    comment: Mapped[Optional[str]] = mapped_column(String(1024))
    settings_extruder_temp: Mapped[Optional[int]] = mapped_column(comment="Overridden extruder temperature.")
    settings_bed_temp: Mapped[Optional[int]] = mapped_column(comment="Overridden bed temperature.")
    color_hex: Mapped[Optional[str]] = mapped_column(String(8))


class Spool(Base):
    __tablename__ = "spool"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    first_used: Mapped[Optional[datetime]] = mapped_column()
    last_used: Mapped[Optional[datetime]] = mapped_column()
    filament_id: Mapped[int] = mapped_column(ForeignKey("filament.id"))
    filament: Mapped["Filament"] = relationship(back_populates="spools")
    used_weight: Mapped[float] = mapped_column()
    location: Mapped[Optional[str]] = mapped_column(String(64))
    lot_nr: Mapped[Optional[str]] = mapped_column(String(64))
    comment: Mapped[Optional[str]] = mapped_column(String(1024))
    archived: Mapped[Optional[bool]] = mapped_column()
