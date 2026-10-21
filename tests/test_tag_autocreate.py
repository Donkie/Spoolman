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
import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from spoolman.database import models
from spoolman.database.tag import create_spool_from_decoded_tag, find_spool_by_uid
from spoolman.exceptions import ItemCreateError, TagConflictError
from spoolman.tags.decode import DecodedTag


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
        material="PLA",
        name="PLA Galaxy Black",
        vendor_name="Prusament",
        color_hex="112233",
        diameter=1.75,
        density=1.24,
        weight=1000.0,
        spool_weight=140.0,
        used_weight=None,
        instance_uuid="some-instance-uuid",
    )

    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.material == "PLA"
    assert spool.filament.name == "PLA Galaxy Black"
    assert spool.filament.color_hex == "112233"
    assert spool.filament.diameter == pytest.approx(1.75)
    assert spool.filament.density == pytest.approx(1.24)
    assert spool.filament.weight == pytest.approx(1000.0)
    assert spool.filament.spool_weight == pytest.approx(140.0)
    assert spool.filament.external_id is None  # the roll id lives on the tag, not the product
    assert spool.filament.vendor is not None
    assert spool.filament.vendor.name == "Prusament"


@pytest.mark.asyncio
async def test_links_the_tag_so_a_later_lookup_matches(db: AsyncSession):
    uid = _uid()
    decoded = DecodedTag(material="PLA")

    spool = await create_spool_from_decoded_tag(db=db, uid=uid, tag_format="openprinttag", decoded=decoded)

    found = await find_spool_by_uid(db, uid)
    assert found is not None
    assert found.id == spool.id


@pytest.mark.asyncio
async def test_no_brand_name_creates_no_vendor(db: AsyncSession):
    decoded = DecodedTag(material="PLA", vendor_name=None)

    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.vendor is None


@pytest.mark.asyncio
async def test_reuses_an_existing_vendor_with_an_exact_name_match(db: AsyncSession):
    first = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("1"),
        tag_format="openprinttag",
        decoded=DecodedTag(material="PLA", vendor_name="Prusament"),
    )
    second = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("2"),
        tag_format="openprinttag",
        decoded=DecodedTag(material="PETG", vendor_name="Prusament"),
    )

    assert first.filament.vendor is not None
    assert second.filament.vendor is not None
    assert first.filament.vendor.id == second.filament.vendor.id


@pytest.mark.asyncio
async def test_does_not_substring_match_an_existing_vendor(db: AsyncSession):
    """An existing "Prusa" vendor must not swallow a new "Prusament" -- exact match only."""
    short = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("1"),
        tag_format="openprinttag",
        decoded=DecodedTag(material="PLA", vendor_name="Prusa"),
    )
    longer = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("2"),
        tag_format="openprinttag",
        decoded=DecodedTag(material="PLA", vendor_name="Prusament"),
    )

    assert short.filament.vendor is not None
    assert longer.filament.vendor is not None
    assert short.filament.vendor.id != longer.filament.vendor.id
    assert longer.filament.vendor.name == "Prusament"


@pytest.mark.asyncio
async def test_uses_decoded_density_when_present(db: AsyncSession):
    decoded = DecodedTag(material="ABS", density=1.05)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.density == pytest.approx(1.05)


@pytest.mark.asyncio
async def test_falls_back_to_the_material_table_density_when_tag_omits_it(db: AsyncSession):
    decoded = DecodedTag(material="ABS", density=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.density == pytest.approx(1.04)  # ABS in the approximate-density table


@pytest.mark.asyncio
async def test_falls_back_to_the_pla_equivalent_density_for_an_unknown_material(db: AsyncSession):
    decoded = DecodedTag(material=None, density=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.density == pytest.approx(1.24)


@pytest.mark.asyncio
async def test_defaults_diameter_to_175_when_the_tag_omits_it(db: AsyncSession):
    decoded = DecodedTag(material="PLA", diameter=None)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert spool.filament.diameter == pytest.approx(1.75)


@pytest.mark.asyncio
async def test_consumed_weight_is_shown_but_never_applied_to_the_spool(db: AsyncSession):
    decoded = DecodedTag(material="PLA", used_weight=123.4)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)
    assert not spool.used_weight  # shown on the decoded tag, never applied


@pytest.mark.asyncio
async def test_no_consumed_weight_means_a_fresh_spool(db: AsyncSession):
    decoded = DecodedTag(material="PLA", used_weight=None)
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
        decoded=DecodedTag(material="PLA"),
    )

    with pytest.raises(TagConflictError):
        await create_spool_from_decoded_tag(
            db=db,
            uid=uid,
            tag_format="openprinttag",
            decoded=DecodedTag(material="PETG"),
        )


@pytest.mark.asyncio
async def test_losing_a_uid_race_leaves_no_orphan_rows(db: AsyncSession):
    """Two scans of the same new tag racing to create: the loser's own rows must not survive.

    Vendor, filament, spool and the tag link are flushed, not committed, and share one
    commit -- so when the link step loses the race (the winner's tag row already holds
    this UID), the rollback undoes everything this call flushed in one step, not a
    per-row compensating delete.
    """
    uid = _uid()
    winner = await create_spool_from_decoded_tag(
        db=db,
        uid=uid,
        tag_format="openprinttag",
        decoded=DecodedTag(material="PLA", name="PLA", vendor_name="Vendor"),
    )
    before = await _row_counts(db)

    with pytest.raises(TagConflictError):
        await create_spool_from_decoded_tag(
            db=db,
            uid=uid,
            tag_format="openprinttag",
            decoded=DecodedTag(material="PETG", name="PETG", vendor_name="OtherVendor"),
        )

    assert await _row_counts(db) == before
    found = await find_spool_by_uid(db, uid)
    assert found is not None
    assert found.id == winner.id


async def _row_counts(db: AsyncSession) -> tuple[int, int, int]:
    """Count vendors, filaments and spools, to prove a rejected create wrote nothing."""
    counts = [
        (await db.execute(sqlalchemy.select(sqlalchemy.func.count()).select_from(model))).scalar_one()
        for model in (models.Vendor, models.Filament, models.Spool)
    ]
    return counts[0], counts[1], counts[2]


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"name": "x" * 300}, id="name-too-long"),
        pytest.param({"vendor_name": "y" * 300}, id="brand-too-long"),
        pytest.param({"density": -1.0}, id="negative-density"),
        pytest.param({"density": float("nan")}, id="nan-density"),
        pytest.param({"weight": float("inf")}, id="infinite-weight"),
        pytest.param({"initial_weight": -5.0}, id="negative-initial-weight"),
    ],
)
@pytest.mark.asyncio
async def test_invalid_decoded_values_are_rejected_before_any_write(db: AsyncSession, overrides: dict):
    fields = {
        "material": "PLA",
        "name": "PLA",
        "vendor_name": "Vendor",
        "diameter": 1.75,
        "density": 1.24,
        "weight": 1000.0,
        "spool_weight": 140.0,
    }
    fields.update(overrides)
    decoded = DecodedTag(**fields)

    with pytest.raises(ItemCreateError):
        await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    # The point of validating first: no vendor, filament or spool row survives the rejection,
    # so the list endpoints keep working.
    assert await _row_counts(db) == (0, 0, 0)
    assert await find_spool_by_uid(db, _uid()) is None


@pytest.mark.asyncio
async def test_a_second_roll_of_the_same_product_reuses_the_filament(db: AsyncSession):
    product = {"material": "PLA", "name": "PLA Galaxy Black", "vendor_name": "Prusament", "weight": 1000.0}
    first = await create_spool_from_decoded_tag(
        db=db, uid=_uid("1"), tag_format="openprinttag", decoded=DecodedTag(**product, instance_uuid="roll-a")
    )
    second = await create_spool_from_decoded_tag(
        db=db, uid=_uid("2"), tag_format="openprinttag", decoded=DecodedTag(**product, instance_uuid="roll-b")
    )

    assert second.filament_id == first.filament_id
    assert await _row_counts(db) == (1, 1, 2)


@pytest.mark.asyncio
async def test_nominal_weight_goes_on_the_filament_and_measured_weight_on_the_spool(db: AsyncSession):
    decoded = DecodedTag(material="PLA", name="PLA", weight=1000.0, initial_weight=998.5, spool_weight=140.0)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.weight == pytest.approx(1000.0)
    assert spool.initial_weight == pytest.approx(998.5)


@pytest.mark.asyncio
async def test_article_number_and_temperatures_fill_the_filament_settings(db: AsyncSession):
    decoded = DecodedTag(material="PLA", name="PLA", article_number="8435008400000", extruder_temp=215, bed_temp=60)
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.article_number == "8435008400000"
    assert spool.filament.settings_extruder_temp == 215
    assert spool.filament.settings_bed_temp == 60


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"density": 0.0}, id="zero-density"),
        pytest.param({"diameter": 0.0}, id="zero-diameter"),
        pytest.param({"diameter": 1e-200}, id="diameter-tiny"),
        pytest.param({"diameter": 1e308}, id="diameter-huge"),
    ],
)
@pytest.mark.asyncio
async def test_zero_or_out_of_range_values_are_refused_not_defaulted(db: AsyncSession, overrides: dict):
    fields = {"material": "PLA", "name": "PLA", "vendor_name": "Vendor", "density": 1.24, "diameter": 1.75}
    fields.update(overrides)

    with pytest.raises(ItemCreateError):
        await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=DecodedTag(**fields))

    assert await _row_counts(db) == (0, 0, 0)


@pytest.mark.asyncio
async def test_missing_density_and_diameter_still_fall_back(db: AsyncSession):
    decoded = DecodedTag(material="PLA", name="PLA")
    spool = await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert spool.filament.diameter == pytest.approx(1.75)
    assert spool.filament.density == pytest.approx(1.24)


@pytest.mark.asyncio
async def test_same_name_but_other_diameter_or_weight_is_a_new_filament(db: AsyncSession):
    base = {"material": "PLA", "name": "PLA Black", "vendor_name": "Vendor"}
    first = await create_spool_from_decoded_tag(
        db=db, uid=_uid("1"), tag_format="openprinttag", decoded=DecodedTag(**base, diameter=1.75, weight=1000.0)
    )
    other_diameter = await create_spool_from_decoded_tag(
        db=db, uid=_uid("2"), tag_format="openprinttag", decoded=DecodedTag(**base, diameter=2.85, weight=1000.0)
    )
    other_weight = await create_spool_from_decoded_tag(
        db=db, uid=_uid("3"), tag_format="openprinttag", decoded=DecodedTag(**base, diameter=1.75, weight=500.0)
    )

    assert other_diameter.filament_id != first.filament_id
    assert other_weight.filament_id != first.filament_id


@pytest.mark.asyncio
async def test_small_diameter_and_weight_differences_still_reuse_the_filament(db: AsyncSession):
    """Both columns are single precision on MySQL/MariaDB; exact equality would never match there."""
    base = {"material": "PLA", "name": "PLA Black", "vendor_name": "Vendor"}
    first = await create_spool_from_decoded_tag(
        db=db, uid=_uid("1"), tag_format="openprinttag", decoded=DecodedTag(**base, diameter=1.75, weight=1000.0)
    )
    close_enough = await create_spool_from_decoded_tag(
        db=db,
        uid=_uid("2"),
        tag_format="openprinttag",
        decoded=DecodedTag(**base, diameter=1.751, weight=1000.5),
    )

    assert close_enough.filament_id == first.filament_id


@pytest.mark.asyncio
async def test_same_name_but_other_color_is_a_new_filament(db: AsyncSession):
    base = {"material": "PLA", "name": "PLA", "vendor_name": "Vendor", "diameter": 1.75, "weight": 1000.0}
    red = await create_spool_from_decoded_tag(
        db=db, uid=_uid("1"), tag_format="openprinttag", decoded=DecodedTag(**base, color_hex="FF0000")
    )
    black = await create_spool_from_decoded_tag(
        db=db, uid=_uid("2"), tag_format="openprinttag", decoded=DecodedTag(**base, color_hex="000000")
    )

    assert black.filament_id != red.filament_id


@pytest.mark.asyncio
async def test_a_failure_partway_leaves_no_rows_behind(db: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    async def fail_link(**_kwargs: object) -> None:
        raise RuntimeError("link failed after the spool was written")

    monkeypatch.setattr("spoolman.database.tag.link_spool", fail_link)
    decoded = DecodedTag(material="PLA", name="PLA", vendor_name="Vendor", weight=1000.0)

    with pytest.raises(RuntimeError):
        await create_spool_from_decoded_tag(db=db, uid=_uid(), tag_format="openprinttag", decoded=decoded)

    assert await _row_counts(db) == (0, 0, 0)
