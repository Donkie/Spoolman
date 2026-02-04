import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient

from spoolman.api.v1 import router as api_router
from spoolman.database import spool as spool_db
from spoolman.api.v1 import models as api_models
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError, SpoolMeasureError


client = TestClient(api_router.app)


@pytest.mark.asyncio
async def test_info_and_health():
    r = client.get("/info")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data

    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def _valid_spool_dict(spool_id: int) -> dict:
    return {
        "id": spool_id,
        "registered": "2020-01-01T00:00:00Z",
        "filament": {
            "id": 1,
            "registered": "2020-01-01T00:00:00Z",
            "density": 1.0,
            "diameter": 1.75,
            "extra": {},
        },
        "used_weight": 0.0,
        "used_length": 0.0,
        "archived": False,
        "extra": {},
    }


def test_find_spools_returns_items_and_header(monkeypatch):
    async def fake_find(*, db, **kwargs):
        return [SimpleNamespace(id=1)], 42

    monkeypatch.setattr(spool_db, "find", fake_find)
    monkeypatch.setattr(api_models.Spool, "from_db", staticmethod(lambda item: _valid_spool_dict(item.id)))

    r = client.get("/spool?limit=1")
    assert r.status_code == 200
    assert r.json() == [{"id": 1, "registered": "2020-01-01T00:00:00Z", "filament": {"id": 1, "registered": "2020-01-01T00:00:00Z", "density": 1.0, "diameter": 1.75, "extra": {}}, "used_weight": 0.0, "used_length": 0.0, "archived": False, "extra": {}}]
    assert r.headers.get("x-total-count") == "42"


def test_get_spool_success_and_not_found(monkeypatch):
    async def fake_get(db, spool_id):
        return SimpleNamespace(id=123)

    monkeypatch.setattr(spool_db, "get_by_id", fake_get)
    monkeypatch.setattr(api_models.Spool, "from_db", staticmethod(lambda item: _valid_spool_dict(item.id)))

    r = client.get("/spool/123")
    assert r.status_code == 200
    assert r.json()["id"] == 123

    async def fake_get_notfound(db, spool_id):
        raise ItemNotFoundError("No spool found")

    monkeypatch.setattr(spool_db, "get_by_id", fake_get_notfound)

    r = client.get("/spool/999")
    assert r.status_code == 404
    assert r.json() == {"message": "No spool found"}


def test_create_conflicting_weights_and_extra_validation(monkeypatch):
    # conflicting weights
    r = client.post("/spool", json={"filament_id": 1, "remaining_weight": 10, "used_weight": 5})
    assert r.status_code == 400
    assert r.json() == {"message": "Only specify either remaining_weight or used_weight."}

    # invalid extra fields
    async def fake_get_extra_fields(db, entity_type):
        return ["some_field"]

    def fake_validate_extra_field_dict(all_fields, extra):
        raise ValueError("Invalid extra fields")

    # Patch the symbols imported into the API module, not the extra_fields module directly
    monkeypatch.setattr("spoolman.api.v1.spool.get_extra_fields", fake_get_extra_fields)
    monkeypatch.setattr("spoolman.api.v1.spool.validate_extra_field_dict", fake_validate_extra_field_dict)

    r = client.post("/spool", json={"filament_id": 1, "extra": {"bad": "value"}})
    assert r.status_code == 400
    assert r.json() == {"message": "Invalid extra fields"}


def test_use_endpoint_and_measure_errors(monkeypatch):
    # both use_weight and use_length -> error
    r = client.put("/spool/1/use", json={"use_weight": 1, "use_length": 2})
    assert r.status_code == 400
    assert r.json() == {"message": "Only specify either use_weight or use_length."}

    # neither provided -> error
    r = client.put("/spool/1/use", json={})
    assert r.status_code == 400
    assert r.json() == {"message": "Either use_weight or use_length must be specified."}

    # use_weight success
    async def fake_use_weight(db, spool_id, weight):
        return SimpleNamespace(id=1)

    monkeypatch.setattr(spool_db, "use_weight", fake_use_weight)
    monkeypatch.setattr(api_models.Spool, "from_db", staticmethod(lambda item: _valid_spool_dict(item.id)))

    r = client.put("/spool/1/use", json={"use_weight": 5})
    assert r.status_code == 200
    assert r.json()["id"] == 1

    # measure error
    async def fake_measure(db, spool_id, weight):
        raise SpoolMeasureError("Initial weight is not set")

    monkeypatch.setattr(spool_db, "measure", fake_measure)

    r = client.put("/spool/1/measure", json={"weight": 100})
    assert r.status_code == 400
    assert r.json() == {"message": "Initial weight is not set"}
