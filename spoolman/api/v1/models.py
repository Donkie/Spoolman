"""Pydantic data models for typing the FastAPI request/responses."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from spoolman.database import models


class Message(BaseModel):
    message: str = Field()


class Vendor(BaseModel):
    id: int = Field(description="Unique internal ID of this vendor.")
    name: str = Field(max_length=64, description="Vendor name.", example="Polymaker")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this vendor.", example="")

    @staticmethod
    def from_db(item: models.Vendor) -> "Vendor":
        """Create a new Pydantic vendor object from a database vendor object."""
        return Vendor(
            id=item.id,
            name=item.name,
            comment=item.comment,
        )


class Filament(BaseModel):
    id: int = Field(description="Unique internal ID of this filament type.")
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

    @staticmethod
    def from_db(item: models.Filament) -> "Filament":
        """Create a new Pydantic filament object from a database filament object."""
        return Filament(
            id=item.id,
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
        )


class Spool(BaseModel):
    id: int = Field(description="Unique internal ID of this spool of filament.")
    registered: datetime = Field(description="When the spool was registered in the database.")
    first_used: Optional[datetime] = Field(description="First logged occurence of spool usage.")
    last_used: Optional[datetime] = Field(description="Last logged occurence of spool usage.")
    filament: Filament = Field(description="The filament type of this spool.")
    remaining_weight: Optional[float] = Field(
        default=None,
        ge=0,
        description=(
            "Estimated remaining weight of filament on the spool. Only set if the filament type has a weight set."
        ),
        example=500,
    )
    used_weight: float = Field(ge=0, description="Consumed weight of filament from the spool.", example=500)
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

    @staticmethod
    def from_db(item: models.Spool) -> "Spool":
        """Create a new Pydantic spool object from a database spool object."""
        filament = Filament.from_db(item.filament)
        remaining_weight: Optional[float] = None
        if filament.weight is not None:
            remaining_weight = max(filament.weight - item.used_weight, 0)

        return Spool(
            id=item.id,
            registered=item.registered,
            first_used=item.first_used,
            last_used=item.last_used,
            filament=filament,
            used_weight=item.used_weight,
            remaining_weight=remaining_weight,
            location=item.location,
            lot_nr=item.lot_nr,
            comment=item.comment,
        )
