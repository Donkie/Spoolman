"""Unit tests for the 3DFP (3dfilamentprofiles.com) HTML parser (TESTING_CANDIDATES row 43).

Oracle: representative fixture HTML in the escaped-JSON shape the page actually
serves, with values chosen by hand so the expected extraction is independent of
the parser. Covers the brittle bits: the diameter/1000 conversion, temperature
averaging, display-name assembly, multi-color splitting, and the "no brand line
→ None" (404) path. Pure function, no network.
"""

from spoolman.api.v1.externaldb import parse_3dfp_html

# A single embedded line carrying the escaped-JSON profile fields, plus a
# separate data-color attribute elsewhere in the document.
BRAND_LINE = (
    r"...\"brand_name\":\"Prusament\",\"material\":\"PLA\",\"material_type\":\"Basic\","
    r"\"color\":\"Galaxy Black\",\"rgb\":\"#1a1a2e\",\"density\":1.24,\"diameter\":1750,"
    r"\"nominal_weight\":1000,\"spool_weight\":230,\"temp_max\":230,\"temp_min\":210,"
    r"\"bed_temp_max\":60,\"bed_temp_min\":50}"
)


def _page(brand_line: str = BRAND_LINE, data_color: str | None = None) -> str:
    lines = ["<html>", "<body>", brand_line]
    if data_color is not None:
        lines.append(f'<div data-color="{data_color}"></div>')
    lines.append("</html>")
    return "\n".join(lines)


def test_parses_all_scalar_fields():
    data = parse_3dfp_html(_page())
    assert data is not None
    assert data["manufacturer"] == "Prusament"
    assert data["material"] == "PLA"
    assert data["material_type"] == "Basic"
    assert data["color"] == "Galaxy Black"
    assert data["color_hex"] == "1a1a2e"
    assert data["density"] == 1.24
    assert data["weight"] == 1000.0
    assert data["spool_weight"] == 230.0


def test_diameter_is_converted_from_microns_to_mm():
    # The page reports 1750 (µm); the parser divides by 1000 → 1.75 mm.
    assert parse_3dfp_html(_page())["diameter"] == 1.75


def test_temperatures_are_averaged_and_floored():
    data = parse_3dfp_html(_page())
    assert data["extruder_temp"] == (230 + 210) // 2  # 220
    assert data["bed_temp"] == (60 + 50) // 2  # 55


def test_display_name_is_color_type_material():
    assert parse_3dfp_html(_page())["name"] == "Galaxy Black Basic PLA"


def test_missing_brand_line_returns_none():
    # Maps to a 404 in the endpoint. No brand line anywhere.
    assert parse_3dfp_html("<html><body>nothing useful here</body></html>") is None


def test_blank_brand_name_is_skipped():
    blank = r"...\"brand_name\":\"\",\"material\":\"PLA\"..."
    assert parse_3dfp_html(_page(brand_line=blank)) is None


def test_multi_color_splits_into_hex_list_with_coaxial_direction():
    data = parse_3dfp_html(_page(data_color="#ff0000, #00ff00, #0000ff"))
    assert data["color_hexes"] == ["ff0000", "00ff00", "0000ff"]
    assert data["multi_color_direction"] == "coaxial"


def test_single_data_color_overrides_color_hex_without_multi_direction():
    data = parse_3dfp_html(_page(data_color="#abcdef"))
    assert data["color_hex"] == "abcdef"
    assert "color_hexes" not in data
    assert "multi_color_direction" not in data


def test_partial_profile_only_extracts_present_fields():
    minimal = r"...\"brand_name\":\"Generic\",\"material\":\"PETG\"..."
    data = parse_3dfp_html(_page(brand_line=minimal))
    assert data["manufacturer"] == "Generic"
    assert data["material"] == "PETG"
    # Absent fields must simply be missing, not defaulted.
    assert "density" not in data
    assert "diameter" not in data
    assert "extruder_temp" not in data
