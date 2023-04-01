"""Filament related endpoints."""

from typing import Union
from fastapi import APIRouter

from spoolson.api.v1.models import Filament

router = APIRouter(
    prefix="/filament",
    tags=["filament"],
)
