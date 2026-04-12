"""TigerTag to Spoolman spool matching and reverse mapping.

Provides functions to:
- Find a Spoolman spool from decoded TigerTag data
- Map a Spoolman spool/filament to TigerTag binary format
- Bind a spool to a specific TigerTag via (id_product, timestamp) pair
"""

import json
import logging
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from spoolman.database.models import Filament, Spool, SpoolField, Vendor
from spoolman.tigertag_codec import TigerTagData

logger = logging.getLogger(__name__)


def _make_nfc_tag_id(tag_data: TigerTagData) -> str | None:
    """Build a spool-level NFC tag identifier from TigerTag data.

    Uses (id_product, timestamp) as a composite key. Both tags on the same
    spool share the same timestamp, so both sides resolve to the same spool.

    Returns None if the tag doesn't have a usable timestamp.
    """
    if tag_data.id_product > 0 and tag_data.timestamp > 0:
        return f"tigertag_{tag_data.id_product}_{tag_data.timestamp}"
    return None


async def bind_spool_to_tigertag(db: AsyncSession, spool: Spool, tag_data: TigerTagData) -> bool:
    """Bind a spool to a specific TigerTag by storing the (id_product, timestamp) key.

    Stores a SpoolField with key="nfc_tag_id" so future scans resolve to this
    exact spool. Both sides of a spool produce the same key (shared timestamp).

    Returns True if a new binding was created, False if already bound or no usable key.
    """
    nfc_tag_id = _make_nfc_tag_id(tag_data)
    if nfc_tag_id is None:
        return False

    # Check if this spool already has a nfc_tag_id binding
    for field in spool.extra:
        if field.key == "nfc_tag_id":
            if field.value == nfc_tag_id:
                return False  # Already bound to this tag
            # Spool is bound to a different tag — don't overwrite
            logger.debug("Spool %d already bound to %s, not rebinding to %s", spool.id, field.value, nfc_tag_id)
            return False

    # Create the binding
    db.add(SpoolField(spool_id=spool.id, key="nfc_tag_id", value=nfc_tag_id))
    await db.flush()
    logger.info("Bound spool %d to TigerTag %s", spool.id, nfc_tag_id)
    return True


async def find_spool_by_tigertag(
    db: AsyncSession,
    tag_data: TigerTagData,
    auto_bind: bool = True,
) -> Optional[Spool]:
    """Find a Spoolman spool matching decoded TigerTag data.

    Matching strategies (tried in order):
    1. Exact match by nfc_tag_id SpoolField == "tigertag_{id_product}_{timestamp}"
       (identifies a specific spool, works for both sides of paired tags)
    2. Fuzzy match by Filament.external_id == "tigertag_{id_product}"
       (returns most recent non-archived spool for that filament)
    3. Direct match by Spool.id == id_product (for tags written by Spoolman)

    When auto_bind is True and a spool is found via strategy 2 or 3 (not yet
    bound), the tag is automatically bound to that spool for future exact matches.

    Args:
        db: Database session.
        tag_data: Decoded TigerTag data.
        auto_bind: Automatically bind unbound tags to matched spools.

    Returns:
        Optional[Spool]: The matched spool, or None if no match found.

    """
    nfc_tag_id = _make_nfc_tag_id(tag_data)

    if tag_data.id_product > 0:
        # Strategy 1: Exact match by nfc_tag_id on spool
        if nfc_tag_id is not None:
            stmt = (
                select(Spool)
                .join(Spool.extra)
                .options(selectinload(Spool.filament).selectinload(Filament.vendor))
                .where(SpoolField.key == "nfc_tag_id")
                .where(SpoolField.value == nfc_tag_id)
                .limit(1)
            )
            result = await db.execute(stmt)
            spool = result.unique().scalar_one_or_none()
            if spool is not None:
                logger.debug("TigerTag exact match: spool %d via nfc_tag_id %s", spool.id, nfc_tag_id)
                return spool

        # Strategy 2: Match by external_id on filament
        external_id = f"tigertag_{tag_data.id_product}"
        stmt = (
            select(Spool)
            .join(Spool.filament)
            .options(
                selectinload(Spool.filament).selectinload(Filament.vendor),
                selectinload(Spool.extra),
            )
            .where(Filament.external_id == external_id)
            .where(Spool.archived.is_(False))
            .order_by(Spool.registered.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        spool = result.unique().scalar_one_or_none()
        if spool is not None:
            if auto_bind:
                await bind_spool_to_tigertag(db, spool, tag_data)
            return spool

        # Strategy 3: Match by spool ID directly (for tags written by Spoolman)
        stmt = (
            select(Spool)
            .options(
                selectinload(Spool.filament).selectinload(Filament.vendor),
                selectinload(Spool.extra),
            )
            .where(Spool.id == tag_data.id_product)
        )
        result = await db.execute(stmt)
        spool = result.unique().scalar_one_or_none()
        if spool is not None:
            if auto_bind:
                await bind_spool_to_tigertag(db, spool, tag_data)
            return spool

    return None


def map_spool_to_tigertag(
    spool: Spool,
    brand_map: Optional[dict[str, int]] = None,
    material_map: Optional[dict[str, int]] = None,
    diameter_map: Optional[float] = None,
) -> TigerTagData:
    """Map a Spoolman spool/filament to TigerTag binary data.

    Args:
        spool: The Spoolman spool to encode.
        brand_map: Optional mapping of brand name -> TigerTag brand ID.
        material_map: Optional mapping of material name -> TigerTag material type ID.
        diameter_map: Not used, diameter is determined from filament data.

    Returns:
        TigerTagData: The TigerTag data ready for encoding.

    """
    filament = spool.filament
    data = TigerTagData()

    # TigerTag Maker v1.0 magic number and type
    data.id_tigertag = 0x5BF59264  # TigerTag Maker V1
    data.id_type = 142  # Filament

    # Set product ID: use TigerTag product ID if available, otherwise use spool ID
    if filament.external_id and filament.external_id.startswith("tigertag_"):
        try:
            data.id_product = int(filament.external_id.split("_", 1)[1])
        except (ValueError, IndexError):
            data.id_product = spool.id
    else:
        data.id_product = spool.id

    # Brand ID lookup
    if brand_map and filament.vendor and filament.vendor.name:
        vendor_name = filament.vendor.name.lower()
        for name, brand_id in brand_map.items():
            if name.lower() == vendor_name:
                data.id_brand = brand_id
                break

    # Material ID lookup
    if material_map and filament.material:
        material_name = filament.material.lower()
        for name, material_id in material_map.items():
            if name.lower() == material_name:
                data.id_material = material_id
                break

    # Diameter
    if filament.diameter:
        if abs(filament.diameter - 1.75) < 0.1:
            data.id_diameter = 1
        elif abs(filament.diameter - 2.85) < 0.1:
            data.id_diameter = 2

    # Color
    if filament.color_hex:
        data.color_hex = filament.color_hex

    # Weight
    if filament.weight:
        data.weight = int(filament.weight)

    # Temperatures
    if filament.settings_extruder_temp:
        data.nozzle_temp = filament.settings_extruder_temp
    if filament.settings_bed_temp:
        data.bed_temp = filament.settings_bed_temp

    # Timestamp - TigerTag uses seconds since 2000-01-01 GMT
    data.timestamp = int(time.time()) - 946684800

    return data


def _load_tigertag_brand_map() -> dict[str, int]:
    """Load brand name -> ID mapping from cached TigerTag data."""
    try:
        from spoolman import filecache  # noqa: PLC0415

        data = filecache.get_file_contents("tigertag_filaments.json")
        filaments = json.loads(data)
        brand_map: dict[str, int] = {}
        for f in filaments:
            # Extract brand from the filament entries
            manufacturer = f.get("manufacturer", "")
            fid = f.get("id", "")
            if manufacturer and fid.startswith("tigertag_"):
                # We don't have direct brand IDs in the filament cache,
                # so this mapping is approximate
                pass
        return brand_map
    except Exception:
        return {}
