"""Integration tests for the Filament API endpoint."""

from typing import Any

import httpx

from ..conftest import URL, assert_dicts_compatible


def test_update_filament(random_vendor: dict[str, Any]):
    """Test updating a filament in the database."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament X",
            "vendor_id": random_vendor["id"],
            "material": "PLA",
            "price": 100,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "123456789",
            "comment": "abcdefghåäö",
            "settings_extruder_temp": 200,
            "settings_bed_temp": 60,
            "color_hex": "FF0000",
            "external_id": "external_id1",
        },
    )
    result.raise_for_status()
    added_filament = result.json()

    # Execute
    new_name = "Filament Y"
    new_material = "ABS"
    new_price = 200
    new_density = 4.2
    new_diameter = 0.12
    new_weight = 5431
    new_spool_weight = 123
    new_article_number = "987654321"
    new_comment = "test"
    new_settings_extruder_temp = 210
    new_settings_bed_temp = 70
    new_color_hex = "00FF00"
    new_external_id = "external_id2"
    result = httpx.patch(
        f"{URL}/api/v1/filament/{added_filament['id']}",
        json={
            "name": new_name,
            "vendor_id": random_vendor["id"],
            "material": new_material,
            "price": new_price,
            "density": new_density,
            "diameter": new_diameter,
            "weight": new_weight,
            "spool_weight": new_spool_weight,
            "article_number": new_article_number,
            "comment": new_comment,
            "settings_extruder_temp": new_settings_extruder_temp,
            "settings_bed_temp": new_settings_bed_temp,
            "color_hex": new_color_hex,
            "external_id": new_external_id,
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert_dicts_compatible(
        filament,
        {
            "id": added_filament["id"],
            "registered": added_filament["registered"],
            "name": new_name,
            "vendor": random_vendor,
            "material": new_material,
            "price": new_price,
            "density": new_density,
            "diameter": new_diameter,
            "weight": new_weight,
            "spool_weight": new_spool_weight,
            "article_number": new_article_number,
            "comment": new_comment,
            "settings_extruder_temp": new_settings_extruder_temp,
            "settings_bed_temp": new_settings_bed_temp,
            "color_hex": new_color_hex,
            "external_id": new_external_id,
        },
    )

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_update_filament_multi_color():
    """Test updating a filament in the database."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
            "multi_color_hexes": "FF0000,00FF00",
            "multi_color_direction": "coaxial",
        },
    )
    result.raise_for_status()
    added_filament = result.json()

    # Execute
    new_multi_color_hexes = "00FF00,0000FF"
    new_multi_color_direction = "longitudinal"
    result = httpx.patch(
        f"{URL}/api/v1/filament/{added_filament['id']}",
        json={
            "multi_color_hexes": new_multi_color_hexes,
            "multi_color_direction": new_multi_color_direction,
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert_dicts_compatible(
        filament,
        {
            "id": added_filament["id"],
            "registered": added_filament["registered"],
            "multi_color_hexes": new_multi_color_hexes,
            "multi_color_direction": new_multi_color_direction,
        },
    )

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_update_filament_cant_set_none(random_vendor: dict[str, Any]):
    """Test updating a filament and setting density and diameter fields to None, should result in 422 error."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament X",
            "vendor_id": random_vendor["id"],
            "material": "PLA",
            "price": 100,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "123456789",
            "comment": "abcdefghåäö",
            "settings_extruder_temp": 200,
            "settings_bed_temp": 60,
            "color_hex": "FF0000",
            "external_id": "external_id1",
        },
    )
    result.raise_for_status()
    added_filament = result.json()

    # Execute
    result = httpx.patch(
        f"{URL}/api/v1/filament/{added_filament['id']}",
        json={"density": None, "diameter": None},
    )

    # Verify
    assert result.status_code == 422

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{added_filament['id']}").raise_for_status()


def test_update_filament_not_found():
    """Test updating a filament that does not exist."""
    # Execute
    result = httpx.patch(
        f"{URL}/api/v1/filament/123456789",
        json={"name": "Filament Y"},
    )

    # Verify
    assert result.status_code == 404
    message = result.json()["message"].lower()
    assert "filament" in message
    assert "id" in message
    assert "123456789" in message
