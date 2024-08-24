"""Integration tests for the Filament API endpoint."""

from datetime import datetime, timezone
from typing import Any

import httpx

from ..conftest import URL, assert_dicts_compatible


def test_add_filament(random_vendor: dict[str, Any]):
    """Test adding a filament to the database."""
    # Execute
    name = "Filament X"
    material = "PLA"
    price = 100
    density = 1.25
    diameter = 1.75
    weight = 1000
    spool_weight = 250
    article_number = "123456789"
    comment = "abcdefghåäö"
    settings_extruder_temp = 200
    settings_bed_temp = 60
    color_hex = "FF0000"
    external_id = "polymaker_pla_polysonicblack_1000_175"
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": name,
            "vendor_id": random_vendor["id"],
            "material": material,
            "price": price,
            "density": density,
            "diameter": diameter,
            "weight": weight,
            "spool_weight": spool_weight,
            "article_number": article_number,
            "comment": comment,
            "settings_extruder_temp": settings_extruder_temp,
            "settings_bed_temp": settings_bed_temp,
            "color_hex": color_hex,
            "external_id": external_id,
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert_dicts_compatible(
        filament,
        {
            "id": filament["id"],
            "registered": filament["registered"],
            "name": name,
            "vendor": random_vendor,
            "material": material,
            "price": price,
            "density": density,
            "diameter": diameter,
            "weight": weight,
            "spool_weight": spool_weight,
            "article_number": article_number,
            "comment": comment,
            "settings_extruder_temp": settings_extruder_temp,
            "settings_bed_temp": settings_bed_temp,
            "color_hex": color_hex,
            "external_id": external_id,
        },
    )

    # Verify that registered happened almost now (within 1 minute)
    diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(filament["registered"])).total_seconds())
    assert diff < 60

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_add_filament_required():
    """Test adding a filament with only the required fields to the database."""
    # Execute
    density = 1.25
    diameter = 1.75
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": density,
            "diameter": diameter,
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert_dicts_compatible(
        filament,
        {
            "id": filament["id"],
            "registered": filament["registered"],
            "density": density,
            "diameter": diameter,
        },
    )

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_add_filament_color_hex_alpha():
    """Test adding a filament with an alpha channel in the color hex."""
    color_hex = "FF000088"

    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "color_hex": color_hex,
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert filament["color_hex"] == color_hex

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_add_filament_multi_color():
    """Test adding a filament with multi color hexes."""
    multi_color_hexes = "FF0000,00FF00"
    multi_color_direction = "coaxial"

    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "multi_color_hexes": multi_color_hexes,
            "multi_color_direction": multi_color_direction,
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert filament["multi_color_hexes"] == multi_color_hexes
    assert filament["multi_color_direction"] == multi_color_direction

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_add_filament_multi_color_errors():
    """Test adding a filament with multi color hexes with errors."""
    # Bad hex color list
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "multi_color_hexes": "FF0000,",  # Bad 2nd color
            "multi_color_direction": "coaxial",
        },
    )

    # Verify
    assert result.status_code == 422

    # Missing multi_color_hexes but direction is specified
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "multi_color_direction": "coaxial",
        },
    )

    # Verify
    assert result.status_code == 422

    # multi_color_hexes is specified but direction is not
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "multi_color_hexes": "FF0000,00FF00",
        },
    )

    # Verify
    assert result.status_code == 422

    # multi_color_hexes only has a single color
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "multi_color_hexes": "FF0000",
            "multi_color_direction": "coaxial",
        },
    )

    # Verify
    assert result.status_code == 422

    # Both multi_color_hexes and color_hex is specified
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "color_hex": "FF0000",
            "multi_color_hexes": "FF0000,00FF00",
            "multi_color_direction": "coaxial",
        },
    )

    # Verify
    assert result.status_code == 422
