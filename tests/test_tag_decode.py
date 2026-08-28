"""Tests for the format-dispatching decode wiring in spoolman/tags/decode.py.

Builds the same synthetic OpenPrintTag NFC-V memory dump as test_openprinttag_codec.py, but
only enough of it to exercise dispatch and field mapping -- the codec's own parsing edge
cases are that module's job, not this one's.
"""

import uuid

import cbor2
import httpx
import pytest

from spoolman import env, tigertagdb
from spoolman.externaldb import ExternalFilament
from spoolman.tags import decode as tag_decode
from spoolman.tags import openprinttag as openprinttag_codec
from spoolman.tags.decode import (
    DecodedTag,
    approximate_density,
    decode,
    decode_async,
    density_or_fallback,
)
from spoolman.tags.openprinttag import (
    META_AUX_REGION_OFFSET,
    MF_BRAND_NAME,
    MF_FILAMENT_DIAMETER,
    MF_MATERIAL_TYPE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PRIMARY_COLOR,
    uuid5_bytes,
)
from spoolman.tags.tigertag import TIGERTAG_INIT, TIGERTAG_MAKER_V1, TigerTagData
from tests.test_tigertag_codec import encode_ntag213


def _cbor_payload(main: dict, aux: dict | None = None) -> bytes:
    if aux is None:
        return cbor2.dumps({}) + cbor2.dumps(main)

    meta: dict = {}
    aux_offset = 0
    for _ in range(4):
        meta[META_AUX_REGION_OFFSET] = aux_offset
        meta_bytes = cbor2.dumps(meta)
        main_bytes = cbor2.dumps(main)
        new_offset = len(meta_bytes) + len(main_bytes)
        if new_offset == aux_offset:
            break
        aux_offset = new_offset
    return meta_bytes + main_bytes + cbor2.dumps(aux)


def _ndef_short_record(mime: str, payload: bytes) -> bytes:
    mime_bytes = mime.encode("ascii")
    header = 0b11010010  # MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x02
    return bytes([header, len(mime_bytes), len(payload)]) + mime_bytes + payload


def _nfcv_memory(ndef_message: bytes) -> bytes:
    cc = bytes([0xE1, 0x40, 0x00, 0x01])
    tlv = bytes([0x03, len(ndef_message)]) + ndef_message + bytes([0xFE])
    return cc + tlv


def _build_openprinttag(main: dict, aux: dict | None = None) -> bytes:
    payload = _cbor_payload(main, aux)
    ndef = _ndef_short_record("application/vnd.openprinttag", payload)
    return _nfcv_memory(ndef)


# --- decode() dispatch -----------------------------------------------------------


def test_decode_dispatches_openprinttag() -> None:
    raw = _build_openprinttag(
        {
            MF_MATERIAL_TYPE: 0,  # PLA
            MF_BRAND_NAME: "Prusament",
            MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.0,
            MF_PRIMARY_COLOR: bytes([0x11, 0x22, 0x33, 0xFF]),
        },
    )
    result = decode("openprinttag", raw)

    assert result == DecodedTag(
        material="PLA",
        name=None,
        vendor_name="Prusament",
        color_hex="112233",
        diameter=1.75,  # spec default, not set on this tag
        density=None,
        weight=1000.0,
        spool_weight=None,
        used_weight=None,
        instance_uuid=None,
    )


def test_decode_dispatch_is_case_insensitive() -> None:
    raw = _build_openprinttag({MF_MATERIAL_TYPE: 0})
    assert decode("OpenPrintTag", raw) is not None
    assert decode(" OpenPrintTag ", raw) is not None


def test_decode_unknown_format_returns_none() -> None:
    assert decode("bambu", b"\x00" * 16) is None


def test_decode_none_format_returns_none() -> None:
    assert decode(None, b"\x00" * 16) is None


def test_decode_unparseable_payload_returns_none_instead_of_raising() -> None:
    """A recognized format with garbage bytes is a soft failure, not an exception."""
    assert decode("openprinttag", b"not a tag") is None


def test_decode_derives_external_id_from_uid_when_tag_has_no_instance_uuid() -> None:
    raw = _build_openprinttag({MF_MATERIAL_TYPE: 0})
    uid_bytes = bytes.fromhex("04A2B3C4D5E6F7")

    without_uid = decode("openprinttag", raw)
    with_uid = decode("openprinttag", raw, uid_bytes=uid_bytes)

    assert without_uid is not None
    assert without_uid.instance_uuid is None
    assert with_uid is not None
    assert with_uid.instance_uuid == str(uuid5_bytes(uuid.UUID("31062f81-b5bd-4f86-a5f8-46367e841508"), uid_bytes))


def test_decode_dispatches_tigertag() -> None:
    raw = encode_ntag213(
        TigerTagData(
            id_tigertag=TIGERTAG_MAKER_V1,
            id_diameter=56,  # 0x38, the spec's real 1.75mm id
            weight=1000,
            color_r=0x11,
            color_g=0x22,
            color_b=0x33,
        ),
    )
    result = decode("tigertag", raw)

    assert result == DecodedTag(
        material_class="FFF",
        material=None,
        name=None,
        vendor_name=None,
        color_hex="112233",
        diameter=1.75,
        density=None,
        weight=1000.0,
        spool_weight=None,
        used_weight=None,
        instance_uuid=None,
    )


def test_decode_tigertag_rejects_blank_init_tag() -> None:
    """TIGERTAG_INIT marks an uninitialized tag -- nothing usable to surface."""
    raw = encode_ntag213(TigerTagData(id_tigertag=TIGERTAG_INIT))
    assert decode("tigertag", raw) is None


def test_decode_tigertag_rejects_junk_magic() -> None:
    raw = encode_ntag213(TigerTagData(id_tigertag=0xDEADBEEF))
    assert decode("tigertag", raw) is None


def test_decode_tigertag_unparseable_payload_returns_none() -> None:
    assert decode("tigertag", b"too short") is None


def test_decode_tigertag_unknown_diameter_is_none_not_zero() -> None:
    raw = encode_ntag213(TigerTagData(id_tigertag=TIGERTAG_MAKER_V1, id_diameter=99))
    result = decode("tigertag", raw)
    assert result is not None
    assert result.diameter is None


def test_decode_tigertag_zero_weight_is_none() -> None:
    raw = encode_ntag213(TigerTagData(id_tigertag=TIGERTAG_MAKER_V1, weight=0))
    result = decode("tigertag", raw)
    assert result is not None
    assert result.weight is None


def test_decode_tigertag_non_gram_unit_is_none_not_a_scaled_value() -> None:
    """A tag reporting its weight in kilograms must not be read as that many grams."""
    raw = encode_ntag213(TigerTagData(id_tigertag=TIGERTAG_MAKER_V1, weight=1000, id_unit=35))  # 35 = kilograms
    result = decode("tigertag", raw)
    assert result is not None
    assert result.weight is None


def _tigertag_raw(**kwargs: object) -> bytes:
    kwargs.setdefault("id_tigertag", TIGERTAG_MAKER_V1)
    kwargs.setdefault("color_r", 0x11)
    kwargs.setdefault("color_g", 0x22)
    kwargs.setdefault("color_b", 0x33)
    return encode_ntag213(TigerTagData(**kwargs))  # type: ignore[arg-type]


# --- decode() / decode_async() with the external-DB add-on enabled -----------------
#
# tag_decode never imports spoolman.tigertagdb unless env.is_tigertag_enabled() says so
# (see _decode_tigertag_raw et al.'s docstrings) -- these tests monkeypatch that flag plus
# tigertagdb's lookup functions directly, rather than exercising the real cache/API, since
# tigertagdb's own behavior is covered by tests/test_tigertagdb.py.


def test_decode_tigertag_addon_disabled_leaves_names_unresolved(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: False)
    monkeypatch.setattr(tigertagdb, "lookup_material_name", lambda _id: pytest.fail("should not be called"))

    result = decode("tigertag", _tigertag_raw(id_material=38219))
    assert result is not None
    assert result.material is None
    assert result.vendor_name is None


def test_decode_tigertag_addon_enabled_resolves_names_from_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)
    monkeypatch.setattr(
        tigertagdb,
        "lookup_material_name",
        lambda id_material: "PLA" if id_material == 38219 else None,
    )
    monkeypatch.setattr(tigertagdb, "lookup_brand_name", lambda id_brand: "Rosa3D" if id_brand == 19961 else None)
    monkeypatch.setattr(
        tigertagdb,
        "lookup_material_density",
        lambda id_material: 1.24 if id_material == 38219 else None,
    )

    result = decode("tigertag", _tigertag_raw(id_material=38219, id_brand=19961))
    assert result is not None
    assert result.material == "PLA"
    assert result.name == "PLA"
    assert result.vendor_name == "Rosa3D"
    assert result.density == 1.24
    # Physical properties still come straight off the tag, never the catalog.
    assert result.color_hex == "112233"


@pytest.mark.asyncio
async def test_decode_async_addon_disabled_matches_sync_decode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: False)
    raw = _tigertag_raw(id_material=38219)

    assert await decode_async("tigertag", raw, uid="04A2B3C4") == decode("tigertag", raw)


@pytest.mark.asyncio
async def test_decode_async_prefers_live_product_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)
    monkeypatch.setattr(tigertagdb, "lookup_material_density", lambda _id: 1.24)

    async def _fake_lookup(uid: str, id_product: int) -> ExternalFilament:
        assert uid == "04A2B3C4"
        assert id_product == 28
        return ExternalFilament(
            id="tigertag_28",
            manufacturer="Rosa3D",
            name="Rosa3D PLA Starter",
            material="PLA",
            density=1.24,
            weight=1000,
            diameter=1.75,
            source="tigertag",
        )

    monkeypatch.setattr(tigertagdb, "lookup_product_by_tag", _fake_lookup)
    monkeypatch.setattr(
        tigertagdb,
        "lookup_brand_name",
        lambda _id: pytest.fail("cached fallback should not run when the live lookup succeeds"),
    )

    result = await decode_async("tigertag", _tigertag_raw(id_product=28), uid="04A2B3C4")
    assert result is not None
    assert result.material == "PLA"
    assert result.name == "Rosa3D PLA Starter"
    assert result.vendor_name == "Rosa3D"
    assert result.density == 1.24
    # Physical properties still come straight off the tag, never the live API response.
    assert result.color_hex == "112233"


@pytest.mark.asyncio
async def test_decode_async_falls_back_to_cache_when_live_lookup_finds_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)

    async def _fake_lookup(_uid: str, _id_product: int) -> None:
        return None

    monkeypatch.setattr(tigertagdb, "lookup_product_by_tag", _fake_lookup)
    monkeypatch.setattr(tigertagdb, "lookup_material_name", lambda _id: "PLA")
    monkeypatch.setattr(tigertagdb, "lookup_brand_name", lambda _id: "Rosa3D")
    monkeypatch.setattr(tigertagdb, "lookup_material_density", lambda _id: 1.24)

    result = await decode_async("tigertag", _tigertag_raw(id_product=28), uid="04A2B3C4")
    assert result is not None
    assert result.material == "PLA"
    assert result.vendor_name == "Rosa3D"


@pytest.mark.asyncio
async def test_decode_async_falls_back_to_cache_when_live_lookup_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)

    async def _fake_lookup(_uid: str, _id_product: int) -> None:
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(tigertagdb, "lookup_product_by_tag", _fake_lookup)
    monkeypatch.setattr(tigertagdb, "lookup_material_name", lambda _id: "PLA")
    monkeypatch.setattr(tigertagdb, "lookup_brand_name", lambda _id: None)
    monkeypatch.setattr(tigertagdb, "lookup_material_density", lambda _id: 1.24)

    result = await decode_async("tigertag", _tigertag_raw(id_product=28), uid="04A2B3C4")
    assert result is not None
    assert result.material == "PLA"


@pytest.mark.asyncio
async def test_decode_async_skips_live_lookup_without_a_product_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)
    monkeypatch.setattr(
        tigertagdb,
        "lookup_product_by_tag",
        lambda *_a, **_k: pytest.fail("should not be called without a product id"),
    )
    monkeypatch.setattr(tigertagdb, "lookup_material_name", lambda _id: "PLA")
    monkeypatch.setattr(tigertagdb, "lookup_brand_name", lambda _id: None)
    monkeypatch.setattr(tigertagdb, "lookup_material_density", lambda _id: None)

    result = await decode_async("tigertag", _tigertag_raw(id_product=0), uid="04A2B3C4")
    assert result is not None
    assert result.material == "PLA"


@pytest.mark.asyncio
async def test_decode_async_skips_live_lookup_without_a_uid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)
    monkeypatch.setattr(
        tigertagdb,
        "lookup_product_by_tag",
        lambda *_a, **_k: pytest.fail("should not be called without a uid"),
    )
    monkeypatch.setattr(tigertagdb, "lookup_material_name", lambda _id: "PLA")
    monkeypatch.setattr(tigertagdb, "lookup_brand_name", lambda _id: None)
    monkeypatch.setattr(tigertagdb, "lookup_material_density", lambda _id: None)

    result = await decode_async("tigertag", _tigertag_raw(id_product=28), uid=None)
    assert result is not None
    assert result.material == "PLA"


@pytest.mark.asyncio
async def test_decode_async_non_tigertag_format_is_unaffected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(env, "is_tigertag_enabled", lambda: True)
    raw = _build_openprinttag({MF_MATERIAL_TYPE: 0})

    assert await decode_async("openprinttag", raw) == decode("openprinttag", raw)


# --- density fallback --------------------------------------------------------------


def test_approximate_density_known_material() -> None:
    assert approximate_density("PLA") == 1.24


def test_approximate_density_is_case_insensitive() -> None:
    assert approximate_density("pla") == approximate_density("PLA")


def test_approximate_density_unknown_material_is_none() -> None:
    assert approximate_density("UNOBTANIUM") is None


def test_approximate_density_none_material_is_none() -> None:
    assert approximate_density(None) is None


def test_density_or_fallback_uses_table_when_known() -> None:
    assert density_or_fallback("ABS") == approximate_density("ABS")


def test_density_or_fallback_uses_pla_equivalent_when_unknown() -> None:
    assert density_or_fallback("UNOBTANIUM") == approximate_density("PLA")


def test_density_or_fallback_uses_pla_equivalent_when_none() -> None:
    assert density_or_fallback(None) == approximate_density("PLA")


def test_any_codec_failure_is_a_soft_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    """Best effort is a contract: a codec that raises something other than ValueError must not reach the scan."""

    def boom(*_args: object, **_kwargs: object) -> None:
        raise TypeError("a list where a number goes")

    monkeypatch.setattr(openprinttag_codec, "decode_nfcv_memory", boom)
    assert tag_decode.decode("openprinttag", b"\x00", uid_bytes=b"\x04\xa2") is None


@pytest.mark.asyncio
async def test_odd_length_uid_still_decodes_without_an_instance_uid(monkeypatch: pytest.MonkeyPatch) -> None:
    """A UID that fromhex rejects must not turn the decode into a 500. normalize_uid stops odd lengths earlier."""
    import base64  # noqa: PLC0415

    from spoolman.api.v1 import tag as tag_api  # noqa: PLC0415
    from spoolman.tags import decode as tag_decode  # noqa: PLC0415

    seen = {}

    async def fake_decode_async(
        _tag_format: str,
        _raw: bytes,
        uid_bytes: bytes | None = None,
        uid: str | None = None,
    ) -> None:
        seen["uid_bytes"] = uid_bytes
        seen["uid"] = uid

    monkeypatch.setattr(tag_decode, "decode_async", fake_decode_async)
    payload_b64 = base64.b64encode(b"\x00").decode()
    assert await tag_api._decode_payload("openprinttag", payload_b64, "ABC") is None  # noqa: SLF001
    assert seen["uid_bytes"] is None


def test_zero_diameter_reaches_decoded_tag_as_zero() -> None:
    """The codec must not turn a stated 0 into the 1.75 default before the database refuses it."""
    raw = _build_openprinttag({MF_FILAMENT_DIAMETER: 0})
    assert decode("openprinttag", raw).diameter == 0.0
