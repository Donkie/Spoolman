from types import SimpleNamespace

from spoolman.database import vendor as vendor_db
from spoolman.api.v1 import models as api_models
from spoolman.exceptions import ItemNotFoundError


def test_find_vendors_returns_items_and_header(client, monkeypatch):
    async def fake_find(*, db, **kwargs):
        return [SimpleNamespace(id=2)], 5

    monkeypatch.setattr(vendor_db, "find", fake_find)
    monkeypatch.setattr(api_models.Vendor, "from_db", staticmethod(lambda item: {"id": item.id}))

    r = client.get("/vendor?limit=1")
    assert r.status_code == 200
    assert r.json() == [{"id": 2}]
    assert r.headers.get("x-total-count") == "5"


def test_get_vendor_success_and_not_found(client, monkeypatch):
    async def fake_get(db, vendor_id):
        return SimpleNamespace(id=321)

    monkeypatch.setattr(vendor_db, "get_by_id", fake_get)
    monkeypatch.setattr(
        api_models.Vendor,
        "from_db",
        staticmethod(lambda item: {"id": item.id, "registered": "2020-01-01T00:00:00", "name": "Acme", "extra": {}}),
    )

    r = client.get("/vendor/321")
    assert r.status_code == 200
    assert r.json()["id"] == 321

    async def fake_get_notfound(db, vendor_id):
        raise ItemNotFoundError("No vendor found")

    monkeypatch.setattr(vendor_db, "get_by_id", fake_get_notfound)

    r = client.get("/vendor/999")
    assert r.status_code == 404
    assert r.json() == {"message": "No vendor found"}


def test_create_extra_validation(client, monkeypatch):
    async def fake_get_extra_fields(db, entity_type):
        return ["some_field"]

    def fake_validate_extra_field_dict(all_fields, extra):
        raise ValueError("Invalid extra fields")

    monkeypatch.setattr("spoolman.api.v1.vendor.get_extra_fields", fake_get_extra_fields)
    monkeypatch.setattr("spoolman.api.v1.vendor.validate_extra_field_dict", fake_validate_extra_field_dict)

    r = client.post("/vendor", json={"name": "Acme", "extra": {"bad": "value"}})
    assert r.status_code == 400
    assert r.json() == {"message": "Invalid extra fields"}
