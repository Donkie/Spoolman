"""NFC tag reader/writer API endpoints."""

import base64
import json
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import filament as filament_db
from spoolman.database import spool as spool_db
from spoolman.database import vendor as vendor_db
from spoolman.database.database import get_db_session
from spoolman.database.models import Filament, Vendor
from spoolman.env import is_nfc_enabled

router = APIRouter(
    prefix="/nfc",
    tags=["nfc"],
)

# ruff: noqa: D103,B008

logger = logging.getLogger(__name__)


class NfcStatusResponse(BaseModel):
    """Response for NFC status endpoint."""

    enabled: bool = Field(description="Whether server-side NFC is enabled.")
    status: str = Field(description="Reader status: 'connected', 'disconnected', 'disabled', etc.")


class TigerTagDataResponse(BaseModel):
    """Decoded TigerTag data from an NFC tag."""

    id_tigertag: int = 0
    id_product: int = 0
    id_material: int = 0
    id_diameter: int = 0
    id_brand: int = 0
    color_hex: str = ""
    weight: int = 0
    nozzle_temp: int = 0
    bed_temp: int = 0
    drying_temp: int = 0
    drying_duration: int = 0
    timestamp: int = 0
    user_message: str = ""
    diameter_mm: float = 0.0


class QidiTagDataResponse(BaseModel):
    """Decoded Qidi tag data from a MIFARE Classic tag."""

    material_code: int = 0
    color_code: int = 0
    manufacturer_code: int = 1
    material_name: str = ""
    material_type: str = ""
    color_name: str = ""
    color_hex: str = ""


class NfcReadResponse(BaseModel):
    """Response for NFC read endpoint."""

    success: bool
    tag_format: Optional[str] = None
    tag_data: Optional[TigerTagDataResponse] = None
    qidi_data: Optional[QidiTagDataResponse] = None
    spool_id: Optional[int] = None
    nfc_tag_uid: Optional[str] = None
    raw_data_b64: Optional[str] = None
    message: str = ""


class NfcEncodeRequest(BaseModel):
    """Request body for NFC encode endpoint."""

    spool_id: int = Field(description="The spool ID to encode as TigerTag binary.")
    user_message: str = Field(default="", max_length=28, description="Optional user message (max 28 chars).")


class NfcEncodeResponse(BaseModel):
    """Response for NFC encode endpoint."""

    success: bool
    binary_b64: str = Field(default="", description="Base64-encoded 144-byte TigerTag binary.")
    message: str = ""


class NfcWriteRequest(BaseModel):
    """Request body for NFC write endpoint."""

    spool_id: int = Field(description="The spool ID to encode onto the NFC tag.")
    tag_format: str = Field(default="tigertag", description="Tag format to write: 'tigertag' or 'qidi'.")
    user_message: str = Field(default="", max_length=28, description="Optional user message (max 28 chars, TigerTag only).")


class NfcWriteResponse(BaseModel):
    """Response for NFC write endpoint."""

    success: bool
    nfc_tag_uid: Optional[str] = None
    message: str = ""


@router.get(
    "/status",
    name="Get NFC reader status",
    response_model=NfcStatusResponse,
)
async def nfc_status() -> NfcStatusResponse:
    """Get the status of the server-side NFC reader."""
    if not is_nfc_enabled():
        return NfcStatusResponse(enabled=False, status="disabled")

    try:
        from spoolman.nfc_service import nfc_service  # noqa: PLC0415

        return NfcStatusResponse(enabled=True, status=nfc_service.get_status())
    except Exception:
        logger.exception("Error getting NFC status")
        return NfcStatusResponse(enabled=True, status="error")


@router.post(
    "/read",
    name="Read NFC tag",
    response_model=NfcReadResponse,
)
async def nfc_read(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> NfcReadResponse:
    """Read an NFC tag via the server-side reader, auto-detecting tag type.

    Supports TigerTag (NTAG213), TigerTag+ (NTAG213), and Qidi (MIFARE Classic 1K).
    """
    if not is_nfc_enabled():
        return NfcReadResponse(success=False, message="NFC is not enabled on the server.")

    try:
        from spoolman.nfc_service import nfc_service  # noqa: PLC0415

        result = nfc_service.read_tag_auto(timeout=10.0)
        if result is None:
            return NfcReadResponse(success=False, message="No tag detected. Please place a tag on the reader.")

        uid_hex = result.uid.hex() if result.uid else None

        if result.tag_type == "mifare_classic":
            return await _handle_qidi_read(db, result.data, uid_hex)
        # Default: NTAG213 (TigerTag)
        return await _handle_tigertag_read(db, result.data, uid_hex)

    except Exception:
        logger.exception("Error reading NFC tag")
        return NfcReadResponse(success=False, message="Failed to read NFC tag.")


async def _handle_tigertag_read(
    db: AsyncSession, raw_data: bytes, uid_hex: str | None,
) -> NfcReadResponse:
    """Process a TigerTag NTAG213 read result."""
    from spoolman.tigertag_codec import TIGERTAG_PRO_V1, decode_ntag213  # noqa: PLC0415
    from spoolman.tigertag_lookup import find_spool_by_tigertag  # noqa: PLC0415

    tag_data = decode_ntag213(raw_data)

    tag_response = TigerTagDataResponse(
        id_tigertag=tag_data.id_tigertag,
        id_product=tag_data.id_product,
        id_material=tag_data.id_material,
        id_diameter=tag_data.id_diameter,
        id_brand=tag_data.id_brand,
        color_hex=tag_data.color_hex,
        weight=tag_data.weight,
        nozzle_temp=tag_data.nozzle_temp,
        bed_temp=tag_data.bed_temp,
        drying_temp=tag_data.drying_temp,
        drying_duration=tag_data.drying_duration,
        timestamp=tag_data.timestamp,
        user_message=tag_data.user_message,
        diameter_mm=tag_data.diameter_mm,
    )

    spool = await find_spool_by_tigertag(db, tag_data)
    spool_id = spool.id if spool else None
    detected_format = "tigertag+" if tag_data.id_tigertag == TIGERTAG_PRO_V1 else "tigertag"

    return NfcReadResponse(
        success=True,
        tag_format=detected_format,
        tag_data=tag_response,
        spool_id=spool_id,
        nfc_tag_uid=uid_hex,
        raw_data_b64=base64.b64encode(raw_data).decode("ascii"),
        message="Tag read successfully." if spool_id else "Tag read but no matching spool found.",
    )


async def _handle_qidi_read(
    db: AsyncSession, raw_data: bytes, uid_hex: str | None,
) -> NfcReadResponse:
    """Process a Qidi MIFARE Classic read result."""
    from spoolman.qidi_codec import decode_qidi_block, is_valid_qidi_block  # noqa: PLC0415
    from spoolman.qidi_lookup import find_spool_by_qidi_tag  # noqa: PLC0415

    if not raw_data:
        return NfcReadResponse(
            success=False,
            tag_format="qidi",
            nfc_tag_uid=uid_hex,
            message="Failed to read MIFARE Classic block. Authentication may have failed.",
        )

    tag_data = decode_qidi_block(raw_data)

    qidi_response = QidiTagDataResponse(
        material_code=tag_data.material_code,
        color_code=tag_data.color_code,
        manufacturer_code=tag_data.manufacturer_code,
        material_name=tag_data.material_name,
        material_type=tag_data.material_type,
        color_name=tag_data.color_name,
        color_hex=tag_data.color_hex,
    )

    spool = await find_spool_by_qidi_tag(db, tag_data, tag_uid_hex=uid_hex)
    spool_id = spool.id if spool else None

    return NfcReadResponse(
        success=True,
        tag_format="qidi",
        qidi_data=qidi_response,
        spool_id=spool_id,
        nfc_tag_uid=uid_hex,
        raw_data_b64=base64.b64encode(raw_data).decode("ascii") if raw_data else None,
        message="Qidi tag read successfully." if spool_id else "Qidi tag read but no matching spool found.",
    )


@router.post(
    "/write",
    name="Write NFC tag",
    response_model=NfcWriteResponse,
)
async def nfc_write(
    request: NfcWriteRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> NfcWriteResponse:
    """Encode spool data and write to an NFC tag.

    Supports writing as TigerTag (NTAG213) or Qidi (MIFARE Classic 1K).
    """
    if not is_nfc_enabled():
        return NfcWriteResponse(success=False, message="NFC is not enabled on the server.")

    try:
        from sqlalchemy import select  # noqa: PLC0415
        from sqlalchemy.orm import selectinload  # noqa: PLC0415

        from spoolman.database.models import Filament, Spool  # noqa: PLC0415
        from spoolman.nfc_service import nfc_service  # noqa: PLC0415

        # Fetch the spool
        stmt = (
            select(Spool)
            .options(selectinload(Spool.filament).selectinload(Filament.vendor))
            .where(Spool.id == request.spool_id)
        )
        result = await db.execute(stmt)
        spool = result.unique().scalar_one_or_none()

        if spool is None:
            return NfcWriteResponse(success=False, message=f"Spool with ID {request.spool_id} not found.")

        if request.tag_format == "qidi":
            return await _handle_qidi_write(nfc_service, spool)
        return await _handle_tigertag_write(nfc_service, spool, request.user_message)

    except Exception:
        logger.exception("Error writing NFC tag")
        return NfcWriteResponse(success=False, message="Failed to write NFC tag.")


async def _handle_tigertag_write(nfc_service, spool, user_message: str) -> NfcWriteResponse:
    """Write TigerTag format to NTAG213."""
    from spoolman.tigertag_codec import encode_ntag213  # noqa: PLC0415
    from spoolman.tigertag_lookup import map_spool_to_tigertag  # noqa: PLC0415

    tag_data = map_spool_to_tigertag(spool)
    tag_data.user_message = user_message
    raw_data = encode_ntag213(tag_data)

    success = nfc_service.write_tag(raw_data)
    if success:
        return NfcWriteResponse(success=True, message="TigerTag written successfully.")
    return NfcWriteResponse(success=False, message="Failed to write tag. Ensure NTAG213 tag is placed on reader.")


async def _handle_qidi_write(nfc_service, spool) -> NfcWriteResponse:
    """Write Qidi format to MIFARE Classic 1K."""
    from spoolman.qidi_codec import encode_qidi_block  # noqa: PLC0415
    from spoolman.qidi_lookup import map_spool_to_qidi  # noqa: PLC0415

    tag_data = map_spool_to_qidi(spool)
    raw_data = encode_qidi_block(tag_data)

    uid = nfc_service.write_mifare_classic_block(raw_data)
    if uid is not None:
        uid_hex = uid.hex()
        return NfcWriteResponse(success=True, nfc_tag_uid=uid_hex, message="Qidi tag written successfully.")
    return NfcWriteResponse(
        success=False,
        message="Failed to write Qidi tag. Ensure MIFARE Classic 1K tag is placed on reader.",
    )


@router.post(
    "/encode",
    name="Encode spool as TigerTag binary",
    response_model=NfcEncodeResponse,
)
async def nfc_encode(
    request: NfcEncodeRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> NfcEncodeResponse:
    """Encode spool data as TigerTag Maker binary. Returns base64-encoded 144-byte payload.

    This endpoint does not require NFC hardware — it just generates the binary data.
    """
    try:
        from sqlalchemy import select  # noqa: PLC0415
        from sqlalchemy.orm import selectinload  # noqa: PLC0415

        from spoolman.database.models import Filament, Spool  # noqa: PLC0415
        from spoolman.tigertag_codec import encode_ntag213  # noqa: PLC0415
        from spoolman.tigertag_lookup import map_spool_to_tigertag  # noqa: PLC0415

        # Fetch the spool
        stmt = (
            select(Spool)
            .options(selectinload(Spool.filament).selectinload(Filament.vendor))
            .where(Spool.id == request.spool_id)
        )
        result = await db.execute(stmt)
        spool = result.unique().scalar_one_or_none()

        if spool is None:
            return NfcEncodeResponse(success=False, message=f"Spool with ID {request.spool_id} not found.")

        # Map spool to TigerTag data
        tag_data = map_spool_to_tigertag(spool)
        tag_data.user_message = request.user_message

        # Encode to binary
        raw_data = encode_ntag213(tag_data)

        return NfcEncodeResponse(
            success=True,
            binary_b64=base64.b64encode(raw_data).decode("ascii"),
            message="Encoded successfully.",
        )

    except Exception:
        logger.exception("Error encoding TigerTag data")
        return NfcEncodeResponse(success=False, message="Failed to encode TigerTag data.")


class OpenPrintTagDataResponse(BaseModel):
    """Decoded OpenPrintTag data from an NFC-V tag."""

    instance_uuid: Optional[str] = None
    package_uuid: Optional[str] = None
    brand_uuid: Optional[str] = None
    material_uuid: Optional[str] = None
    brand_name: Optional[str] = None
    material_name: Optional[str] = None
    material_type: Optional[str] = None
    material_class: Optional[str] = None
    primary_color_hex: Optional[str] = None
    density: Optional[float] = None
    filament_diameter: Optional[float] = None
    nominal_netto_full_weight: Optional[float] = None
    actual_netto_full_weight: Optional[float] = None
    empty_container_weight: Optional[float] = None
    consumed_weight: Optional[float] = None
    min_print_temperature: Optional[int] = None
    max_print_temperature: Optional[int] = None
    min_bed_temperature: Optional[int] = None
    max_bed_temperature: Optional[int] = None
    drying_temperature: Optional[int] = None
    drying_time: Optional[int] = None


class NfcLookupRequest(BaseModel):
    """Request body for looking up a spool from external NFC data."""

    raw_data_b64: Optional[str] = Field(default=None, description="Base64-encoded raw tag memory.")
    id_product: Optional[int] = Field(default=None, description="TigerTag product/spool ID to look up directly.")
    tag_type: Optional[str] = Field(
        default=None,
        description="Tag type: 'tigertag', 'openprinttag', 'qidi', or null for auto-detect.",
    )
    nfc_tag_uid: Optional[str] = Field(default=None, description="Hex-encoded NFC tag UID (for binding/UUID derivation).")
    auto_create: bool = Field(default=False, description="Auto-create spool if no match found.")


class NfcLookupResponse(BaseModel):
    """Response for NFC lookup endpoint."""

    success: bool
    spool_id: Optional[int] = None
    tag_format: Optional[str] = None
    tag_data: Optional[TigerTagDataResponse] = None
    openprinttag_data: Optional[OpenPrintTagDataResponse] = None
    qidi_data: Optional[QidiTagDataResponse] = None
    message: str = ""


def _detect_tag_format(raw_data: bytes, tag_type: str | None) -> str:
    """Auto-detect tag format from raw bytes, or use explicit tag_type."""
    if tag_type in ("tigertag", "tigertag+", "openprinttag", "qidi"):
        return tag_type
    # NFC-V capability container starts with 0xE1
    if len(raw_data) >= 1 and raw_data[0] == 0xE1:
        return "openprinttag"
    # Check for Qidi format: exactly 16 bytes, bytes 3-15 zero, valid codes
    if len(raw_data) == 16:
        from spoolman.qidi_codec import is_valid_qidi_block  # noqa: PLC0415

        if is_valid_qidi_block(raw_data):
            return "qidi"
    return "tigertag"


async def _create_spool_from_tigertag(
    db: AsyncSession, tag_data, nfc_tag_uid: str | None = None,
) -> "Spool":
    """Create a filament and spool from decoded TigerTag data.

    Resolution order for filament data:
    1. Existing filament with matching external_id
    2. Real-time TigerTag API lookup (requires tag UID + product_id)
    3. TigerTag product cache (by internal API id)
    4. Brand/material name resolution from cached lookup tables
    5. Fallback to raw tag data with generic name
    """
    from spoolman.database.models import SpoolField  # noqa: PLC0415
    from spoolman.tigertag_lookup import _make_nfc_tag_id  # noqa: PLC0415

    external_id = f"tigertag_{tag_data.id_product}" if tag_data.id_product > 0 else None

    # Check for existing filament with this external_id
    existing_filament = None
    if external_id:
        existing_filament = await _find_filament_by_external_id(db, external_id)

    if existing_filament:
        filament_id = existing_filament.id
    else:
        ext_filament = None

        # Strategy 1: Real-time TigerTag API lookup (tag UID + product_id)
        if nfc_tag_uid and tag_data.id_product > 0:
            from spoolman.tigertagdb import lookup_product_by_tag  # noqa: PLC0415

            ext_filament = await lookup_product_by_tag(nfc_tag_uid, tag_data.id_product)

        # Strategy 2: Product cache (by internal API id)
        if ext_filament is None and tag_data.id_product > 0:
            ext_filament = _lookup_tigertag_product(tag_data.id_product)

        if ext_filament:
            vendor_id = await _find_or_create_vendor(db, ext_filament.manufacturer)
            db_filament = await filament_db.create(
                db=db,
                density=ext_filament.density,
                diameter=ext_filament.diameter,
                name=ext_filament.name,
                vendor_id=vendor_id,
                material=ext_filament.material,
                weight=ext_filament.weight,
                color_hex=ext_filament.color_hex,
                settings_extruder_temp=ext_filament.extruder_temp,
                settings_bed_temp=ext_filament.bed_temp,
                external_id=external_id,
            )
            filament_id = db_filament.id
        else:
            # Strategy 3: Resolve brand/material names from TigerTag API caches
            from spoolman.tigertagdb import lookup_brand_name, lookup_material_density, lookup_material_name  # noqa: PLC0415

            brand_name = lookup_brand_name(tag_data.id_brand) if tag_data.id_brand > 0 else None
            material_name = lookup_material_name(tag_data.id_material) if tag_data.id_material > 0 else None
            density = lookup_material_density(tag_data.id_material) if tag_data.id_material > 0 else None
            diameter = tag_data.diameter_mm if tag_data.diameter_mm > 0 else 1.75

            parts = []
            if brand_name:
                parts.append(brand_name)
            if material_name:
                parts.append(material_name)
            if not parts:
                parts.append(f"TigerTag {external_id or 'Unknown'}")
            filament_name = " ".join(parts)

            vendor_id = None
            if brand_name:
                vendor_id = await _find_or_create_vendor(db, brand_name)

            db_filament = await filament_db.create(
                db=db,
                density=density or 1.24,
                diameter=diameter,
                name=filament_name,
                vendor_id=vendor_id,
                material=material_name,
                weight=float(tag_data.weight) if tag_data.weight > 0 else None,
                color_hex=tag_data.color_hex if tag_data.color_hex and tag_data.color_hex != "000000" else None,
                settings_extruder_temp=tag_data.nozzle_temp if tag_data.nozzle_temp > 0 else None,
                settings_bed_temp=tag_data.bed_temp if tag_data.bed_temp > 0 else None,
                external_id=external_id,
            )
            filament_id = db_filament.id

    # Create spool
    db_spool = await spool_db.create(db=db, filament_id=filament_id)

    # Bind the TigerTag to the spool
    nfc_tag_id = _make_nfc_tag_id(tag_data)
    if nfc_tag_id:
        db.add(SpoolField(spool_id=db_spool.id, key="nfc_tag_id", value=nfc_tag_id))
        await db.flush()
        logger.info("Bound new spool %d to TigerTag %s", db_spool.id, nfc_tag_id)

    return db_spool


@router.post(
    "/lookup",
    name="Look up spool from NFC tag data",
    response_model=NfcLookupResponse,
)
async def nfc_lookup(
    request: NfcLookupRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> NfcLookupResponse:
    """Look up a spool from externally-read NFC tag data.

    Auto-detects tag format (TigerTag, OpenPrintTag, or Qidi) from raw bytes,
    or accepts an explicit tag_type. Designed for Klipper/Moonraker
    integrations where the NFC reader is attached to the printer.
    """
    if not request.raw_data_b64 and request.id_product is None:
        return NfcLookupResponse(
            success=False,
            message="Provide either raw_data_b64 or id_product.",
        )

    # Direct id_product lookup (TigerTag shortcut)
    if request.id_product is not None and not request.raw_data_b64:
        return await _lookup_tigertag_by_id(db, request.id_product)

    try:
        raw_data = base64.b64decode(request.raw_data_b64)
    except Exception:
        return NfcLookupResponse(success=False, message="Invalid base64 in raw_data_b64.")

    tag_format = _detect_tag_format(raw_data, request.tag_type)

    if tag_format == "openprinttag":
        return await _lookup_openprinttag(db, raw_data, request.nfc_tag_uid, request.auto_create)
    if tag_format == "qidi":
        return await _lookup_qidi(db, raw_data, request.nfc_tag_uid, request.auto_create)
    return await _lookup_tigertag(db, raw_data, request.nfc_tag_uid, request.auto_create)


async def _lookup_tigertag(
    db: AsyncSession, raw_data: bytes, nfc_tag_uid: str | None = None, auto_create: bool = False,
) -> NfcLookupResponse:
    """Handle TigerTag lookup from raw binary data."""
    try:
        from spoolman.tigertag_codec import TIGERTAG_PRO_V1, decode_ntag213  # noqa: PLC0415
        from spoolman.tigertag_lookup import find_spool_by_tigertag  # noqa: PLC0415

        tag_data = decode_ntag213(raw_data)
        spool = await find_spool_by_tigertag(db, tag_data)

        if spool is None and auto_create:
            spool = await _create_spool_from_tigertag(db, tag_data, nfc_tag_uid=nfc_tag_uid)
            msg = f"Spool auto-created with ID {spool.id}."
        elif spool is not None:
            msg = "Spool found."
        else:
            msg = "No matching spool found."

        spool_id = spool.id if spool else None

        # Distinguish TigerTag Maker vs TigerTag+ in the response
        detected_format = "tigertag+" if tag_data.id_tigertag == TIGERTAG_PRO_V1 else "tigertag"

        tag_response = TigerTagDataResponse(
            id_tigertag=tag_data.id_tigertag,
            id_product=tag_data.id_product,
            id_material=tag_data.id_material,
            id_diameter=tag_data.id_diameter,
            id_brand=tag_data.id_brand,
            color_hex=tag_data.color_hex,
            weight=tag_data.weight,
            nozzle_temp=tag_data.nozzle_temp,
            bed_temp=tag_data.bed_temp,
            drying_temp=tag_data.drying_temp,
            drying_duration=tag_data.drying_duration,
            timestamp=tag_data.timestamp,
            user_message=tag_data.user_message,
            diameter_mm=tag_data.diameter_mm,
        )

        return NfcLookupResponse(
            success=True,
            spool_id=spool_id,
            tag_format=detected_format,
            tag_data=tag_response,
            message=msg,
        )
    except Exception:
        logger.exception("Error in TigerTag lookup")
        return NfcLookupResponse(success=False, tag_format="tigertag", message="Failed to decode TigerTag data.")


async def _lookup_tigertag_by_id(db: AsyncSession, id_product: int) -> NfcLookupResponse:
    """Handle TigerTag lookup by direct id_product."""
    try:
        from spoolman.tigertag_codec import TigerTagData  # noqa: PLC0415
        from spoolman.tigertag_lookup import find_spool_by_tigertag  # noqa: PLC0415

        tag_data = TigerTagData(id_product=id_product)
        spool = await find_spool_by_tigertag(db, tag_data)
        spool_id = spool.id if spool else None

        return NfcLookupResponse(
            success=True,
            spool_id=spool_id,
            tag_format="tigertag",
            message="Spool found." if spool_id else "No matching spool found.",
        )
    except Exception:
        logger.exception("Error in TigerTag ID lookup")
        return NfcLookupResponse(success=False, tag_format="tigertag", message="Failed to look up TigerTag ID.")


async def _lookup_openprinttag(
    db: AsyncSession, raw_data: bytes, nfc_tag_uid_hex: str | None, auto_create: bool,
) -> NfcLookupResponse:
    """Handle OpenPrintTag lookup from raw NFC-V memory."""
    try:
        from spoolman.openprinttag_codec import decode_nfcv_memory  # noqa: PLC0415
        from spoolman.openprinttag_lookup import create_spool_from_openprinttag, find_spool_by_openprinttag  # noqa: PLC0415

        nfc_uid = bytes.fromhex(nfc_tag_uid_hex) if nfc_tag_uid_hex else None
        tag_data = decode_nfcv_memory(raw_data, nfc_tag_uid=nfc_uid)

        spool = await find_spool_by_openprinttag(db, tag_data)

        if spool is None and auto_create:
            spool = await create_spool_from_openprinttag(db, tag_data)
            msg = f"Spool auto-created with ID {spool.id}."
        elif spool is not None:
            msg = "Spool found."
        else:
            msg = "No matching spool found."

        spool_id = spool.id if spool else None

        opt_response = OpenPrintTagDataResponse(
            instance_uuid=tag_data.effective_instance_uuid,
            package_uuid=tag_data.package_uuid,
            brand_uuid=tag_data.effective_brand_uuid,
            material_uuid=tag_data.material_uuid,
            brand_name=tag_data.brand_name,
            material_name=tag_data.material_name,
            material_type=tag_data.material_type,
            material_class=tag_data.material_class,
            primary_color_hex=tag_data.primary_color_hex,
            density=tag_data.density,
            filament_diameter=tag_data.filament_diameter,
            nominal_netto_full_weight=tag_data.nominal_netto_full_weight,
            actual_netto_full_weight=tag_data.actual_netto_full_weight,
            empty_container_weight=tag_data.empty_container_weight,
            consumed_weight=tag_data.consumed_weight,
            min_print_temperature=tag_data.min_print_temperature,
            max_print_temperature=tag_data.max_print_temperature,
            min_bed_temperature=tag_data.min_bed_temperature,
            max_bed_temperature=tag_data.max_bed_temperature,
            drying_temperature=tag_data.drying_temperature,
            drying_time=tag_data.drying_time,
        )

        return NfcLookupResponse(
            success=True,
            spool_id=spool_id,
            tag_format="openprinttag",
            openprinttag_data=opt_response,
            message=msg,
        )
    except Exception:
        logger.exception("Error in OpenPrintTag lookup")
        return NfcLookupResponse(success=False, tag_format="openprinttag", message="Failed to decode OpenPrintTag data.")


async def _lookup_qidi(
    db: AsyncSession, raw_data: bytes, nfc_tag_uid_hex: str | None, auto_create: bool,
) -> NfcLookupResponse:
    """Handle Qidi tag lookup from raw MIFARE Classic block data."""
    try:
        from spoolman.qidi_codec import decode_qidi_block  # noqa: PLC0415
        from spoolman.qidi_lookup import create_spool_from_qidi_tag, find_spool_by_qidi_tag  # noqa: PLC0415

        tag_data = decode_qidi_block(raw_data)
        spool = await find_spool_by_qidi_tag(db, tag_data, tag_uid_hex=nfc_tag_uid_hex)

        if spool is None and auto_create:
            spool = await create_spool_from_qidi_tag(db, tag_data, tag_uid_hex=nfc_tag_uid_hex)
            msg = f"Spool auto-created with ID {spool.id}."
        elif spool is not None:
            msg = "Spool found."
        else:
            msg = "No matching spool found."

        spool_id = spool.id if spool else None

        qidi_response = QidiTagDataResponse(
            material_code=tag_data.material_code,
            color_code=tag_data.color_code,
            manufacturer_code=tag_data.manufacturer_code,
            material_name=tag_data.material_name,
            material_type=tag_data.material_type,
            color_name=tag_data.color_name,
            color_hex=tag_data.color_hex,
        )

        return NfcLookupResponse(
            success=True,
            spool_id=spool_id,
            tag_format="qidi",
            qidi_data=qidi_response,
            message=msg,
        )
    except Exception:
        logger.exception("Error in Qidi tag lookup")
        return NfcLookupResponse(success=False, tag_format="qidi", message="Failed to decode Qidi tag data.")


class NfcBindRequest(BaseModel):
    """Request body for binding an NFC tag to an existing spool."""

    spool_id: int = Field(description="The spool ID to bind the tag to.")
    raw_data_b64: Optional[str] = Field(default=None, description="Base64-encoded raw tag memory.")
    tag_type: Optional[str] = Field(default=None, description="Tag type: 'tigertag', 'qidi', or null for auto-detect.")
    id_product: int = Field(default=0, description="TigerTag product ID (used with timestamp for manual binding).")
    timestamp: int = Field(default=0, description="TigerTag timestamp (seconds since 2000-01-01).")
    nfc_tag_uid: Optional[str] = Field(default=None, description="Hex-encoded NFC tag UID.")


class NfcBindResponse(BaseModel):
    """Response for NFC bind endpoint."""

    success: bool
    nfc_tag_id: Optional[str] = None
    tag_data: Optional[TigerTagDataResponse] = None
    qidi_data: Optional[QidiTagDataResponse] = None
    message: str = ""


@router.post(
    "/bind",
    name="Bind NFC tag to existing spool",
    response_model=NfcBindResponse,
)
async def nfc_bind(
    request: NfcBindRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> NfcBindResponse:
    """Bind a scanned NFC tag to an existing spool.

    For TigerTag: accepts raw binary or explicit id_product + timestamp.
    For Qidi: requires nfc_tag_uid (MIFARE Classic hardware UID).
    """
    try:
        from sqlalchemy.orm import selectinload  # noqa: PLC0415

        from spoolman.database.models import Spool, SpoolField  # noqa: PLC0415

        # Fetch the spool with extra fields loaded
        stmt = (
            select(Spool)
            .options(
                selectinload(Spool.filament).selectinload(Filament.vendor),
                selectinload(Spool.extra),
            )
            .where(Spool.id == request.spool_id)
        )
        result = await db.execute(stmt)
        spool = result.unique().scalar_one_or_none()
        if spool is None:
            return NfcBindResponse(success=False, message=f"Spool with ID {request.spool_id} not found.")

        # Determine tag type
        tag_type = request.tag_type
        if tag_type == "qidi" or (tag_type is None and request.nfc_tag_uid and not request.raw_data_b64 and request.id_product == 0):
            # Qidi binding by UID
            return await _bind_qidi(db, spool, request)

        # TigerTag binding
        return await _bind_tigertag(db, spool, request)

    except Exception:
        logger.exception("Error binding NFC tag to spool")
        return NfcBindResponse(success=False, message="Failed to bind NFC tag to spool.")


async def _bind_tigertag(db: AsyncSession, spool, request: NfcBindRequest) -> NfcBindResponse:
    """Handle TigerTag binding."""
    from spoolman.database.models import SpoolField  # noqa: PLC0415
    from spoolman.tigertag_codec import TigerTagData, decode_ntag213  # noqa: PLC0415
    from spoolman.tigertag_lookup import _make_nfc_tag_id, bind_spool_to_tigertag  # noqa: PLC0415

    tag_response = None
    if request.raw_data_b64:
        try:
            raw_data = base64.b64decode(request.raw_data_b64)
        except Exception:
            return NfcBindResponse(success=False, message="Invalid base64 in raw_data_b64.")
        tag_data = decode_ntag213(raw_data)
        tag_response = TigerTagDataResponse(
            id_tigertag=tag_data.id_tigertag,
            id_product=tag_data.id_product,
            id_material=tag_data.id_material,
            id_diameter=tag_data.id_diameter,
            id_brand=tag_data.id_brand,
            color_hex=tag_data.color_hex,
            weight=tag_data.weight,
            nozzle_temp=tag_data.nozzle_temp,
            bed_temp=tag_data.bed_temp,
            drying_temp=tag_data.drying_temp,
            drying_duration=tag_data.drying_duration,
            timestamp=tag_data.timestamp,
            user_message=tag_data.user_message,
            diameter_mm=tag_data.diameter_mm,
        )
    elif request.id_product > 0 and request.timestamp > 0:
        tag_data = TigerTagData(id_product=request.id_product, timestamp=request.timestamp)
    else:
        return NfcBindResponse(
            success=False,
            message="Provide either raw_data_b64 or both id_product and timestamp.",
        )

    nfc_tag_id = _make_nfc_tag_id(tag_data)
    if nfc_tag_id is None:
        return NfcBindResponse(
            success=False,
            message="Tag does not have a usable product ID and timestamp for binding.",
        )

    # Check if another spool is already bound to this tag
    existing_stmt = (
        select(SpoolField)
        .where(SpoolField.key == "nfc_tag_id")
        .where(SpoolField.value == nfc_tag_id)
    )
    existing_result = await db.execute(existing_stmt)
    existing_binding = existing_result.scalar_one_or_none()
    if existing_binding and existing_binding.spool_id != request.spool_id:
        return NfcBindResponse(
            success=False,
            message=f"This tag is already bound to spool {existing_binding.spool_id}.",
        )

    bound = await bind_spool_to_tigertag(db, spool, tag_data)
    if bound:
        return NfcBindResponse(
            success=True,
            nfc_tag_id=nfc_tag_id,
            tag_data=tag_response,
            message=f"Tag bound to spool {request.spool_id}.",
        )
    return NfcBindResponse(
        success=True,
        nfc_tag_id=nfc_tag_id,
        tag_data=tag_response,
        message=f"Spool {request.spool_id} is already bound to this tag.",
    )


async def _bind_qidi(db: AsyncSession, spool, request: NfcBindRequest) -> NfcBindResponse:
    """Handle Qidi tag binding by UID."""
    from spoolman.database.models import SpoolField  # noqa: PLC0415
    from spoolman.qidi_lookup import _make_nfc_tag_id, bind_spool_to_qidi_tag  # noqa: PLC0415

    if not request.nfc_tag_uid:
        return NfcBindResponse(
            success=False,
            message="Qidi tag binding requires nfc_tag_uid (MIFARE Classic hardware UID).",
        )

    nfc_tag_id = _make_nfc_tag_id(request.nfc_tag_uid)

    # Check if another spool is already bound to this tag
    existing_stmt = (
        select(SpoolField)
        .where(SpoolField.key == "nfc_tag_id")
        .where(SpoolField.value == nfc_tag_id)
    )
    existing_result = await db.execute(existing_stmt)
    existing_binding = existing_result.scalar_one_or_none()
    if existing_binding and existing_binding.spool_id != request.spool_id:
        return NfcBindResponse(
            success=False,
            message=f"This tag is already bound to spool {existing_binding.spool_id}.",
        )

    # Build Qidi response if raw data is provided
    qidi_response = None
    if request.raw_data_b64:
        try:
            from spoolman.qidi_codec import decode_qidi_block  # noqa: PLC0415

            raw_data = base64.b64decode(request.raw_data_b64)
            tag_data = decode_qidi_block(raw_data)
            qidi_response = QidiTagDataResponse(
                material_code=tag_data.material_code,
                color_code=tag_data.color_code,
                manufacturer_code=tag_data.manufacturer_code,
                material_name=tag_data.material_name,
                material_type=tag_data.material_type,
                color_name=tag_data.color_name,
                color_hex=tag_data.color_hex,
            )
        except Exception:
            pass  # Non-fatal: we can still bind without decoded data

    bound = await bind_spool_to_qidi_tag(db, spool, request.nfc_tag_uid)
    if bound:
        return NfcBindResponse(
            success=True,
            nfc_tag_id=nfc_tag_id,
            qidi_data=qidi_response,
            message=f"Qidi tag bound to spool {request.spool_id}.",
        )
    return NfcBindResponse(
        success=True,
        nfc_tag_id=nfc_tag_id,
        qidi_data=qidi_response,
        message=f"Spool {request.spool_id} is already bound to this tag.",
    )


class NfcCreateFromTagRequest(BaseModel):
    """Request body for creating a spool from decoded tag data."""

    tag_type: str = Field(default="tigertag", description="Tag type: 'tigertag' or 'qidi'.")
    # TigerTag fields
    id_product: int = Field(default=0, description="TigerTag product ID.")
    id_material: int = Field(default=0, description="TigerTag material type ID.")
    id_diameter: int = Field(default=0, description="TigerTag diameter ID (56=1.75mm, 221=2.85mm).")
    id_brand: int = Field(default=0, description="TigerTag brand ID.")
    color_hex: str = Field(default="", description="Color hex string (without #).")
    weight: int = Field(default=0, description="Filament weight in grams.")
    nozzle_temp: int = Field(default=0, description="Nozzle temperature in C.")
    nozzle_temp_max: int = Field(default=0, description="Max nozzle temperature in C.")
    bed_temp: int = Field(default=0, description="Bed temperature in C.")
    bed_temp_max: int = Field(default=0, description="Max bed temperature in C.")
    drying_temp: int = Field(default=0, description="Drying temperature in C.")
    drying_duration: int = Field(default=0, description="Drying duration in hours.")
    diameter_mm: float = Field(default=0.0, description="Diameter in mm (decoded from id_diameter).")
    timestamp: int = Field(default=0, description="TigerTag timestamp (seconds since 2000-01-01).")
    # Qidi fields
    material_code: int = Field(default=0, description="Qidi material code (1-50).")
    color_code: int = Field(default=0, description="Qidi color code (1-24).")
    # Common
    nfc_tag_uid: Optional[str] = Field(default=None, description="Hex-encoded NFC tag UID.")


class NfcCreateFromTagResponse(BaseModel):
    """Response for creating a spool from tag data."""

    success: bool
    spool_id: Optional[int] = None
    message: str = ""


async def _find_or_create_vendor(db, name: str) -> int:
    """Find a vendor by name or create one."""
    vendors, _ = await vendor_db.find(db=db, name=name)
    if vendors:
        return vendors[0].id
    new_vendor = await vendor_db.create(db=db, name=name)
    return new_vendor.id


async def _find_filament_by_external_id(db, external_id: str) -> Optional[Filament]:
    """Find an existing filament by external_id."""
    stmt = select(Filament).where(Filament.external_id == external_id)
    result = await db.execute(stmt)
    return result.unique().scalar_one_or_none()


def _lookup_tigertag_product(id_product: int):
    """Look up a product in the TigerTag external DB cache. Returns ExternalFilament or None."""
    try:
        from spoolman import filecache  # noqa: PLC0415

        data = filecache.get_file_contents("tigertag_filaments.json")
        filaments = json.loads(data)
        target_id = f"tigertag_{id_product}"
        for f in filaments:
            if f.get("id") == target_id:
                from spoolman.externaldb import ExternalFilament  # noqa: PLC0415

                return ExternalFilament(**f)
    except Exception:
        logger.debug("Could not look up TigerTag product %d in cache", id_product)
    return None


@router.post(
    "/create-from-tag",
    name="Create spool from tag data",
    response_model=NfcCreateFromTagResponse,
)
async def nfc_create_from_tag(
    request: NfcCreateFromTagRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> NfcCreateFromTagResponse:
    """Create a filament and spool from decoded NFC tag data.

    Supports both TigerTag and Qidi tag formats.
    """
    try:
        if request.tag_type == "qidi":
            return await _create_from_qidi_tag(db, request)
        return await _create_from_tigertag_tag(db, request)

    except Exception:
        logger.exception("Error creating spool from tag data")
        return NfcCreateFromTagResponse(success=False, message="Failed to create spool from tag data.")


async def _create_from_tigertag_tag(
    db: AsyncSession, request: NfcCreateFromTagRequest,
) -> NfcCreateFromTagResponse:
    """Create spool from TigerTag data."""
    from spoolman.tigertag_codec import TigerTagData  # noqa: PLC0415

    tag_data = TigerTagData(
        id_product=request.id_product,
        id_material=request.id_material,
        id_diameter=request.id_diameter,
        id_brand=request.id_brand,
        weight=request.weight,
        nozzle_temp=request.nozzle_temp,
        nozzle_temp_max=request.nozzle_temp_max,
        bed_temp=request.bed_temp,
        bed_temp_max=request.bed_temp_max,
        drying_temp=request.drying_temp,
        drying_duration=request.drying_duration,
        timestamp=request.timestamp,
    )
    if request.color_hex:
        tag_data.color_hex = request.color_hex

    db_spool = await _create_spool_from_tigertag(db, tag_data, nfc_tag_uid=request.nfc_tag_uid)

    return NfcCreateFromTagResponse(
        success=True,
        spool_id=db_spool.id,
        message="Spool created successfully.",
    )


async def _create_from_qidi_tag(
    db: AsyncSession, request: NfcCreateFromTagRequest,
) -> NfcCreateFromTagResponse:
    """Create spool from Qidi tag data."""
    from spoolman.qidi_codec import QidiTagData  # noqa: PLC0415
    from spoolman.qidi_lookup import create_spool_from_qidi_tag  # noqa: PLC0415

    tag_data = QidiTagData(
        material_code=request.material_code,
        color_code=request.color_code,
    )

    db_spool = await create_spool_from_qidi_tag(db, tag_data, tag_uid_hex=request.nfc_tag_uid)

    return NfcCreateFromTagResponse(
        success=True,
        spool_id=db_spool.id,
        message="Spool created from Qidi tag successfully.",
    )
