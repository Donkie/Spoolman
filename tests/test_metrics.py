"""Tests for the Prometheus metrics refresh dropping spools and filaments that are gone."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool

from spoolman.database import models
from spoolman.prometheus.metrics import filament_metrics, registry, spool_metrics


async def refresh(engine: AsyncEngine) -> None:
    """Run one metrics refresh in a fresh session, the way the scheduler does."""
    async with AsyncSession(engine) as db:
        await filament_metrics(db)
        await spool_metrics(db)


def used(spool_id: int, filament_id: int) -> float | None:
    """Return a spool's exported used weight, or None if it is not exported."""
    labels = {"spool_id": str(spool_id), "filament_id": str(filament_id)}
    return registry.get_sample_value("spoolman_spool_weight_used", labels)


def density(filament_id: int) -> float | None:
    """Return a filament's exported density, or None if it is not exported."""
    return registry.get_sample_value("spoolman_filament_density", {"filament_id": str(filament_id)})


def info(filament_id: int, name: str) -> float | None:
    """Return a vendorless filament's exported info sample, or None if it is not exported."""
    labels = {"filament_id": str(filament_id), "vendor": "-", "name": name, "material": "None", "color": "None"}
    return registry.get_sample_value("spoolman_filament_info", labels)


@pytest.mark.asyncio
async def test_refresh_drops_archived_and_deleted() -> None:
    """Archived and deleted spools, and deleted filaments, stop being exported on the next refresh."""
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    now = datetime(2026, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)  # stored naive, as UTC
    async with AsyncSession(engine, expire_on_commit=False) as db:
        kept = models.Filament(registered=now, name="Kept", density=1.24, diameter=1.75)
        gone = models.Filament(registered=now, name="Gone", density=1.27, diameter=1.75)
        spools = [models.Spool(filament=kept, registered=now, used_weight=w) for w in (10, 20, 30)]
        db.add_all([kept, gone, *spools])
        await db.commit()

    await refresh(engine)
    assert [used(s.id, kept.id) for s in spools] == [10, 20, 30]
    assert density(gone.id) == 1.27
    assert info(gone.id, "Gone") == 1

    async with AsyncSession(engine) as db:
        (await db.get(models.Spool, spools[1].id)).archived = True
        await db.delete(await db.get(models.Spool, spools[2].id))
        await db.delete(await db.get(models.Filament, gone.id))
        await db.commit()

    await refresh(engine)
    assert [used(s.id, kept.id) for s in spools] == [10, None, None]
    assert density(kept.id) == 1.24
    assert density(gone.id) is None
    assert info(kept.id, "Kept") == 1
    assert info(gone.id, "Gone") is None

    await engine.dispose()
