"""Tests for how measure() resolves a spool's empty spool (tare) weight."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool

from spoolman.database import models, spool


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("spool_weight", "expected_used"),
    [
        (0, 600),  # A refill on no spool: its own 0 is used, the 400 g reading is all filament.
        (None, 850),  # No tare of its own: the filament's 250 g is subtracted from the reading.
    ],
)
async def test_measure_tare(spool_weight: float | None, expected_used: float) -> None:
    """An explicit 0 tare sticks; only a missing one falls back to the filament's."""
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    async with AsyncSession(engine, expire_on_commit=False) as db:
        now = datetime(2026, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)  # stored naive, as UTC
        filament = models.Filament(registered=now, density=1.24, diameter=1.75, weight=1000, spool_weight=250)
        item = models.Spool(
            filament=filament,
            registered=now,
            initial_weight=1000,
            spool_weight=spool_weight,
            used_weight=0,
        )
        db.add(item)
        await db.commit()

    # A fresh session, as each API request gets.
    async with AsyncSession(engine, expire_on_commit=False) as db:
        result = await spool.measure(db, item.id, 400)
        assert result.used_weight == pytest.approx(expected_used)

    await engine.dispose()
