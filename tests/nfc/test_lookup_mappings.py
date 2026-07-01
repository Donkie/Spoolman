"""Unit tests for the pure NFC mapping / detection helpers.

Covers TESTING_CANDIDATES rows 13, 16, 20:
  * `_detect_tag_format` — format auto-detection dispatch.
  * `_make_nfc_tag_id` — composite (id_product, timestamp) key.
  * `map_spool_to_tigertag` / `map_spool_to_qidi` — spool → tag-data mapping.

Oracle: the documented mapping rules. Spools/filaments are built as lightweight
duck objects (the mappers only read attributes), so no DB is needed. The
TigerTag timestamp is pinned with time_machine.
"""

from types import SimpleNamespace

import time_machine

from spoolman.api.v1.nfc import _detect_tag_format
from spoolman.qidi_codec import color_code_from_hex, material_code_from_name
from spoolman.qidi_lookup import map_spool_to_qidi
from spoolman.tigertag_codec import TigerTagData
from spoolman.tigertag_lookup import _make_nfc_tag_id, map_spool_to_tigertag

# TigerTag epoch offset (seconds between 1970-01-01 and 2000-01-01).
TIGERTAG_EPOCH_OFFSET = 946684800


def _filament(**kwargs: object) -> SimpleNamespace:
    defaults = {
        "external_id": None,
        "vendor": None,
        "material": None,
        "diameter": None,
        "color_hex": None,
        "weight": None,
        "settings_extruder_temp": None,
        "settings_bed_temp": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _spool(spool_id: int = 1, **filament_kwargs: object) -> SimpleNamespace:
    return SimpleNamespace(id=spool_id, filament=_filament(**filament_kwargs))


# --- _detect_tag_format -----------------------------------------------------


def test_detect_uses_explicit_type_when_recognised():
    for explicit in ("tigertag", "tigertag+", "openprinttag", "qidi"):
        assert _detect_tag_format(b"\x00" * 16, explicit) == explicit


def test_detect_openprinttag_by_capability_container_byte():
    assert _detect_tag_format(b"\xe1\x40\x00\x01rest", None) == "openprinttag"


def test_detect_qidi_for_valid_16_byte_block():
    valid_qidi = bytes([4, 6, 1]) + bytes(13)  # material 4, color 6, mfr 1, padding zero
    assert _detect_tag_format(valid_qidi, None) == "qidi"


def test_detect_falls_back_to_tigertag_for_invalid_16_byte_block():
    invalid = bytes([99, 0, 9]) + bytes(13)  # out-of-range codes
    assert _detect_tag_format(invalid, None) == "tigertag"


def test_detect_defaults_to_tigertag():
    assert _detect_tag_format(b"anything else", None) == "tigertag"
    # An unrecognised explicit type is ignored and detection runs.
    assert _detect_tag_format(b"\xe1\x40", "bogus") == "openprinttag"


# --- _make_nfc_tag_id -------------------------------------------------------


def test_make_nfc_tag_id_composes_product_and_timestamp():
    tag = TigerTagData(id_product=28, timestamp=123456)
    assert _make_nfc_tag_id(tag) == "tigertag_28_123456"


def test_make_nfc_tag_id_requires_positive_product_and_timestamp():
    assert _make_nfc_tag_id(TigerTagData(id_product=0, timestamp=123)) is None
    assert _make_nfc_tag_id(TigerTagData(id_product=28, timestamp=0)) is None


# --- map_spool_to_tigertag --------------------------------------------------


def test_map_tigertag_sets_magic_and_type():
    data = map_spool_to_tigertag(_spool())
    assert data.id_tigertag == 0x5BF59264
    assert data.id_type == 142


def test_map_tigertag_product_id_from_external_id():
    data = map_spool_to_tigertag(_spool(spool_id=7, external_id="tigertag_28"))
    assert data.id_product == 28


def test_map_tigertag_product_id_falls_back_to_spool_id():
    assert map_spool_to_tigertag(_spool(spool_id=7, external_id="tigertag_abc")).id_product == 7
    assert map_spool_to_tigertag(_spool(spool_id=7, external_id=None)).id_product == 7


def test_map_tigertag_diameter_ids():
    assert map_spool_to_tigertag(_spool(diameter=1.75)).id_diameter == 1
    assert map_spool_to_tigertag(_spool(diameter=2.85)).id_diameter == 2
    assert map_spool_to_tigertag(_spool(diameter=3.0)).id_diameter == 0  # unmapped


def test_map_tigertag_color_and_weight():
    data = map_spool_to_tigertag(_spool(color_hex="ff8800", weight=999.6))
    assert (data.color_r, data.color_g, data.color_b) == (255, 136, 0)
    assert data.weight == 999  # int() truncation


def test_map_tigertag_brand_and_material_lookup_case_insensitive():
    spool = _spool(vendor=SimpleNamespace(name="Acme"), material="pla")
    data = map_spool_to_tigertag(spool, brand_map={"ACME": 5}, material_map={"PLA": 7})
    assert data.id_brand == 5
    assert data.id_material == 7


def test_map_tigertag_timestamp_uses_tigertag_epoch():
    # Freeze the clock so the timestamp is deterministic.
    with time_machine.travel(TIGERTAG_EPOCH_OFFSET + 1000, tick=False):
        data = map_spool_to_tigertag(_spool())
    assert data.timestamp == 1000


# --- map_spool_to_qidi ------------------------------------------------------


def test_map_qidi_defaults_when_no_material_or_color():
    data = map_spool_to_qidi(_spool())
    assert data.material_code == 0
    assert data.color_code == 0


def test_map_qidi_maps_color_hex_via_codec():
    hexval = "ff0000"
    data = map_spool_to_qidi(_spool(color_hex=hexval))
    assert data.color_code == color_code_from_hex(hexval)
    assert data.color_code != 0


def test_map_qidi_maps_material_name_via_codec():
    data = map_spool_to_qidi(_spool(material="PLA"))
    assert data.material_code == material_code_from_name("PLA")
    assert data.material_code != 0
