"""Prometheus metrics collectors."""

import logging
from typing import Callable

import sqlalchemy
from prometheus_client import REGISTRY, Gauge, make_asgi_app
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from spoolman.database import models

registry = REGISTRY

PREFIX = "spoolman"

SPOOL_PRICE = Gauge(f"{PREFIX}_spool_price", "Total Spool price", ["spool_id", "filament_id"])
SPOOL_USED_WEIGHT = Gauge(f"{PREFIX}_spool_weight_used", "Spool Used Weight in grams", ["spool_id", "filament_id"])
SPOOL_INITIAL_WEIGHT = Gauge(
    f"{PREFIX}_spool_initial_weight",
    "Spool Net weight in grams",
    ["spool_id", "filament_id"],
)
FILAMENT_INFO = Gauge(
    f"{PREFIX}_filament_info",
    "Filament information",
    ["filament_id", "vendor", "name", "material", "color"],
)
FILAMENT_DENSITY = Gauge(f"{PREFIX}_filament_density", "Density of filament gram/cm3", ["filament_id"])
FILAMENT_DIAMETER = Gauge(f"{PREFIX}_filament_diameter", "Diameter of filament", ["filament_id"])
FILAMENT_WEIGHT = Gauge(f"{PREFIX}_filament_weight", "Net weight of filament", ["filament_id"])

logger = logging.getLogger(__name__)


def make_metrics_app() -> Callable:
    """Start ASGI prometheus app with global registry."""
    logger.info("Start metrics app")
    return make_asgi_app(registry=registry)


metrics_app = make_asgi_app()


async def spool_metrics(db: AsyncSession) -> None:
    """Get metrics by Spools from DB and write to prometheus.

    Args:
        db: async db session

    """
    stmt = sqlalchemy.select(models.Spool).where(
        sqlalchemy.or_(
            models.Spool.archived.is_(False),
            models.Spool.archived.is_(None),
        ),
    )
    rows = await db.execute(stmt)
    result = list(rows.unique().scalars().all())
    for row in result:
        if row.price is not None:
            SPOOL_PRICE.labels(str(row.id), str(row.filament_id)).set(row.price)
        if row.initial_weight is not None:
            SPOOL_INITIAL_WEIGHT.labels(str(row.id), str(row.filament_id)).set(row.initial_weight)
        SPOOL_USED_WEIGHT.labels(str(row.id), str(row.filament_id)).set(row.used_weight)


async def filament_metrics(db: AsyncSession) -> None:
    """Get metrics and info by Filaments from DB and write to prometheus.

    Args:
        db: async db session

    """
    stmt = (
        sqlalchemy.select(models.Filament)
        .options(contains_eager(models.Filament.vendor))
        .join(models.Filament.vendor, isouter=True)
    )
    rows = await db.execute(stmt)
    result = list(rows.unique().scalars().all())
    for row in result:
        vendor_name = "-"
        if row.vendor is not None:
            vendor_name = row.vendor.name
        FILAMENT_INFO.labels(
            str(row.id),
            vendor_name,
            row.name,
            row.material,
            row.color_hex,
        ).set(1)
        FILAMENT_DENSITY.labels(str(row.id)).set(row.density)
        if row.weight is not None:
            FILAMENT_WEIGHT.labels(str(row.id)).set(row.weight)
