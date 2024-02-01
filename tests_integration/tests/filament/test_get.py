"""Integration tests for the Filament API endpoint."""

from typing import Any

import httpx

from ..conftest import URL, assert_dicts_compatible


def test_get_filament(random_vendor: dict[str, Any]):
    """Test getting a filament from the database."""
    # Setup
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
    added_filament = result.json()

    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament/{added_filament['id']}",
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert_dicts_compatible(
        filament,
        {
            "id": added_filament["id"],
            "registered": added_filament["registered"],
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

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_get_filament_not_found():
    """Test getting a filament that does not exist."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament/123456789",
    )

    # Verify
    assert result.status_code == 404
    message = result.json()["message"].lower()
    assert "filament" in message
    assert "id" in message
    assert "123456789" in message
