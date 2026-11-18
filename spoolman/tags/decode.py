"""Decode a scanned tag's raw payload into fields the rest of Spoolman understands.

`POST /tag/scan` (spoolman/api/v1/tag.py) accepts a `format` and a raw `payload_b64` but,
on its own, never looks inside them -- that split is deliberate (see spoolman/tags/__init__.py):
the scan-relay layer only ever needs a UID. Format-specific decoding lives in one module per
format (openprinttag.py here, more later), and `decode()` is the one place that knows which
module answers for which format string.

Decoding is best-effort and pure: no database, no FastAPI. An unrecognized format or a payload
that fails to parse returns None rather than raising -- a scan's core contract (resolve a UID)
must never fail because enrichment of it didn't work.

One exception to "pure": TigerTag's on-tag `id_material`/`id_brand` are catalog IDs, not
names, and resolving them needs the optional external-DB add-on (spoolman/tigertagdb.py, off
by default -- see env.is_tigertag_enabled). `decode()` stays fully pure and reads only the
add-on's background-synced cache when it's enabled; `decode_async()` additionally awaits a
live per-tag API call first, for an exact catalog match, before falling back to that same
cache. Either way the add-on module itself is only ever imported when enabled, so a
deployment that never opts in never loads it.
"""

import io
import logging
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from spoolman.tags.tigertag import TigerTagData

from spoolman.tags import normalize_format

logger = logging.getLogger(__name__)


class CborRejectedError(ValueError):
    """A payload was refused before cbor2 ever saw it, or cbor2 itself refused it."""


# CBOR major types (top 3 bits of a head byte) and the additional-info values (bottom 5 bits)
# that need special handling. See RFC 8949 section 3.
_MAJOR_UNSIGNED_INT = 0
_MAJOR_NEGATIVE_INT = 1
_MAJOR_BYTE_STRING = 2
_MAJOR_TEXT_STRING = 3
_MAJOR_ARRAY = 4
_MAJOR_MAP = 5
_MAJOR_TAG = 6
_MAJOR_FLOAT_SIMPLE = 7
_INDEFINITE_LENGTH = 31
_BREAK_BYTE = 0xFF
_ARGUMENT_SIZE_BY_INFO = {24: 1, 25: 2, 26: 4, 27: 8}

# Backstop against the scanner's own recursion, not a real limit: a legitimate tag never gets
# close, and every level of recursion consumes at least one byte of a payload that is at most a
# few hundred bytes long, so this is reached only by a hand-crafted adversarial payload.
_MAX_SCAN_DEPTH = 64


def decode_one_cbor_item(raw: bytes, *, max_depth: int) -> tuple[object, int]:
    """Decode exactly one top-level CBOR item, refusing semantic tags before cbor2 sees them.

    Every per-format codec in this package (openprinttag.py, and whatever comes after it) must
    call this instead of cbor2 directly, so each one inherits the same guard rather than
    reimplementing it.

    cbor2 -- including its C extension -- resolves semantic tags (major type 6) internally, and
    some of them (e.g. 260, ipaddress) validate their argument and raise on a bad one. Building
    that exception's message calls repr() on the decoded value. repr() has no notion of CBOR's
    own value-sharing (tags 28/29): a tag can wrap a graph that shares the same sub-object many
    times over, which is cheap to hold (the real Python objects are shared, not copied), but
    repr() prints it out in full every time, so its output size is exponential in the sharing
    depth. That string gets built inside cbor2's own error path -- before .decode() returns and
    before any validation of ours runs -- so a few hundred bytes on the wire can force a
    multi-gigabyte allocation with no decoded value and no exception for us to intervene on.
    Real OpenPrintTag payloads carry no semantic tags at all, so refusing every one of them,
    not just 28/29/260, costs nothing on the happy path and closes the whole class at once.

    This walks CBOR item heads by hand instead, with no cbor2 call and no value built, so it
    cannot be tricked into the same trap it exists to prevent. It has to match exactly the one
    top-level item cbor2.decode() would otherwise parse, including indefinite-length containers,
    or a tag hiding past where this stops looking would still reach cbor2 unblocked.

    Args:
        raw: Bytes to decode. Only the first CBOR item is consumed; trailing bytes are ignored,
            same as cbor2.CBORDecoder.decode().
        max_depth: Passed straight through to cbor2, once this has cleared the payload of tags.

    Returns:
        (value, bytes_consumed).

    Raises:
        CborRejectedError: The payload contains a semantic tag, is malformed, or cbor2 itself refused
            it. Always this one type, regardless of cause.

    """
    import cbor2  # noqa: PLC0415 -- deferred: see the module import note on cbor2 in openprinttag.py

    # Hand cbor2 only the bytes the walk covered: whatever follows the first item (the main and aux
    # sections, in a tag's payload) is never in front of cbor2 at all, not merely left unread.
    end = _reject_semantic_tags(raw, 0, 0)
    buf = io.BytesIO(raw[:end])
    try:
        value = cbor2.CBORDecoder(buf, max_depth=max_depth).decode()
    except cbor2.CBORDecodeError as exc:
        raise CborRejectedError(str(exc)) from exc
    return value, buf.tell()


def _reject_semantic_tags(buf: bytes, pos: int, depth: int) -> int:
    """Walk one CBOR item's head(s), raising CborRejectedError on a semantic tag. Return the end position."""
    if depth > _MAX_SCAN_DEPTH:
        raise CborRejectedError("CBOR nested too deep")
    if pos >= len(buf):
        raise CborRejectedError("Truncated CBOR")
    head = buf[pos]
    major = head >> 5
    info = head & 0x1F
    pos += 1

    if major == _MAJOR_TAG:
        raise CborRejectedError("CBOR semantic tags are not supported")

    if major == _MAJOR_FLOAT_SIMPLE:
        return _skip_simple_argument(buf, pos, info)

    if info == _INDEFINITE_LENGTH:
        if major not in (_MAJOR_BYTE_STRING, _MAJOR_TEXT_STRING, _MAJOR_ARRAY, _MAJOR_MAP):
            raise CborRejectedError("Invalid indefinite length for major type")
        return _reject_in_indefinite_container(buf, pos, major, depth)

    length, pos = _read_argument(buf, pos, info)
    return _skip_definite_item(buf, pos, major, length, depth)


def _skip_definite_item(buf: bytes, pos: int, major: int, length: int, depth: int) -> int:
    """Skip a definite-length item's content, given its already-read major type and length/value."""
    if major in (_MAJOR_UNSIGNED_INT, _MAJOR_NEGATIVE_INT):
        return pos
    if major in (_MAJOR_BYTE_STRING, _MAJOR_TEXT_STRING):
        end = pos + length
        if end > len(buf):
            raise CborRejectedError("Truncated CBOR string")
        return end
    if major == _MAJOR_ARRAY:
        for _ in range(length):
            pos = _reject_semantic_tags(buf, pos, depth + 1)
        return pos
    # major == _MAJOR_MAP: a key and a value per entry, each one more level deep.
    for _ in range(length * 2):
        pos = _reject_semantic_tags(buf, pos, depth + 1)
    return pos


def _read_argument(buf: bytes, pos: int, info: int) -> tuple[int, int]:
    """Read the length/value argument that follows a non-simple CBOR head byte."""
    if info < 24:  # noqa: PLR2004 -- the literal-value cutoff, not a tunable
        return info, pos
    size = _ARGUMENT_SIZE_BY_INFO.get(info)
    if size is None:
        raise CborRejectedError("Reserved CBOR additional info")
    if pos + size > len(buf):
        raise CborRejectedError("Truncated CBOR")
    return int.from_bytes(buf[pos : pos + size], "big"), pos + size


def _skip_simple_argument(buf: bytes, pos: int, info: int) -> int:
    """Major type 7 (float/simple): the argument is never a length, just bytes to skip.

    A break byte (0xFF) never gets here when it is legitimate: _reject_in_indefinite_container
    consumes it before recursing. One that does arrive is stray, and the walk must not treat it as
    an item: it would end the walk early, past a tag that cbor2 could still go on to read.
    """
    if info == _INDEFINITE_LENGTH:
        raise CborRejectedError("Unexpected CBOR break")
    if info < 24:  # noqa: PLR2004 -- the literal-value cutoff, not a tunable
        return pos
    size = _ARGUMENT_SIZE_BY_INFO.get(info)
    if size is None:
        raise CborRejectedError("Reserved CBOR additional info")
    if pos + size > len(buf):
        raise CborRejectedError("Truncated CBOR")
    return pos + size


def _reject_in_indefinite_container(buf: bytes, pos: int, major: int, depth: int) -> int:
    """Walk an indefinite-length container's items until the break byte (0xFF)."""
    while True:
        if pos >= len(buf):
            raise CborRejectedError("Truncated CBOR")
        if buf[pos] == _BREAK_BYTE:
            return pos + 1
        if major == _MAJOR_MAP:
            pos = _reject_semantic_tags(buf, pos, depth + 1)  # key
            pos = _reject_semantic_tags(buf, pos, depth + 1)  # value
        elif major == _MAJOR_ARRAY:
            pos = _reject_semantic_tags(buf, pos, depth + 1)
        else:
            # Byte/text string: each chunk must be a definite-length string of the same major type
            # (RFC 8949 3.2.3). Walking anything else at the same depth would let nested
            # indefinite strings recurse past _MAX_SCAN_DEPTH into a RecursionError.
            chunk_head = buf[pos]
            if chunk_head >> 5 != major or chunk_head & 0x1F == _INDEFINITE_LENGTH:
                raise CborRejectedError("Invalid chunk in indefinite-length string")
            pos = _reject_semantic_tags(buf, pos, depth + 1)


@dataclass
class DecodedTag:
    """Tag contents named after the fields of the rest of the API.

    Deliberately flatter than any one codec's own dataclass: every format's decode funnels into
    this shape, so the wiring in tag.py and database/tag.py never has to know which codec
    produced it.
    """

    material_class: str | None = None  # "FFF" or "SLA"; only FFF tags can create a filament
    material: str | None = None  # e.g. "PLA"
    name: str | None = None  # e.g. "PLA Galaxy Black"
    vendor_name: str | None = None  # e.g. "Prusament"
    article_number: str | None = None  # vendor GTIN, as text
    color_hex: str | None = None
    diameter: float | None = None
    density: float | None = None
    weight: float | None = None  # nominal full net weight of the filament, in grams
    initial_weight: float | None = None  # measured net weight on this roll, in grams
    spool_weight: float | None = None  # tare weight of the empty spool, in grams
    used_weight: float | None = None  # already used, per the tag -- shown, never applied automatically
    extruder_temp: int | None = None  # print temperature, °C
    bed_temp: int | None = None  # bed temperature, °C
    instance_uuid: str | None = None  # identifies this roll, not the product


# Approximate densities (g/cm^3) for common materials, used only as a fallback when a
# decoded tag doesn't carry its own density and the caller needs one anyway (creating a
# Filament requires a density -- see spoolman.database.filament.create). These are rough
# industry-typical values, not per-manufacturer figures; a wrong guess here is still better
# than refusing to auto-create a spool over a field most tags never bothered to include.
APPROXIMATE_DENSITY_BY_MATERIAL: dict[str, float] = {
    "PLA": 1.24,
    "PETG": 1.27,
    "ABS": 1.04,
    "ASA": 1.07,
    "TPU": 1.21,
    "PA6": 1.14,
    "PA11": 1.03,
    "PA12": 1.01,
    "PA66": 1.15,
    "PC": 1.20,
    "PCTG": 1.23,
    "HIPS": 1.04,
    "PVA": 1.23,
}

# Used when even the material type is unknown. PLA is the most common filament by far, so
# it is the least-wrong default rather than a principled one.
_FALLBACK_DENSITY = 1.24


def approximate_density(material: str | None) -> float | None:
    """Look up a rough density for a material, or None if it is not in the table."""
    if material is None:
        return None
    return APPROXIMATE_DENSITY_BY_MATERIAL.get(material.upper())


def density_or_fallback(material: str | None) -> float:
    """Approximate density for a material, or the PLA-equivalent fallback."""
    return approximate_density(material) or _FALLBACK_DENSITY


def _finite(value: float | None) -> float | None:
    """Drop NaN and infinity: CBOR can carry them, but JSON cannot, and neither is storable."""
    if value is None or math.isfinite(value):
        return value
    return None


def decode(tag_format: str | None, payload: bytes, uid_bytes: bytes | None = None) -> DecodedTag | None:
    """Decode a tag's raw payload for a known format.

    Args:
        tag_format: The format string as reported by the scanning agent, e.g. "openprinttag".
            Matched case-insensitively via the same normalization the storage layer uses.
        payload: The tag's raw contents.
        uid_bytes: The tag's UID as raw bytes, if available. Some formats (OpenPrintTag) derive
            the instance identifier from it when the tag itself doesn't carry one.

    Returns:
        DecodedTag | None: The decoded fields, or None if the format is unknown or the payload
        could not be decoded. Never raises: whatever a hostile or damaged payload does to a
        codec, the scan carries on as if the payload were not decodable.

    """
    fmt = normalize_format(tag_format)
    try:
        if fmt == "openprinttag":
            return _decode_openprinttag(payload, uid_bytes)
        if fmt == "tigertag":
            return _decode_tigertag(payload)
    except Exception:  # noqa: BLE001 -- best effort by contract, see the module docstring
        logger.warning("Could not decode %s payload", fmt, exc_info=True)
    return None


async def decode_async(
    tag_format: str | None,
    payload: bytes,
    uid_bytes: bytes | None = None,
    uid: str | None = None,
) -> DecodedTag | None:
    """Decode a tag's raw payload, resolving TigerTag names via a live API call if enabled.

    Identical to `decode()` for every format, and for TigerTag with the add-on off -- the
    only difference is TigerTag with it on, where this awaits
    `tigertagdb.lookup_product_by_tag(uid, id_product)` for an exact catalog match before
    falling back to the same background-synced cache `decode()` uses on its own. Prefer this
    from request-handling code, which is already async and can afford the await; `decode()`
    stays synchronous for pure/offline callers like the test suite.

    Args:
        tag_format: See `decode()`.
        payload: See `decode()`.
        uid_bytes: See `decode()`.
        uid: The tag's UID as the same normalized hex string `/tag/scan` resolves it to (see
            spoolman.tags.normalize_uid). TigerTag's live lookup needs it as a string, not
            bytes -- it's the key the tag was registered against on TigerTag's own API.

    Returns:
        DecodedTag | None: See `decode()`.

    """
    fmt = normalize_format(tag_format)
    try:
        if fmt == "tigertag":
            return await _decode_tigertag_async(payload, uid)
    except Exception:  # noqa: BLE001 -- best effort by contract, see the module docstring
        logger.warning("Could not decode %s payload", fmt, exc_info=True)
        return None
    return decode(tag_format, payload, uid_bytes)


def _decode_openprinttag(payload: bytes, uid_bytes: bytes | None) -> DecodedTag | None:
    # Imported here, not at module level: cbor2 is only needed when a payload actually arrives,
    # so a missing or broken cbor2 must not stop the server from starting.
    from spoolman.tags import openprinttag as openprinttag_codec  # noqa: PLC0415

    try:
        data = openprinttag_codec.decode_nfcv_memory(payload, nfc_tag_uid=uid_bytes)
    except ValueError:
        logger.debug("Could not decode payload as OpenPrintTag", exc_info=True)
        return None

    # Print and bed temperatures come as a range. Use the upper end: it is the value a
    # profile is normally set to, and it is still inside the range the vendor specifies.
    extruder_temp = data.max_print_temperature or data.min_print_temperature
    bed_temp = data.max_bed_temperature or data.min_bed_temperature

    return DecodedTag(
        material_class=data.material_class,
        material=data.material_type,
        name=data.material_name,
        vendor_name=data.brand_name,
        article_number=str(data.gtin) if data.gtin is not None else None,
        color_hex=data.primary_color_hex,
        diameter=_finite(data.effective_diameter),
        density=_finite(data.density),
        weight=_finite(data.nominal_netto_full_weight),
        initial_weight=_finite(data.actual_netto_full_weight),
        spool_weight=_finite(data.empty_container_weight),
        used_weight=_finite(data.consumed_weight),
        extruder_temp=extruder_temp,
        bed_temp=bed_temp,
        instance_uuid=data.effective_instance_uuid,
    )


def _decode_tigertag_raw(payload: bytes) -> "TigerTagData | None":
    # Imported here for the same reason as openprinttag above: the dependency should only be
    # paid for when a tigertag payload actually arrives.
    from spoolman.tags import tigertag as tigertag_codec  # noqa: PLC0415

    try:
        data = tigertag_codec.decode_ntag213(payload)
    except ValueError:
        logger.debug("Could not decode payload as TigerTag", exc_info=True)
        return None

    if not tigertag_codec.is_tigertag(data.id_tigertag):
        # Wrong magic number -- either not a TigerTag at all, or a blank/Init tag with
        # nothing written to it yet. Either way there's nothing usable to surface.
        return None

    return data


def _tigertag_decoded(
    raw: "TigerTagData",
    *,
    material: str | None = None,
    name: str | None = None,
    vendor_name: str | None = None,
    density: float | None = None,
) -> DecodedTag:
    # color_hex/diameter/weight always come straight off the physical tag, never from the
    # external-DB add-on -- the tag is ground truth for this specific roll's physical
    # properties; the add-on only ever fills in what the tag can't carry: names for
    # id_material/id_brand's catalog IDs, and a material-specific density.
    # id_product is a catalog SKU, not a per-roll identifier, so it's never used as
    # instance_uuid -- same instance-uniqueness caution as OpenPrintTag's UID-derived id.
    # TigerTag (NTAG213 "Maker"/"+") only ever tags filament spools, so material_class is
    # always "FFF" -- unlike OpenPrintTag, there is no resin variant of this format.
    return DecodedTag(
        material_class="FFF",
        material=material,
        name=name,
        vendor_name=vendor_name,
        color_hex=raw.color_hex,
        diameter=raw.diameter_mm or None,
        density=density,
        # weight_grams is None both when the tag has no weight and when it reports one in a
        # unit other than grams (e.g. kilograms) -- either way, not a usable weight in grams.
        weight=float(raw.weight_grams) if raw.weight_grams else None,
    )


def _tigertag_decoded_from_cache(raw: "TigerTagData") -> DecodedTag:
    """Resolve names for a raw TigerTag decode from the add-on's background-synced cache.

    Only called once the caller has already confirmed the add-on is enabled -- this is where
    spoolman/tigertagdb.py actually gets imported, kept out of every other code path so a
    deployment that never opts in never loads it.
    """
    from spoolman import tigertagdb  # noqa: PLC0415 -- see docstring

    return _tigertag_decoded(
        raw,
        material=tigertagdb.lookup_material_name(raw.id_material),
        name=tigertagdb.lookup_material_name(raw.id_material),
        vendor_name=tigertagdb.lookup_brand_name(raw.id_brand),
        density=tigertagdb.lookup_material_density(raw.id_material),
    )


def _decode_tigertag(payload: bytes) -> DecodedTag | None:
    from spoolman import env  # noqa: PLC0415

    raw = _decode_tigertag_raw(payload)
    if raw is None:
        return None
    if not env.is_tigertag_enabled():
        return _tigertag_decoded(raw)
    return _tigertag_decoded_from_cache(raw)


async def _decode_tigertag_async(payload: bytes, uid: str | None) -> DecodedTag | None:
    from spoolman import env  # noqa: PLC0415

    raw = _decode_tigertag_raw(payload)
    if raw is None:
        return None
    if not env.is_tigertag_enabled():
        return _tigertag_decoded(raw)

    from spoolman import tigertagdb  # noqa: PLC0415 -- see _tigertag_decoded_from_cache

    if raw.id_product and uid is not None:
        try:
            ext = await tigertagdb.lookup_product_by_tag(uid, raw.id_product)
        except Exception:  # noqa: BLE001 -- enrichment must never fail the scan it's decoding
            logger.debug("TigerTag live product lookup failed for uid=%s", uid, exc_info=True)
            ext = None
        if ext is not None:
            return _tigertag_decoded(
                raw,
                material=ext.material if ext.material != "Unknown" else None,
                name=ext.name,
                vendor_name=ext.manufacturer if ext.manufacturer != "Unknown" else None,
                # ext.density is a fixed 1.24 placeholder for every TigerTag product (see
                # tigertagdb._to_external_filament) -- the materials cache's own per-material
                # figure is the real one, so prefer it here too.
                density=tigertagdb.lookup_material_density(raw.id_material),
            )

    # No product id on the tag, or the live lookup was unavailable/failed/found nothing --
    # fall back to the coarser but still real background-synced cache.
    return _tigertag_decoded_from_cache(raw)
