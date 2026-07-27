"""Tests for validating and cache-invalidating extra fields written through the settings endpoint.

The /field endpoints validate what they write, but the generic /setting/{key} endpoint did not.
A malformed extra_fields_* array written that way was accepted and then failed to parse on every
later read, leaving GET /field/{entity} permanently returning 500.
"""

import json

import pytest

from spoolman import extra_field_registry as registry
from spoolman.extra_field_registry import EntityType, ExtraField


def field(**overrides: object) -> dict[str, object]:
    """Build a valid extra-field payload, with any part of it overridden."""
    return {"key": "batch", "entity_type": "spool", "name": "Batch", "field_type": "text"} | overrides


def test_entity_type_of_setting_recognises_each_entity():
    assert registry.entity_type_of_setting("extra_fields_spool") is EntityType.spool
    assert registry.entity_type_of_setting("extra_fields_filament") is EntityType.filament
    assert registry.entity_type_of_setting("extra_fields_vendor") is EntityType.vendor


def test_entity_type_of_setting_ignores_other_settings():
    assert registry.entity_type_of_setting("currency") is None
    assert registry.entity_type_of_setting("base_url") is None
    assert registry.entity_type_of_setting("extra_fields_nonsense") is None


def test_valid_extra_fields_pass():
    registry.validate_extra_field_setting("extra_fields_spool", json.dumps([field()]))


def test_empty_array_passes():
    registry.validate_extra_field_setting("extra_fields_spool", json.dumps([]))


def test_other_settings_are_not_validated():
    """Only extra_fields_* settings carry a registry; everything else must pass through."""
    registry.validate_extra_field_setting("currency", json.dumps("EUR"))


def test_non_array_is_rejected():
    with pytest.raises(ValueError, match="must be an array"):
        registry.validate_extra_field_setting("extra_fields_spool", json.dumps({"key": "batch"}))


def test_field_missing_required_keys_is_rejected():
    """The exact shape from the audit: a bare {"key": ...} used to be accepted."""
    with pytest.raises(ValueError, match="index 0"):
        registry.validate_extra_field_setting("extra_fields_spool", json.dumps([{"key": "nope"}]))


def test_mismatched_entity_type_is_rejected():
    payload = json.dumps([field(entity_type="vendor")])
    with pytest.raises(ValueError, match="entity type"):
        registry.validate_extra_field_setting("extra_fields_spool", payload)


def test_invalid_key_pattern_is_rejected():
    payload = json.dumps([field(key="Not A Key")])
    with pytest.raises(ValueError, match="index 0"):
        registry.validate_extra_field_setting("extra_fields_spool", payload)


def test_choice_field_without_choices_is_rejected():
    """validate_extra_field's rules must apply here too, not just on the /field endpoints."""
    payload = json.dumps([field(field_type="choice")])
    with pytest.raises(ValueError, match="index 0"):
        registry.validate_extra_field_setting("extra_fields_spool", payload)


def test_duplicate_keys_are_rejected():
    payload = json.dumps([field(), field(name="Batch again")])
    with pytest.raises(ValueError, match="duplicate"):
        registry.validate_extra_field_setting("extra_fields_spool", payload)


def test_the_offending_index_is_reported():
    payload = json.dumps([field(), field(key="second", name="")])
    with pytest.raises(ValueError, match="index 1"):
        registry.validate_extra_field_setting("extra_fields_spool", payload)


def test_invalidate_drops_only_the_matching_entity(monkeypatch: pytest.MonkeyPatch):
    cache = {
        EntityType.spool: [ExtraField.model_validate(field())],
        EntityType.vendor: [],
    }
    monkeypatch.setattr(registry, "extra_field_cache", cache)

    registry.invalidate_extra_field_cache("extra_fields_spool")

    assert EntityType.spool not in cache
    assert EntityType.vendor in cache


def test_invalidate_ignores_unrelated_settings(monkeypatch: pytest.MonkeyPatch):
    cache = {EntityType.spool: []}
    monkeypatch.setattr(registry, "extra_field_cache", cache)

    registry.invalidate_extra_field_cache("currency")

    assert EntityType.spool in cache


def test_invalidate_is_safe_when_nothing_is_cached(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(registry, "extra_field_cache", {})
    registry.invalidate_extra_field_cache("extra_fields_spool")
