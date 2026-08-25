"""Tests for spoolman.database.tag.create_spool_from_decoded_tag.

Deliberately kept separate from the rest of the unit suite: every other module in tests/ is
pure (see conftest.py's docstring), but this function's whole job is composing three DB
writes (vendor, filament, spool) plus a tag link, so it needs a real session to mean
anything. Rather than pull a database engine into the shared suite's fixtures, this file
builds its own throwaway in-memory SQLite engine and disposes of it per test -- nothing here
is shared with, or changes the assumptions of, any other unit test file. End-to-end coverage
through the actual HTTP endpoint (POST /tag/scan with `create: true`) lives in
tests_integration/tests/tag/ instead, where a real server is already up.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from spoolman.database import models
from spoolman.database.tag import create_spool_from_decoded_tag, find_spool_by_uid
from spoolman.exceptions import TagConflictError
from spoolman.tag_decode import DecodedTag


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, autocommit=False, autoflush=True, expire_on_commit=False)
    async with session_maker() as session:
        yield session

    await engine.dispose()


def _uid(suffix: str = "1") -> str:
    return f"04A2B3C4D5E6{suffix.zfill(2)}"


@pytest.mark.asyncio
async def test_creates_spool_filament_and_vendor(db: AsyncSession):
    decoded = DecodedTag(
        material_type="PLA",
        material_name="PLA Galaxy Black",
        brand_name="Prusament",
        color_hex="112233",
        diameter_mm=1.75,
        density_g_cm3=1.24,
        net_weight_g=1000.0,
        empty_container_weight_g=140.0,
        consumed_weight_g=None,
        external_id="some-instance-uuid",
    )

    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.material == "PLA"
    assert spool.filament.name == "PLA Galaxy Black"
    assert spool.filament.color_hex == "112233"
    assert spool.filament.diameter == pytest.approx(1.75)
    assert spool.filament.density == pytest.approx(1.24)
    assert spool.filament.weight == pytest.approx(1000.0)
    assert spool.filament.spool_weight == pytest.approx(140.0)
    assert spool.filament.external_id == "some-instance-uuid"
    assert spool.filament.vendor is not None
    assert spool.filament.vendor.name == "Prusament"


@pytest.mark.asyncio
async def test_links_the_tag_so_a_later_lookup_matches(db: AsyncSession):
    uid = _uid()
    decoded = DecodedTag(material_type="PLA")

    spool = await create_spool_from_decoded_tag(db=db, uid=uid, tag_format="openprinttag", decoded=decoded)

    found = await find_spool_by_uid(db, uid)
    assert found is not None
    assert found.id == spool.id


@pytest.mark.asyncio
async def test_no_brand_name_creates_no_vendor(db: AsyncSession):
    decoded = DecodedTag(material_type="PLA", brand_name=None)

    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.vendor is None


@pytest.mark.asyncio
async def test_reuses_an_existing_vendor_with_an_exact_name_match(db: AsyncSession):
    first = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("1"),
        tag_format="openprinttag",
        decoded=DecodedTag(material_type="PLA", brand_name="Prusament"),
    )
    second = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("2"),
        tag_format="openprinttag",
        decoded=DecodedTag(material_type="PETG", brand_name="Prusament"),
    )

    assert first.filament.vendor is not None
    assert second.filament.vendor is not None
    assert first.filament.vendor.id == second.filament.vendor.id


@pytest.mark.asyncio
async def test_does_not_substring_match_an_existing_vendor(db: AsyncSession):
    """"Prusa" existing must not swallow a new "Prusament" -- exact match only."""
    short = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("1"),
        tag_format="openprinttag",
        decoded=DecodedTag(material_type="PLA", brand_name="Prusa"),
    )
    longer = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("2"),
        tag_format="openprinttag",
        decoded=DecodedTag(material_type="PLA", brand_name="Prusament"),
    )

    assert short.filament.vendor is not None
    assert longer.filament.vendor is not None
    assert short.filament.vendor.id != longer.filament.vendor.id
    assert longer.filament.vendor.name == "Prusament"


@pytest.mark.asyncio
async def test_uses_decoded_density_when_present(db: AsyncSession):
    decoded = DecodedTag(material_type="ABS", density_g_cm3=1.05)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.density == pytest.approx(1.05)


@pytest.mark.asyncio
async def test_falls_back_to_the_material_table_density_when_tag_omits_it(db: AsyncSession):
    decoded = DecodedTag(material_type="ABS", density_g_cm3=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.density == pytest.approx(1.04)  # ABS in the approximate-density table


@pytest.mark.asyncio
async def test_falls_back_to_the_pla_equivalent_density_for_an_unknown_material(db: AsyncSession):
    decoded = DecodedTag(material_type=None, density_g_cm3=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.density == pytest.approx(1.24)


@pytest.mark.asyncio
async def test_defaults_diameter_to_175_when_the_tag_omits_it(db: AsyncSession):
    decoded = DecodedTag(material_type="PLA", diameter_mm=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.diameter == pytest.approx(1.75)


@pytest.mark.asyncio
async def test_consumed_weight_becomes_used_weight_on_the_spool(db: AsyncSession):
    decoded = DecodedTag(material_type="PLA", consumed_weight_g=123.4)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.used_weight == pytest.approx(123.4)


@pytest.mark.asyncio
async def test_no_consumed_weight_means_a_fresh_spool(db: AsyncSession):
    decoded = DecodedTag(material_type="PLA", consumed_weight_g=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.used_weight == 0


@pytest.mark.asyncio
async def test_a_second_create_for_an_already_linked_uid_conflicts(db: AsyncSession):
    """Matches the race documented on the function: the spool this call made is not rolled back."""
    uid = _uid()
    await create_spool_from_decoded_tag(
        db=db,
        uid=uid,
        tag_format="openprinttag",
        decoded=DecodedTag(material_type="PLA"),
    )

    with pytest.raises(TagConflictError):
        await create_spool_from_decoded_tag(
            db=db,
            uid=uid,
            tag_format="openprinttag",
            decoded=DecodedTag(material_type="PETG"),
        )
