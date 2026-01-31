from types import SimpleNamespace

from spoolman.database import setting as setting_db
from spoolman.settings import SettingDefinition, SettingType
from spoolman.exceptions import ItemNotFoundError


class FakeDef:
    key = "test.key"
    default = "defval"
    type = SettingType.STRING
    def validate_type(self, value):
        if value == "bad":
            raise ValueError("invalid type")


def test_get_setting_invalid_key(client, monkeypatch):
    def fake_parse_setting(key):
        raise ValueError("Unknown setting")

    monkeypatch.setattr("spoolman.api.v1.setting.parse_setting", fake_parse_setting)

    r = client.get("/setting/doesnotexist")
    assert r.status_code == 404


def test_get_setting_not_set_and_set(client, monkeypatch):
    def fake_parse_setting(key):
        return FakeDef()

    async def fake_get(db, definition):
        raise ItemNotFoundError()

    monkeypatch.setattr("spoolman.api.v1.setting.parse_setting", fake_parse_setting)
    monkeypatch.setattr(setting_db, "get", fake_get)

    r = client.get("/setting/test.key")
    assert r.status_code == 200
    data = r.json()
    assert data["value"] == "defval"
    assert data["is_set"] is False


def test_update_setting_validation_and_set_unset(client, monkeypatch):
    def fake_parse_setting(key):
        return FakeDef()

    state = {"deleted": False}

    async def fake_get(db, definition):
        if state["deleted"]:
            raise ItemNotFoundError()
        class Item: value = "ok"
        return Item()

    async def fake_update(db, definition, value):
        return None

    async def fake_delete(db, definition):
        state["deleted"] = True

    monkeypatch.setattr("spoolman.api.v1.setting.parse_setting", fake_parse_setting)
    monkeypatch.setattr(setting_db, "get", fake_get)
    monkeypatch.setattr(setting_db, "update", fake_update)
    monkeypatch.setattr(setting_db, "delete", fake_delete)

    r = client.post("/setting/test.key", json="bad")
    assert r.status_code == 400

    r = client.post("/setting/test.key", data="\"value\"")
    assert r.status_code == 200
    assert r.json()["value"] == "ok"

    # Sending an empty JSON string should unset the setting
    r = client.post("/setting/test.key", data='""')
    assert r.status_code == 200
    assert r.json()["value"] == "defval"
