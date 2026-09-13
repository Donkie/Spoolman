"""Numeric weight and diameter filters for the local cross-entity search."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from spoolman.database import models
from spoolman.database.search import search


def filament(vendor: models.Vendor, *, name: str, weight: float, diameter: float) -> models.Filament:
    return models.Filament(
        registered=datetime.now(timezone.utc),
        name=name,
        vendor=vendor,
        material="PLA",
        density=1.24,
        diameter=diameter,
        weight=weight,
    )


def spool(filament_item: models.Filament, *, initial_weight: float | None = None) -> models.Spool:
    return models.Spool(
        registered=datetime.now(timezone.utc),
        filament=filament_item,
        initial_weight=initial_weight,
        used_weight=0,
        archived=False,
    )


@pytest.mark.asyncio
async def test_local_search_compares_weight_and_diameter_numerically() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(models.Base.metadata.create_all)

    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        vendor = models.Vendor(registered=datetime.now(timezone.utc), name="Polymaker")
        one_kg = filament(vendor, name="One kilogram", weight=1000, diameter=1.75)
        one_hundred_g = filament(vendor, name="One hundred grams", weight=100, diameter=1.75)
        wide = filament(vendor, name="Wide", weight=1100, diameter=2.85)
        db.add_all(
            [
                spool(one_kg),
                spool(one_hundred_g),
                spool(wide),
                # A spool-specific initial weight takes precedence over the
                # filament's default weight.
                spool(one_kg, initial_weight=500),
            ],
        )
        await db.commit()

        kg_results = await search(db=db, query="1 kg", limit=100)
        assert [match.filament.weight for match in kg_results.filaments] == [1000]
        assert [match.spool.initial_weight for match in kg_results.spools] == [None]

        gram_results = await search(db=db, query="100", limit=100)
        assert not gram_results.is_color_query
        assert [match.filament.weight for match in gram_results.filaments] == [100]
        assert [match.spool.filament.weight for match in gram_results.spools] == [100]

        diameter_results = await search(db=db, query="2.85mm", limit=100)
        assert [match.filament.diameter for match in diameter_results.filaments] == [2.85]
        assert [match.spool.filament.diameter for match in diameter_results.spools] == [2.85]

    await engine.dispose()
