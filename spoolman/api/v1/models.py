"""Pydantic data models for typing the FastAPI request/responses."""

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, PlainSerializer

from spoolman.database import models
from spoolman.math import length_from_weight
from spoolman.settings import SettingDefinition, SettingType


def datetime_to_str(dt: datetime) -> str:
    """Convert a datetime object to a string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


SpoolmanDateTime = Annotated[datetime, PlainSerializer(datetime_to_str)]


class Message(BaseModel):
    message: str = Field()


class SettingResponse(BaseModel):
    value: str = Field(description="Setting value.")
    is_set: bool = Field(description="Whether the setting has been set. If false, 'value' contains the default value.")
    type: SettingType = Field(description="Setting type. This corresponds with JSON types.")


class SettingKV(BaseModel):
    key: str = Field(description="Setting key.")
    setting: SettingResponse = Field(description="Setting value.")

    @staticmethod
    def from_db(definition: SettingDefinition, set_value: Optional[str]) -> "SettingKV":
        """Create a new Pydantic vendor object from a database vendor object."""
        return SettingKV(
            key=definition.key,
            setting=SettingResponse(
                value=set_value if set_value is not None else definition.default,
                is_set=set_value is not None,
                type=definition.type,
            ),
        )


class Vendor(BaseModel):
    id: int = Field(description="Unique internal ID of this vendor.")
    registered: SpoolmanDateTime = Field(description="When the vendor was registered in the database. UTC Timezone.")
    name: str = Field(max_length=64, description="Vendor name.", examples=["Polymaker"])
    comment: Optional[str] = Field(
        None,
        max_length=1024,
        description="Free text comment about this vendor.",
        examples=[""],
    )
    empty_spool_weight: Optional[float] = Field(
        None,
        ge=0,
        description="The empty spool weight, in grams.",
        examples=[140],
    )
    external_id: Optional[str] = Field(
        None,
        max_length=256,
        description=(
            "Set if this vendor comes from an external database. This contains the ID in the external database."
        ),
        examples=["eSun"],
    )
    extra: dict[str, str] = Field(
        description=(
            "Extra fields for this vendor. All values are JSON-encoded data. "
            "Query the /fields endpoint for more details about the fields."
        ),
    )

    @staticmethod
    def from_db(item: models.Vendor) -> "Vendor":
        """Create a new Pydantic vendor object from a database vendor object."""
        return Vendor(
            id=item.id,
            registered=item.registered,
            name=item.name,
            comment=item.comment,
            empty_spool_weight=item.empty_spool_weight,
            external_id=item.external_id,
            extra={field.key: field.value for field in item.extra},
        )


class MultiColorDirection(Enum):
    """Enum for multi-color direction."""

    COAXIAL = "coaxial"
    LONGITUDINAL = "longitudinal"


class Filament(BaseModel):
    id: int = Field(description="Unique internal ID of this filament type.")
    registered: SpoolmanDateTime = Field(description="When the filament was registered in the database. UTC Timezone.")
    name: Optional[str] = Field(
        None,
        max_length=64,
        description=(
            "Filament name, to distinguish this filament type among others from the same vendor."
            "Should contain its color for example."
        ),
        examples=["PolyTerra™ Charcoal Black"],
    )
    vendor: Optional[Vendor] = Field(None, description="The vendor of this filament type.")
    material: Optional[str] = Field(
        None,
        max_length=64,
        description="The material of this filament, e.g. PLA.",
        examples=["PLA"],
    )
    price: Optional[float] = Field(
        None,
        ge=0,
        description="The price of this filament in the system configured currency.",
        examples=[20.0],
    )
    density: float = Field(gt=0, description="The density of this filament in g/cm3.", examples=[1.24])
    diameter: float = Field(gt=0, description="The diameter of this filament in mm.", examples=[1.75])
    weight: Optional[float] = Field(
        None,
        gt=0,
        description="The weight of the filament in a full spool, in grams.",
        examples=[1000],
    )
    spool_weight: Optional[float] = Field(None, ge=0, description="The empty spool weight, in grams.", examples=[140])
    article_number: Optional[str] = Field(
        None,
        max_length=64,
        description="Vendor article number, e.g. EAN, QR code, etc.",
        examples=["PM70820"],
    )
    comment: Optional[str] = Field(
        None,
        max_length=1024,
        description="Free text comment about this filament type.",
        examples=[""],
    )
    settings_extruder_temp: Optional[int] = Field(
        None,
        ge=0,
        description="Overridden extruder temperature, in °C.",
        examples=[210],
    )
    settings_bed_temp: Optional[int] = Field(
        None,
        ge=0,
        description="Overridden bed temperature, in °C.",
        examples=[60],
    )
    color_hex: Optional[str] = Field(
        None,
        min_length=6,
        max_length=8,
        description=(
            "Hexadecimal color code of the filament, e.g. FF0000 for red. Supports alpha channel at the end. "
            "If it's a multi-color filament, the multi_color_hexes field is used instead."
        ),
        examples=["FF0000"],
    )
    multi_color_hexes: Optional[str] = Field(
        None,
        min_length=6,
        description=(
            "Hexadecimal color code of the filament, e.g. FF0000 for red. Supports alpha channel at the end. "
            "Specifying multiple colors separated by commas. "
            "Also set the multi_color_direction field if you specify multiple colors."
        ),
        examples=["FF0000,00FF00,0000FF"],
    )
    multi_color_direction: Optional[MultiColorDirection] = Field(
        None,
        description=("Type of multi-color filament. Only set if the multi_color_hexes field is set."),
        examples=["coaxial", "longitudinal"],
    )
    external_id: Optional[str] = Field(
        None,
        max_length=256,
        description=(
            "Set if this filament comes from an external database. This contains the ID in the external database."
        ),
        examples=["polymaker_pla_polysonicblack_1000_175"],
    )
    extra: dict[str, str] = Field(
        description=(
            "Extra fields for this filament. All values are JSON-encoded data. "
            "Query the /fields endpoint for more details about the fields."
        ),
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
            multi_color_hexes=item.multi_color_hexes,
            multi_color_direction=(
                MultiColorDirection(item.multi_color_direction) if item.multi_color_direction is not None else None
            ),
            external_id=item.external_id,
            extra={field.key: field.value for field in item.extra},
        )


class Spool(BaseModel):
    id: int = Field(description="Unique internal ID of this spool of filament.")
    registered: SpoolmanDateTime = Field(description="When the spool was registered in the database. UTC Timezone.")
    first_used: Optional[SpoolmanDateTime] = Field(
        None,
        description="First logged occurence of spool usage. UTC Timezone.",
    )
    last_used: Optional[SpoolmanDateTime] = Field(
        None,
        description="Last logged occurence of spool usage. UTC Timezone.",
    )
    filament: Filament = Field(description="The filament type of this spool.")
    price: Optional[float] = Field(
        None,
        ge=0,
        description="The price of this spool in the system configured currency.",
        examples=[20.0],
    )
    remaining_weight: Optional[float] = Field(
        default=None,
        ge=0,
        description=(
            "Estimated remaining weight of filament on the spool in grams. "
            "Only set if the filament type has a weight set."
        ),
        examples=[500.6],
    )
    initial_weight: Optional[float] = Field(
        default=None,
        ge=0,
        description=("The initial weight, in grams, of the filament on the spool (net weight)."),
        examples=[1246],
    )
    spool_weight: Optional[float] = Field(
        default=None,
        ge=0,
        description=("Weight of an empty spool (tare weight)."),
        examples=[246],
    )
    used_weight: float = Field(
        ge=0,
        description="Consumed weight of filament from the spool in grams.",
        examples=[500.3],
    )
    remaining_length: Optional[float] = Field(
        default=None,
        ge=0,
        description=(
            "Estimated remaining length of filament on the spool in millimeters."
            " Only set if the filament type has a weight set."
        ),
        examples=[5612.4],
    )
    used_length: float = Field(
        ge=0,
        description="Consumed length of filament from the spool in millimeters.",
        examples=[50.7],
    )
    location: Optional[str] = Field(
        None,
        max_length=64,
        description="Where this spool can be found.",
        examples=["Shelf A"],
    )
    lot_nr: Optional[str] = Field(
        None,
        max_length=64,
        description="Vendor manufacturing lot/batch number of the spool.",
        examples=["52342"],
    )
    comment: Optional[str] = Field(
        None,
        max_length=1024,
        description="Free text comment about this specific spool.",
        examples=[""],
    )
    archived: bool = Field(description="Whether this spool is archived and should not be used anymore.")
    dried: list[str] = Field(
        default_factory=list,
        description="List of ISO8601 datetime strings when this spool was dried.",
        examples=[["2024-06-01T12:00:00Z", "2024-06-10T15:30:00Z"]],
    )
    last_dried: Optional[SpoolmanDateTime] = Field(
        default=None,
        description="The most recent drying event (ISO8601 datetime string), or None if never dried.",
        examples=["2024-06-10T15:30:00Z"],
    )
    extra: dict[str, str] = Field(
        description=(
            "Extra fields for this spool. All values are JSON-encoded data. "
            "Query the /fields endpoint for more details about the fields."
        ),
    )

    @staticmethod
    def from_db(item: models.Spool) -> "Spool":
        """Create a new Pydantic spool object from a database spool object."""
        filament = Filament.from_db(item.filament)

        remaining_weight: Optional[float] = None
        remaining_length: Optional[float] = None

        if item.initial_weight is not None:
            remaining_weight = max(item.initial_weight - item.used_weight, 0)
            remaining_length = length_from_weight(
                weight=remaining_weight,
                density=filament.density,
                diameter=filament.diameter,
            )
        elif filament.weight is not None:
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

        dried_list = item.dried if item.dried is not None else []
        last_dried = item.last_dried if item.last_dried is not None else (max(dried_list) if dried_list else None)

        return Spool(
            id=item.id,
            registered=item.registered,
            first_used=item.first_used,
            last_used=item.last_used,
            filament=filament,
            price=item.price,
            initial_weight=item.initial_weight,
            spool_weight=item.spool_weight,
            used_weight=item.used_weight,
            used_length=used_length,
            remaining_weight=remaining_weight,
            remaining_length=remaining_length,
            location=item.location,
            lot_nr=item.lot_nr,
            comment=item.comment,
            archived=item.archived if item.archived is not None else False,
            dried=dried_list,
            last_dried=last_dried,
            extra={field.key: field.value for field in item.extra},
        )


class Info(BaseModel):
    version: str = Field(examples=["0.7.0"])
    debug_mode: bool = Field(examples=[False])
    automatic_backups: bool = Field(examples=[True])
    data_dir: str = Field(examples=["/home/app/.local/share/spoolman"])
    logs_dir: str = Field(examples=["/home/app/.local/share/spoolman"])
    backups_dir: str = Field(examples=["/home/app/.local/share/spoolman/backups"])
    db_type: str = Field(examples=["sqlite"])
    git_commit: Optional[str] = Field(None, examples=["a1b2c3d"])
    build_date: Optional[SpoolmanDateTime] = Field(None, examples=["2021-01-01T00:00:00Z"])


class HealthCheck(BaseModel):
    status: str = Field(examples=["healthy"])


class BackupResponse(BaseModel):
    path: str = Field(
        default=None,
        description="Path to the created backup file.",
        examples=["/home/app/.local/share/spoolman/backups/spoolman.db"],
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
    date: SpoolmanDateTime = Field(description="When the event occured. UTC Timezone.")
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


class SettingEvent(Event):
    """Event."""

    payload: SettingKV = Field(description="Updated setting.")
    resource: Literal["setting"] = Field(description="Resource type.")
