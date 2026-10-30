"""Tests for LIKE wildcard escaping in search patterns."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool

from spoolman.database import models, spool
from spoolman.database.utils import LIKE_ESCAPE, escape_like


def test_percent_is_escaped():
    """Otherwise a search for "%" matches every row."""
    assert escape_like("%") == f"{LIKE_ESCAPE}%"


def test_underscore_is_escaped():
    """Otherwise "PLA_Basic" also matches "PLAxBasic"."""
    assert escape_like("PLA_Basic") == f"PLA{LIKE_ESCAPE}_Basic"


def test_the_escape_character_is_escaped_first():
    """A literal escape char must not turn the following character into an escaped one."""
    assert escape_like(f"{LIKE_ESCAPE}%") == f"{LIKE_ESCAPE}{LIKE_ESCAPE}{LIKE_ESCAPE}%"


def test_ordinary_text_is_untouched():
    assert escape_like("Prusament Galaxy Black") == "Prusament Galaxy Black"


@pytest.mark.parametrize("term", ["100% silk", "a_b", "%_%", LIKE_ESCAPE, ""])
def test_escaping_is_idempotent_in_meaning(term: str):
    """Escaping never drops characters; the pattern only ever grows."""
    assert len(escape_like(term)) >= len(term)


def test_the_escape_character_is_not_a_backslash():
    """A backslash ESCAPE clause is ambiguous under MySQL/MariaDB string parsing."""
    assert LIKE_ESCAPE != "\\"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("filters", "expected"),
    [
        ({"location": "A_1"}, ["Shelf A_1"]),
        ({"location": "100%"}, ["Bin 100%"]),
        ({"location": "%"}, ["Bin 100%"]),
        ({"vendor_name": "Foo_Bar"}, ["Shelf A_1"]),
    ],
)
async def test_list_filters_match_wildcards_literally(filters: dict[str, str], expected: list[str]):
    """The plain column filters are a partial match on the text given, the same as search."""
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    async with AsyncSession(engine, expire_on_commit=False) as db:
        now = datetime(2026, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)  # stored naive, as UTC
        for vendor_name, location in [
            ("Foo_Bar", "Shelf A_1"),
            ("FooXBar", "Shelf AB1"),
            ("FooXBar", "Bin 100%"),
            ("FooXBar", "Bin 1000"),
        ]:
            vendor = models.Vendor(registered=now, name=vendor_name)
            filament = models.Filament(registered=now, density=1.24, diameter=1.75, vendor=vendor)
            db.add(models.Spool(filament=filament, registered=now, used_weight=0, location=location))
        await db.commit()

    async with AsyncSession(engine, expire_on_commit=False) as db:
        items, _ = await spool.find(db=db, **filters)
        assert sorted(item.location for item in items) == expected

    await engine.dispose()
