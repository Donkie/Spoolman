"""Functions for syncing data from an external database of manufacturers, filaments, materials, etc."""

import datetime
import logging
import os
from enum import Enum
from pathlib import Path
from typing import Optional

import hishel
from pydantic import BaseModel, Field
from scheduler.asyncio.scheduler import Scheduler

from spoolman import filecache
from spoolman.env import get_cache_dir

logger = logging.getLogger(__name__)


DEFAULT_EXTERNAL_DB_URL = "https://donkie.github.io/SpoolmanDB/"
DEFAULT_SYNC_INTERVAL = 3600

controller = hishel.Controller(allow_stale=True)
try:
    cache_path = get_cache_dir() / "hishel"
    cache_storage = hishel.AsyncFileStorage(base_path=cache_path)
except PermissionError:
    logger.warning(
        "Failed to setup disk-based cache due to permission error. Ensure the path %s is writable. "
        "Using in-memory cache instead as fallback.",
        str(cache_path.resolve()),
    )
    cache_storage = hishel.AsyncInMemoryStorage()


class SpoolType(Enum):
    PLASTIC = "plastic"
    CARDBOARD = "cardboard"
    METAL = "metal"


class Finish(Enum):
    MATTE = "matte"
    GLOSSY = "glossy"


class MultiColorDirection(Enum):
    COAXIAL = "coaxial"
    LONGITUDINAL = "longitudinal"


class Pattern(Enum):
    MARBLE = "marble"
    SPARKLE = "sparkle"


class ExternalFilament(BaseModel):
    id: str = Field(description="A unique ID for this filament.", example="polymaker_pla_polysonicblack_1000_175")
    manufacturer: str = Field(description="Filament manufacturer.", example="Polymaker")
    name: str = Field(description="Filament name.", example="Polysonic\u2122 Black")
    material: str = Field(description="Filament material.", example="PLA")
    density: float = Field(description="Density in g/cm3.", example=1.23)
    weight: float = Field(description="Net weight of a single spool.", example=1000)
    spool_weight: Optional[float] = Field(default=None, description="Weight of an empty spool.", example=140)
    spool_type: Optional[SpoolType] = Field(description="Type of spool.", example=SpoolType.PLASTIC)
    diameter: float = Field(description="Filament in mm.", example=1.75)
    color_hex: Optional[str] = Field(
        default=None,
        description="Filament color code in hex format, for single-color filaments.",
        example="2c3232",
    )
    color_hexes: Optional[list[str]] = Field(
        default=None,
        description="For multi-color filaments. List of hex color codes in hex format.",
        example=["2c3232", "5f5f5f"],
    )
    extruder_temp: Optional[int] = Field(default=None, description="Extruder/nozzle temperature in °C.", example=210)
    bed_temp: Optional[int] = Field(default=None, description="Bed temperature in °C.", example=50)
    finish: Optional[Finish] = Field(default=None, description="Finish of the filament.", example=Finish.MATTE)
    multi_color_direction: Optional[MultiColorDirection] = Field(
        default=None,
        description="Direction of multi-color filaments.",
        example=MultiColorDirection.COAXIAL,
    )
    pattern: Optional[Pattern] = Field(default=None, description="Pattern of the filament.", example=Pattern.MARBLE)
    translucent: bool = Field(default=False, description="Whether the filament is translucent.")
    glow: bool = Field(default=False, description="Whether the filament is glow-in-the-dark.")


class ExternalFilamentsFile(BaseModel):
    __root__: list[ExternalFilament]


class ExternalMaterial(BaseModel):
    material: str = Field(example="PLA")
    density: float = Field(example=1.24)
    extruder_temp: Optional[int] = Field(default=None, description="Extruder/nozzle temperature in °C.", example=210)
    bed_temp: Optional[int] = Field(default=None, description="Bed temperature in °C.", example=50)


class ExternalMaterialsFile(BaseModel):
    __root__: list[ExternalMaterial]


def get_external_db_url() -> str:
    """Get the external database URL from environment variables. Defaults to DEFAULT_EXTERNAL_DB_URL."""
    return os.getenv("EXTERNAL_DB_URL", DEFAULT_EXTERNAL_DB_URL).strip("/") + "/"


def get_external_db_sync_interval() -> int:
    """Get the external database sync interval from environment variables. Defaults to DEFAULT_SYNC_INTERVAL."""
    return int(os.getenv("EXTERNAL_DB_SYNC_INTERVAL", DEFAULT_SYNC_INTERVAL))


async def _download_file(url: str) -> bytes:
    """Download a file from a URL and return the contents as a string.

    Uses a file-based cache.
    """
    async with hishel.AsyncCacheClient(storage=cache_storage, controller=controller) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.read()


def _parse_filaments_from_bytes(data: bytes) -> ExternalFilamentsFile:
    """Parse a bytes string into a list of ExternalFilament objects."""
    return ExternalFilamentsFile.parse_raw(data)


def _parse_materials_from_bytes(data: bytes) -> ExternalMaterialsFile:
    """Parse a bytes string into a list of ExternalMaterial objects."""
    return ExternalMaterialsFile.parse_raw(data)


def _write_to_local_cache(filename: str, data: bytes) -> None:
    """Write data to the local cache."""
    filecache.update_file(filename, data)


def get_filaments_file() -> Path:
    """Get the path to the filaments file."""
    return filecache.get_file("filaments.json")


def get_materials_file() -> Path:
    """Get the path to the materials file."""
    return filecache.get_file("materials.json")


async def _sync() -> None:
    logger.info("Syncing external DB.")

    url = get_external_db_url()

    filaments = _parse_filaments_from_bytes(await _download_file(url + "filaments.json"))
    materials = _parse_materials_from_bytes(await _download_file(url + "materials.json"))

    _write_to_local_cache("filaments.json", filaments.json().encode())
    _write_to_local_cache("materials.json", materials.json().encode())

    logger.info(
        "External DB synced. Filaments: %d, Materials: %d",
        len(filaments.__root__),
        len(materials.__root__),
    )


def schedule_tasks(scheduler: Scheduler) -> None:
    """Schedule tasks to be executed by the provided scheduler.

    Args:
        scheduler: The scheduler to use for scheduling tasks.
    """
    if len(get_external_db_url().strip()) == 0:
        logger.info("External DB URL is empty. Skipping sync.")
        return

    logger.info("Scheduling external DB sync.")

    # Run once on startup
    scheduler.once(datetime.timedelta(seconds=0), _sync)  # type: ignore[arg-type]

    sync_interval = get_external_db_sync_interval()
    if sync_interval > 0:
        scheduler.cyclic(datetime.timedelta(seconds=DEFAULT_SYNC_INTERVAL), _sync)  # type: ignore[arg-type]
    else:
        logger.info("Sync interval is 0, skipping periodic sync of external db.")
