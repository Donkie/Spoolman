"""Settings that can be changed by the user.

All settings are JSON encoded and stored in the database.
"""

import json
from dataclasses import dataclass
from enum import Enum


class SettingType(Enum):
    """The type of a setting."""

    BOOLEAN = "boolean"
    NUMBER = "number"
    STRING = "string"
    ARRAY = "array"
    OBJECT = "object"


@dataclass
class SettingDefinition:
    """A setting that can be changed by the user."""

    key: str
    type: SettingType
    default: str

    def validate_type(self, value: str) -> None:  # noqa: C901
        """Validate that the value has the correct type."""
        obj = json.loads(value)
        if self.type == SettingType.BOOLEAN:
            if not isinstance(obj, bool):
                raise ValueError(f"Setting {self.key} must be a boolean.")
        elif self.type == SettingType.NUMBER:
            if not isinstance(obj, (int, float)):
                raise ValueError(f"Setting {self.key} must be a number.")
        elif self.type == SettingType.STRING:
            if not isinstance(obj, str):
                raise ValueError(f"Setting {self.key} must be a string.")
        elif self.type == SettingType.ARRAY:
            if not isinstance(obj, list):
                raise ValueError(f"Setting {self.key} must be an array.")
        elif self.type == SettingType.OBJECT:  # noqa: SIM102
            if not isinstance(obj, dict):
                raise ValueError(f"Setting {self.key} must be an object.")


SETTINGS: dict[str, SettingDefinition] = {}


def register_setting(key: str, typ: SettingType, default: str) -> None:
    """Register a setting."""
    SETTINGS[key] = SettingDefinition(key, typ, default)


def parse_setting(key: str) -> SettingDefinition:
    """Parse a setting key."""
    if key not in SETTINGS:
        raise ValueError(f"Setting {key} does not exist.")
    return SETTINGS[key]


register_setting("currency", SettingType.STRING, json.dumps("EUR"))
register_setting("round_prices", SettingType.BOOLEAN, json.dumps(obj=False))
register_setting("print_presets", SettingType.ARRAY, json.dumps([]))
register_setting("label_designs", SettingType.ARRAY, json.dumps([]))

register_setting("extra_fields_vendor", SettingType.ARRAY, json.dumps([]))
register_setting("extra_fields_filament", SettingType.ARRAY, json.dumps([]))
register_setting("extra_fields_spool", SettingType.ARRAY, json.dumps([]))
register_setting("base_url", SettingType.STRING, json.dumps(""))

register_setting("locations", SettingType.ARRAY, json.dumps([]))
register_setting("locations_spoolorders", SettingType.OBJECT, json.dumps({}))

# Never store a secret in a setting. Settings are readable through GET /setting/ and
# every write is broadcast to all websocket subscribers, so anything put here is public
# to every client that can read the API. Deployment secrets belong in environment
# variables; see spoolman/env.py.
register_setting("auth_anonymous_read", SettingType.BOOLEAN, json.dumps(obj=False))

# How many days of audit log to keep. Zero keeps everything. A setting rather than an
# environment variable because retention is a policy an administrator revises, not a
# deployment parameter, and changing it should not need a restart. Not a secret: it says
# nothing about what is in the log.
register_setting("auth_audit_retention_days", SettingType.NUMBER, json.dumps(90))
