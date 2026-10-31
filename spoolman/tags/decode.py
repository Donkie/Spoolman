"""Decode a scanned tag's raw payload into fields the rest of Spoolman understands.

`POST /tag/scan` (spoolman/api/v1/tag.py) accepts a `format` and a raw `payload_b64` but,
on its own, never looks inside them -- that split is deliberate (see spoolman/tags/__init__.py):
the scan-relay layer only ever needs a UID. Format-specific decoding lives in one module per
format (openprinttag.py here, more later), and `decode()` is the one place that knows which
module answers for which format string.

Decoding is best-effort and pure: no database, no FastAPI. An unrecognized format or a payload
that fails to parse returns None rather than raising -- a scan's core contract (resolve a UID)
must never fail because enrichment of it didn't work.
"""

import io
import logging
import math
from dataclasses import dataclass

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
    except Exception:  # noqa: BLE001 -- best effort by contract, see the module docstring
        logger.warning("Could not decode %s payload", fmt, exc_info=True)
    return None


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
