"""Pydantic data models for typing the FastAPI request/responses."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Vendor(BaseModel):
    id: int = Field(description="Unique internal ID of this vendor.")
    name: str = Field(max_length=64, description="Vendor name.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this vendor.")


class Filament(BaseModel):
    id: int = Field(description="Unique internal ID of this filament type.")
    name: Optional[str] = Field(
        max_length=64,
        description=(
            "Filament name, to distinguish this filament type among others from the same vendor."
            "Should contain its color for example."
        ),
    )
    vendor: Optional[Vendor] = Field(description="The vendor of this filament type.")
    material: Optional[str] = Field(max_length=64, description="The material of this filament, e.g. PLA.")
    price: Optional[float] = Field(ge=0, description="The price of this filament in the system configured currency.")
    density: float = Field(gt=0, description="The density of this filament in g/cm3.")
    diameter: float = Field(gt=0, description="The diameter of this filament in mm.")
    weight: Optional[float] = Field(gt=0, description="The weight of the filament in a full spool.")
    spool_weight: Optional[float] = Field(gt=0, description="The empty spool weight.")
    article_number: Optional[str] = Field(max_length=64, description="Vendor article number, e.g. EAN, QR code, etc.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this filament type.")


class Spool(BaseModel):
    id: int = Field(description="Unique internal ID of this spool of filament.")
    registered: datetime = Field(description="When the spool was registered in the database.")
    first_used: Optional[datetime] = Field(description="First logged occurence of spool usage.")
    last_used: Optional[datetime] = Field(description="Last logged occurence of spool usage.")
    filament: Filament = Field(description="The filament type of this spool.")
    weight: float = Field(ge=0, description="Remaining weight of filament on the spool.")
    location: Optional[str] = Field(max_length=64, description="Where this spool can be found.")
    lot_nr: Optional[str] = Field(max_length=64, description="Vendor manufacturing lot/batch number of the spool.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this specific spool.")
