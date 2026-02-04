from types import SimpleNamespace

from spoolman.extra_fields import ExtraField
from spoolman.exceptions import ItemNotFoundError


def test_get_update_and_delete_field_endpoints(client, monkeypatch):
    async def fake_get_extra_fields(db, entity_type):
        # Return a fully valid ExtraField
        return [
            ExtraField(
                key="a",
                name="A",
                description="d",
                field_type="text",
                entity_type=entity_type,
            )
        ]

    async def fake_add_or_update(db, entity_type, body):
        if body.key == "bad":
            raise ValueError("bad field")

    async def fake_delete(db, entity_type, key):
        if key == "missing":
            raise ItemNotFoundError()

    monkeypatch.setattr("spoolman.api.v1.field.get_extra_fields", fake_get_extra_fields)
    monkeypatch.setattr("spoolman.api.v1.field.add_or_update_extra_field", fake_add_or_update)
    monkeypatch.setattr("spoolman.api.v1.field.delete_extra_field", fake_delete)

    r = client.get("/field/spool")
    assert r.status_code == 200

    r = client.post(
        "/field/spool/bad",
        json={"name": "L", "description": "D", "field_type": "text"},
    )
    assert r.status_code == 400

    r = client.post(
        "/field/spool/good",
        json={"name": "L", "description": "D", "field_type": "text"},
    )
    assert r.status_code == 200

    r = client.delete("/field/spool/missing")
    assert r.status_code == 404

    r = client.delete("/field/spool/existing")
    assert r.status_code == 200
