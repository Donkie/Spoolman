"""Pydantic data models for typing the FastAPI request/responses."""

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel as PydanticBaseModel
from pydantic import Field

from spoolman.database import models
from spoolman.math import length_from_weight


def datetime_to_str(dt: datetime) -> str:
    """Convert a datetime object to a string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


class BaseModel(PydanticBaseModel):
    class Config:
        """Pydantic configuration."""

        json_encoders = {  # noqa: RUF012
            datetime: datetime_to_str,
        }


class Message(BaseModel):
    message: str = Field()


class Vendor(BaseModel):
    id: int = Field(description="Unique internal ID of this vendor.")
    registered: datetime = Field(description="When the vendor was registered in the database. UTC Timezone.")
    name: str = Field(max_length=64, description="Vendor name.", example="Polymaker")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this vendor.", example="")

    @staticmethod
    def from_db(item: models.Vendor) -> "Vendor":
        """Create a new Pydantic vendor object from a database vendor object."""
        return Vendor(
            id=item.id,
            registered=item.registered,
            name=item.name,
            comment=item.comment,
        )


class Filament(BaseModel):
    id: int = Field(description="Unique internal ID of this filament type.")
    registered: datetime = Field(description="When the filament was registered in the database. UTC Timezone.")
    name: Optional[str] = Field(
        max_length=64,
        description=(
            "Filament name, to distinguish this filament type among others from the same vendor."
            "Should contain its color for example."
        ),
        example="PolyTerra™ Charcoal Black",
    )
    vendor: Optional[Vendor] = Field(description="The vendor of this filament type.")
    material: Optional[str] = Field(
        max_length=64,
        description="The material of this filament, e.g. PLA.",
        example="PLA",
    )
    price: Optional[float] = Field(
        ge=0,
        description="The price of this filament in the system configured currency.",
        example=20.0,
    )
    density: float = Field(gt=0, description="The density of this filament in g/cm3.", example=1.24)
    diameter: float = Field(gt=0, description="The diameter of this filament in mm.", example=1.75)
    weight: Optional[float] = Field(
        gt=0,
        description="The weight of the filament in a full spool, in grams.",
        example=1000,
    )
    spool_weight: Optional[float] = Field(gt=0, description="The empty spool weight, in grams.", example=140)
    article_number: Optional[str] = Field(
        max_length=64,
        description="Vendor article number, e.g. EAN, QR code, etc.",
        example="PM70820",
    )
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this filament type.",
        example="",
    )
    settings_extruder_temp: Optional[int] = Field(
        ge=0,
        description="Overridden extruder temperature, in °C.",
        example=210,
    )
    settings_bed_temp: Optional[int] = Field(
        ge=0,
        description="Overridden bed temperature, in °C.",
        example=60,
    )
    color_hex: Optional[str] = Field(
        min_length=6,
        max_length=8,
        description="Hexadecimal color code of the filament, e.g. FF0000 for red. Supports alpha channel at the end.",
        example="FF0000",
    )

    @staticmethod
    def from_db(item: models.Filament) -> "Filament":
        """Create a new Pydantic filament object from a database filament object."""
        return Filament(
            id=item.id,
            registered=item.registered,
            name=item.name,
            vendor=Vendor.from_db(item.vendor) if item.vendor is not None else None,
            material=item.material,
            price=item.price,
            density=item.density,
            diameter=item.diameter,
            weight=item.weight,
            spool_weight=item.spool_weight,
            article_number=item.article_number,
            comment=item.comment,
            settings_extruder_temp=item.settings_extruder_temp,
            settings_bed_temp=item.settings_bed_temp,
            color_hex=item.color_hex,
        )


class Spool(BaseModel):
    id: int = Field(description="Unique internal ID of this spool of filament.")
    registered: datetime = Field(description="When the spool was registered in the database. UTC Timezone.")
    first_used: Optional[datetime] = Field(description="First logged occurence of spool usage. UTC Timezone.")
    last_used: Optional[datetime] = Field(description="Last logged occurence of spool usage. UTC Timezone.")
    filament: Filament = Field(description="The filament type of this spool.")
    remaining_weight: Optional[float] = Field(
        default=None,
        ge=0,
        description=(
            "Estimated remaining weight of filament on the spool in grams. "
            "Only set if the filament type has a weight set."
        ),
        example=500.6,
    )
    used_weight: float = Field(ge=0, description="Consumed weight of filament from the spool in grams.", example=500.3)
    remaining_length: Optional[float] = Field(
        default=None,
        ge=0,
        description=(
            "Estimated remaining length of filament on the spool in millimeters."
            " Only set if the filament type has a weight set."
        ),
        example=5612.4,
    )
    used_length: float = Field(
        ge=0,
        description="Consumed length of filament from the spool in millimeters.",
        example=50.7,
    )
    location: Optional[str] = Field(max_length=64, description="Where this spool can be found.", example="Shelf A")
    lot_nr: Optional[str] = Field(
        max_length=64,
        description="Vendor manufacturing lot/batch number of the spool.",
        example="52342",
    )
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this specific spool.",
        example="",
    )
    archived: bool = Field(description="Whether this spool is archived and should not be used anymore.")

    @staticmethod
    def from_db(item: models.Spool) -> "Spool":
        """Create a new Pydantic spool object from a database spool object."""
        filament = Filament.from_db(item.filament)

        remaining_weight: Optional[float] = None
        remaining_length: Optional[float] = None
        if filament.weight is not None:
            remaining_weight = max(filament.weight - item.used_weight, 0)
            remaining_length = length_from_weight(
                weight=remaining_weight,
                density=filament.density,
                diameter=filament.diameter,
            )

        used_length = length_from_weight(
            weight=item.used_weight,
            density=filament.density,
            diameter=filament.diameter,
        )

        return Spool(
            id=item.id,
            registered=item.registered,
            first_used=item.first_used,
            last_used=item.last_used,
            filament=filament,
            used_weight=item.used_weight,
            used_length=used_length,
            remaining_weight=remaining_weight,
            remaining_length=remaining_length,
            location=item.location,
            lot_nr=item.lot_nr,
            comment=item.comment,
            archived=item.archived if item.archived is not None else False,
        )


class Info(BaseModel):
    version: str = Field(example="0.7.0")
    debug_mode: bool = Field(example=False)
    automatic_backups: bool = Field(example=True)
    data_dir: str = Field(example="/home/app/.local/share/spoolman")
    logs_dir: str = Field(example="/home/app/.local/share/spoolman")
    backups_dir: str = Field(example="/home/app/.local/share/spoolman/backups")
    db_type: str = Field(example="sqlite")
    git_commit: Optional[str] = Field(example="a1b2c3d")
    build_date: Optional[datetime] = Field(example="2021-01-01T00:00:00Z")


class HealthCheck(BaseModel):
    status: str = Field(example="healthy")


class BackupResponse(BaseModel):
    path: str = Field(
        default=None,
        description="Path to the created backup file.",
        example="/home/app/.local/share/spoolman/backups/spoolman.db",
    )


class EventType(str, Enum):
    """Event types."""

    ADDED = "added"
    UPDATED = "updated"
    DELETED = "deleted"


class Event(BaseModel):
    """Event."""

    type: EventType = Field(description="Event type.")
    resource: str = Field(description="Resource type.")
    date: datetime = Field(description="When the event occured. UTC Timezone.")
    payload: BaseModel


class SpoolEvent(Event):
    """Event."""

    payload: Spool = Field(description="Updated spool.")
    resource: Literal["spool"] = Field(description="Resource type.")


class FilamentEvent(Event):
    """Event."""

    payload: Filament = Field(description="Updated filament.")
    resource: Literal["filament"] = Field(description="Resource type.")


class VendorEvent(Event):
    """Event."""

    payload: Vendor = Field(description="Updated vendor.")
    resource: Literal["vendor"] = Field(description="Resource type.")
