from types import SimpleNamespace

from spoolman.api.v1 import router as api_router
from spoolman.database import filament as filament_db
from spoolman.api.v1 import models as api_models
from spoolman.exceptions import ItemDeleteError


def test_find_filaments_returns_items_and_header(client, monkeypatch):
    async def fake_find(*, db, **kwargs):
        return [SimpleNamespace(id=1)], 10

    monkeypatch.setattr(filament_db, "find", fake_find)
    monkeypatch.setattr(api_models.Filament, "from_db", staticmethod(lambda item: {"id": item.id}))

    r = client.get("/filament?limit=1")
    assert r.status_code == 200
    assert r.json() == [{"id": 1}]
    assert r.headers.get("x-total-count") == "10"


def test_get_filament_success_and_not_found(client, monkeypatch):
    async def fake_get(db, filament_id):
        return SimpleNamespace(id=123)

    monkeypatch.setattr(filament_db, "get_by_id", fake_get)
    monkeypatch.setattr(
        api_models.Filament,
        "from_db",
        staticmethod(lambda item: {"id": item.id, "registered": "2020-01-01T00:00:00", "density": 1.24, "diameter": 1.75, "extra": {}}),
    )

    r = client.get("/filament/123")
    assert r.status_code == 200
    assert r.json()["id"] == 123

    async def fake_get_notfound(db, filament_id):
        raise Exception("not found")

    monkeypatch.setattr(filament_db, "get_by_id", fake_get_notfound)

    r = client.get("/filament/999")
    assert r.status_code == 500


def test_create_extra_validation(client, monkeypatch):
    async def fake_get_extra_fields(db, entity_type):
        return ["some_field"]

    def fake_validate_extra_field_dict(all_fields, extra):
        raise ValueError("Invalid extra fields")

    monkeypatch.setattr("spoolman.api.v1.filament.get_extra_fields", fake_get_extra_fields)
    monkeypatch.setattr("spoolman.api.v1.filament.validate_extra_field_dict", fake_validate_extra_field_dict)

    r = client.post("/filament", json={"density": 1.24, "diameter": 1.75, "extra": {"bad": "value"}})
    assert r.status_code == 400
    assert r.json() == {"message": "Invalid extra fields"}


def test_delete_filament_failure(client, monkeypatch):
    async def fake_delete(db, filament_id):
        raise ItemDeleteError("cannot delete")

    monkeypatch.setattr(filament_db, "delete", fake_delete)

    r = client.delete("/filament/1")
    assert r.status_code == 403
