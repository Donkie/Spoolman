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
