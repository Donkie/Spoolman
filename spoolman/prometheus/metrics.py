import sqlalchemy
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from spoolman.database import models

from prometheus_client import REGISTRY, make_asgi_app, Gauge

PREFIX = "spoolman"

SPOOL_PRICE = Gauge("%s_spool_price" % PREFIX, "Total Spool price", ['spool_id', 'filament_id'])
SPOOL_USED_WEIGHT = Gauge("%s_spool_weight_used" % PREFIX, "Spool Used Weight", ['spool_id', 'filament_id'])
FILAMENT_INFO = Gauge("%s_filament_info" % PREFIX, "Filament information", [
            'filament_id',
            'vendor',
            'name',
            'material',
            'color'])
FILAMENT_DENSITY = Gauge("%s_filament_density" % PREFIX, "Density of filament", ["filament_id"])
FILAMENT_DIAMETER = Gauge("%s_filament_diameter" % PREFIX, "Diameter of filament", ["filament_id"])
FILAMENT_WEIGHT = Gauge("%s_filament_weight" % PREFIX, "Net weight of filament", ["filament_id"])

logger = logging.getLogger(__name__)


def make_metrics_app():
    registry = REGISTRY
    logger.info("Start metrics app")
    return make_asgi_app(registry=registry)


metrics_app = make_metrics_app()


async def spool_metrics(db: AsyncSession) -> None:
    stmt = (
        sqlalchemy.select(models.Spool)
            .where(
                sqlalchemy.or_(
                    models.Spool.archived.is_(False),
                    models.Spool.archived.is_(None),
                )
            )
    )
    rows = await db.execute(stmt)
    result = list(rows.unique().scalars().all())
    for row in result:
        SPOOL_PRICE.labels(str(row.id), str(row.filament_id)).set(row.price)
        SPOOL_USED_WEIGHT.labels(str(row.id), str(row.filament_id)).set(row.used_weight)


async def filament_metrics(db: AsyncSession) -> None:
    stmt = (
        sqlalchemy.select(models.Filament)
            .options(contains_eager(models.Filament.vendor))
            .join(models.Filament.vendor, isouter=True)
    )
    rows = await db.execute(stmt)
    result = list(rows.unique().scalars().all())
    for row in result:
        FILAMENT_INFO.labels(str(row.id),
                             row.vendor.name,
                             row.name,
                             row.material,
                             row.color_hex).set(1)
        FILAMENT_DENSITY.labels(str(row.id)).set(row.density)
        FILAMENT_DIAMETER.labels(str(row.id)).set(row.diameter)
        FILAMENT_WEIGHT.labels(str(row.id)).set(row.weight)

