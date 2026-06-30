"""Functions for syncing data from an external database of manufacturers, filaments, materials, etc."""

import datetime
import logging
import os
from collections.abc import Iterator
from enum import Enum
from pathlib import Path
from urllib.parse import urljoin

import hishel
from hishel.httpx import AsyncCacheClient
from pydantic import BaseModel, Field, RootModel
from scheduler.asyncio.scheduler import Scheduler

from spoolman import filecache
from spoolman.env import get_cache_dir

logger = logging.getLogger(__name__)


DEFAULT_EXTERNAL_DB_URL = "https://donkie.github.io/SpoolmanDB/"
DEFAULT_SYNC_INTERVAL = 3600

policy = hishel.SpecificationPolicy(cache_options=hishel.CacheOptions(allow_stale=True))
try:
    cache_dir = get_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / "hishel.sqlite"
    # AsyncSqliteStorage opens the database lazily, so touch the file now to surface an
    # unwritable cache directory here and fall back to an in-memory cache instead of
    # failing on the first sync (the old AsyncFileStorage raised at construction time).
    cache_path.touch(exist_ok=True)
    cache_storage = hishel.AsyncSqliteStorage(database_path=cache_path)
except OSError:
    logger.warning(
        "Failed to setup disk-based cache, the path %s may not be writable. Using in-memory cache instead as fallback.",
        str(get_cache_dir().resolve()),
    )
    cache_storage = hishel.AsyncSqliteStorage(database_path=":memory:")


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
    id: str = Field(description="A unique ID for this filament.", examples=["polymaker_pla_polysonicblack_1000_175"])
    manufacturer: str = Field(description="Filament manufacturer.", examples=["Polymaker"])
    name: str = Field(description="Filament name.", examples=["Polysonic\u2122 Black"])
    material: str = Field(description="Filament material.", examples=["PLA"])
    density: float = Field(description="Density in g/cm3.", examples=[1.23])
    weight: float = Field(description="Net weight of a single spool.", examples=[1000])
    spool_weight: float | None = Field(default=None, description="Weight of an empty spool.", examples=[140])
    spool_type: SpoolType | None = Field(None, description="Type of spool.", examples=[SpoolType.PLASTIC])
    diameter: float = Field(description="Filament in mm.", examples=[1.75])
    color_hex: str | None = Field(
        default=None,
        description="Filament color code in hex format, for single-color filaments.",
        examples=["2c3232"],
    )
    color_hexes: list[str] | None = Field(
        default=None,
        description="For multi-color filaments. List of hex color codes in hex format.",
        examples=[["2c3232", "5f5f5f"]],
    )
    extruder_temp: int | None = Field(default=None, description="Extruder/nozzle temperature in °C.", examples=[210])
    bed_temp: int | None = Field(default=None, description="Bed temperature in °C.", examples=[50])
    finish: Finish | None = Field(default=None, description="Finish of the filament.", examples=[Finish.MATTE])
    multi_color_direction: MultiColorDirection | None = Field(
        default=None,
        description="Direction of multi-color filaments.",
        examples=[MultiColorDirection.COAXIAL],
    )
    pattern: Pattern | None = Field(default=None, description="Pattern of the filament.", examples=[Pattern.MARBLE])
    translucent: bool = Field(default=False, description="Whether the filament is translucent.")
    glow: bool = Field(default=False, description="Whether the filament is glow-in-the-dark.")
    source: str | None = Field(default=None, description="Data source: 'spoolmandb' or 'tigertag'.")


class ExternalFilamentsFile(RootModel):
    root: list[ExternalFilament]

    def __iter__(self) -> Iterator[ExternalFilament]:
        """Iterate over the filaments."""
        return iter(self.root)

    def __getitem__(self, index: int) -> ExternalFilament:
        """Get a specific filament by index."""
        return self.root[index]


class ExternalMaterial(BaseModel):
    material: str = Field(examples=["PLA"])
    density: float = Field(examples=[1.24])
    extruder_temp: int | None = Field(default=None, description="Extruder/nozzle temperature in °C.", examples=[210])
    bed_temp: int | None = Field(default=None, description="Bed temperature in °C.", examples=[50])


class ExternalMaterialsFile(RootModel):
    root: list[ExternalMaterial]

    def __iter__(self) -> Iterator[ExternalMaterial]:
        """Iterate over the materials."""
        return iter(self.root)

    def __getitem__(self, index: int) -> ExternalMaterial:
        """Get a specific material by index."""
        return self.root[index]


def get_external_db_url() -> str:
    """Get the external database URL from environment variables. Defaults to DEFAULT_EXTERNAL_DB_URL."""
    return os.getenv("EXTERNAL_DB_URL", DEFAULT_EXTERNAL_DB_URL)


def get_external_db_sync_interval() -> int:
    """Get the external database sync interval from environment variables. Defaults to DEFAULT_SYNC_INTERVAL."""
    raw = os.getenv("EXTERNAL_DB_SYNC_INTERVAL")
    if raw is None:
        return DEFAULT_SYNC_INTERVAL
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "Invalid EXTERNAL_DB_SYNC_INTERVAL value %r, falling back to default of %d seconds.",
            raw,
            DEFAULT_SYNC_INTERVAL,
        )
        return DEFAULT_SYNC_INTERVAL


async def _download_file(url: str) -> bytes:
    """Download a file from a URL and return the contents as a string.

    Uses a file-based cache.
    """
    async with AsyncCacheClient(storage=cache_storage, policy=policy) as client:
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

    filaments = _parse_filaments_from_bytes(await _download_file(urljoin(url, "filaments.json")))
    materials = _parse_materials_from_bytes(await _download_file(urljoin(url, "materials.json")))

    _write_to_local_cache("filaments.json", filaments.json().encode())
    _write_to_local_cache("materials.json", materials.json().encode())

    logger.info(
        "External DB synced. Filaments: %d, Materials: %d",
        len(filaments.root),
        len(materials.root),
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
        scheduler.cyclic(datetime.timedelta(seconds=sync_interval), _sync)  # type: ignore[arg-type]
    else:
        logger.info("Sync interval is 0, skipping periodic sync of external db.")
