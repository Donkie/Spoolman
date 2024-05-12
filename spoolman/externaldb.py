"""Functions for syncing data from an external database of manufacturers, filaments, materials, etc."""

import datetime
import logging
import os
from typing import Optional

import hishel
from pydantic import BaseModel, ConfigDict, Extra, Field
from scheduler.asyncio.scheduler import Scheduler

DEFAULT_EXTERNAL_DB_URL = "https://donkie.github.io/SpoolmanDB/"
DEFAULT_SYNC_INTERVAL = 3600

controller = hishel.Controller(allow_stale=True)
cache_storage = hishel.AsyncFileStorage()

logger = logging.getLogger(__name__)


class ExternalFilamentParameters(BaseModel):
    model_config = ConfigDict(
        extra=Extra.allow,
    )

    extruder_temp: Optional[float] = Field(default=None)
    bed_temp: Optional[float] = Field(default=None)


class ExternalFilament(BaseModel):
    id: str = Field()
    manufacturer: str = Field()
    name: str = Field()
    material: str = Field()
    density: Optional[float] = Field(default=None)
    weight: float = Field(default=None)
    spool_weight: Optional[float] = Field(default=None)
    diameter: float = Field(default=None)
    color_hex: str = Field()
    parameters: ExternalFilamentParameters = Field(ExternalFilamentParameters())


class ExternalFilamentsFile(BaseModel):
    __root__: list[ExternalFilament]


class ExternalMaterial(BaseModel):
    material: str = Field()
    density: float = Field()


class ExternalMaterialsFile(BaseModel):
    __root__: list[ExternalMaterial]


class ExternalDB:
    filaments: list[ExternalFilament]
    materials: list[ExternalMaterial]

    def __init__(self) -> None:
        """Initialize the ExternalDB."""
        self.filaments = []
        self.materials = []


_externaldb = ExternalDB()


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


def _parse_filaments_from_bytes(data: bytes) -> list[ExternalFilament]:
    """Parse a bytes string into a list of ExternalFilament objects."""
    return ExternalFilamentsFile.parse_raw(data).__root__


def _parse_materials_from_bytes(data: bytes) -> list[ExternalMaterial]:
    """Parse a bytes string into a list of ExternalMaterial objects."""
    return ExternalMaterialsFile.parse_raw(data).__root__


def get_external_db() -> ExternalDB:
    """Get the external database."""
    return _externaldb


async def _sync() -> None:
    logger.info("Syncing external DB.")

    url = get_external_db_url()
    _externaldb.filaments = _parse_filaments_from_bytes(await _download_file(url + "filaments.json"))
    _externaldb.materials = _parse_materials_from_bytes(await _download_file(url + "materials.json"))
    logger.info(
        "External DB synced. Filaments: %d, Materials: %d",
        len(_externaldb.filaments),
        len(_externaldb.materials),
    )


def schedule_tasks(scheduler: Scheduler) -> None:
    """Schedule tasks to be executed by the provided scheduler.

    Args:
        scheduler: The scheduler to use for scheduling tasks.
    """
    logger.info("Scheduling external DB sync.")

    # Run once on startup
    scheduler.once(datetime.timedelta(seconds=0), _sync)  # type: ignore[arg-type]

    sync_interval = get_external_db_sync_interval()
    if sync_interval > 0:
        scheduler.cyclic(datetime.timedelta(seconds=DEFAULT_SYNC_INTERVAL), _sync)  # type: ignore[arg-type]
    else:
        logger.info("Sync interval is 0, skipping periodic sync of external db.")
