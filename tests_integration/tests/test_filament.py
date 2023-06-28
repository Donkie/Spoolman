"""Integration tests for the Filament API endpoint."""

from typing import Any

import httpx

URL = "http://spoolman:8000"


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
    assert filament == {
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
    }

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
    assert filament == {
        "id": filament["id"],
        "registered": filament["registered"],
        "density": density,
        "diameter": diameter,
    }

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


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
    assert filament == {
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
    }

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


def test_find_filaments(random_vendor: dict[str, Any]):
    """Test finding filaments from the database."""
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
        },
    )
    result.raise_for_status()
    filament_1 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament Y",
            "vendor_id": random_vendor["id"],
            "material": "ABS",
            "price": 200,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "987654321",
            "comment": "abcdefghåäö",
        },
    )
    result.raise_for_status()
    filament_2 = result.json()

    added_filaments_by_id = {
        filament_1["id"]: filament_1,
        filament_2["id"]: filament_2,
    }

    # Execute - find all filaments
    result = httpx.get(
        f"{URL}/api/v1/filament",
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 2
    for filament in filaments:
        assert filament == added_filaments_by_id[filament["id"]]

    # Execute - find filaments by name
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"name": "Filament X"},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 1
    assert filaments[0] == added_filaments_by_id[filament_1["id"]]

    # Execute - find filaments by material
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"material": "abs"},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 1
    assert filaments[0] == added_filaments_by_id[filament_2["id"]]

    # Execute - find filaments by vendor id
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor_id": random_vendor["id"]},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 2
    for filament in filaments:
        assert filament == added_filaments_by_id[filament["id"]]

    # Execute - find filaments by vendor name
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor_name": random_vendor["name"]},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 2
    for filament in filaments:
        assert filament == added_filaments_by_id[filament["id"]]

    # Execute - find filaments by article number
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"article_number": "321"},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 1
    assert filaments[0] == added_filaments_by_id[filament_2["id"]]

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_2['id']}").raise_for_status()


def test_delete_filament(random_vendor: dict[str, Any]):
    """Test deleting a filament from the database."""
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
        },
    )
    result.raise_for_status()
    added_filament = result.json()

    # Execute
    httpx.delete(
        f"{URL}/api/v1/filament/{added_filament['id']}",
    ).raise_for_status()

    # Verify
    result = httpx.get(
        f"{URL}/api/v1/filament/{added_filament['id']}",
    )
    assert result.status_code == 404


def test_delete_filament_not_found():
    """Test deleting a filament that does not exist."""
    # Execute
    result = httpx.delete(f"{URL}/api/v1/filament/123456789")

    # Verify
    assert result.status_code == 404
    message = result.json()["message"].lower()
    assert "filament" in message
    assert "id" in message
    assert "123456789" in message


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
        },
    )
    result.raise_for_status()

    # Verify
    filament = result.json()
    assert filament == {
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
    }

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


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
