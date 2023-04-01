"""SQLAlchemy data models."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Vendor(Base):
    __tablename__ = "vendor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    comment: Mapped[Optional[str]] = mapped_column(String(1024))


class Filament(Base):
    __tablename__ = "material"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(64))
    vendor: Mapped[Optional["Vendor"]] = relationship()
    material: Mapped[Optional[str]] = mapped_column(String(64))
    price: Mapped[Optional[float]] = mapped_column()
    density: Mapped[float] = mapped_column()
    diameter: Mapped[float] = mapped_column()
    weight: Mapped[Optional[float]] = mapped_column()
    spool_weight: Mapped[Optional[float]] = mapped_column()
    article_number: Mapped[Optional[str]] = mapped_column(String(64))
    comment: Mapped[Optional[str]] = mapped_column(String(1024))
    # TODO: Print settings
    # TODO: Color?


class Spool(Base):
    __tablename__ = "spool"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    first_used: Mapped[Optional[datetime]] = mapped_column()
    last_used: Mapped[Optional[datetime]] = mapped_column()
    filament: Mapped["Filament"] = mapped_column(index=True)
    weight: Mapped[float] = mapped_column()
    location: Mapped[Optional[str]] = mapped_column(String(64))
    lot_nr: Mapped[Optional[str]] = mapped_column(String(64))
    comment: Mapped[Optional[str]] = mapped_column(String(1024))
