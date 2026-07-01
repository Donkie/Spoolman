"""Behavioral tests for the NFC/TigerTag settings helpers in ``spoolman.env``.

Oracle strategy (see TESTING_STRATEGY.md §0):
  * The oracle is the *documented env-var contract*, not the implementation. We
    drive each helper solely through its ``SPOOLMAN_*`` environment variable
    (the system boundary) using ``monkeypatch.setenv`` / ``monkeypatch.delenv``
    and assert the returned value. No module internals are patched or inspected.
  * Every helper reads its variable with ``os.getenv`` *at call time* (verified
    by reading the source), so a plain ``monkeypatch`` per test is sufficient --
    there is no import-time caching to work around.
"""

from collections.abc import Callable

import pytest

from spoolman import env

# --- Boolean helpers: is_nfc_enabled / is_tigertag_enabled ------------------
#
# Both share the identical contract: default FALSE when unset, {FALSE,0} -> False,
# {TRUE,1} -> True, case-insensitive (the code uppercases), anything else raises
# ValueError. Parametrizing over (helper, env-var) keeps the two truth tables in
# lockstep without duplicating them.

_BOOL_HELPERS: list[tuple[Callable[[], bool], str]] = [
    (env.is_nfc_enabled, "SPOOLMAN_NFC_ENABLED"),
    (env.is_tigertag_enabled, "SPOOLMAN_TIGERTAG_ENABLED"),
]


@pytest.mark.parametrize(("helper", "var"), _BOOL_HELPERS)
@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("TRUE", True),
        ("true", True),
        ("True", True),
        ("1", True),
        ("FALSE", False),
        ("false", False),
        ("False", False),
        ("0", False),
    ],
)
def test_bool_helper_parses_documented_values(
    monkeypatch: pytest.MonkeyPatch,
    helper: Callable[[], bool],
    var: str,
    value: str,
    expected: bool,  # noqa: FBT001  # parametrized value, not a boolean flag argument
) -> None:
    """Parse TRUE/1 as True and FALSE/0 as False, case-insensitively."""
    monkeypatch.setenv(var, value)
    assert helper() is expected


@pytest.mark.parametrize(("helper", "var"), _BOOL_HELPERS)
def test_bool_helper_defaults_to_false_when_unset(
    monkeypatch: pytest.MonkeyPatch,
    helper: Callable[[], bool],
    var: str,
) -> None:
    """Return False when the variable is not set (documented default)."""
    monkeypatch.delenv(var, raising=False)
    assert helper() is False


@pytest.mark.parametrize(("helper", "var"), _BOOL_HELPERS)
@pytest.mark.parametrize("value", ["maybe", "yes", "2", "", "on"])
def test_bool_helper_raises_on_invalid_value(
    monkeypatch: pytest.MonkeyPatch,
    helper: Callable[[], bool],
    var: str,
    value: str,
) -> None:
    """Raise ValueError for any value outside the documented set."""
    monkeypatch.setenv(var, value)
    with pytest.raises(ValueError):
        helper()


# --- get_nfc_reader_type ----------------------------------------------------


def test_nfc_reader_type_defaults_to_nfcpy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return 'nfcpy' when SPOOLMAN_NFC_READER_TYPE is unset."""
    monkeypatch.delenv("SPOOLMAN_NFC_READER_TYPE", raising=False)
    assert env.get_nfc_reader_type() == "nfcpy"


def test_nfc_reader_type_returns_set_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return the configured reader type verbatim (no normalisation)."""
    monkeypatch.setenv("SPOOLMAN_NFC_READER_TYPE", "pn532")
    assert env.get_nfc_reader_type() == "pn532"


# --- get_nfc_device_path ----------------------------------------------------


def test_nfc_device_path_defaults_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return None when SPOOLMAN_NFC_DEVICE is unset (auto-detect)."""
    monkeypatch.delenv("SPOOLMAN_NFC_DEVICE", raising=False)
    assert env.get_nfc_device_path() is None


def test_nfc_device_path_returns_set_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return the configured device path verbatim."""
    monkeypatch.setenv("SPOOLMAN_NFC_DEVICE", "usb:072f:2200")
    assert env.get_nfc_device_path() == "usb:072f:2200"


# --- get_tigertag_api_url ---------------------------------------------------


def test_tigertag_api_url_defaults_to_public_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return the public TigerTag API URL when the variable is unset."""
    monkeypatch.delenv("SPOOLMAN_TIGERTAG_API_URL", raising=False)
    assert env.get_tigertag_api_url() == "https://api.tigertag.io/api:tigertag/"


def test_tigertag_api_url_returns_set_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return the configured API URL verbatim (e.g. a self-hosted mirror)."""
    monkeypatch.setenv("SPOOLMAN_TIGERTAG_API_URL", "https://mirror.example/api/")
    assert env.get_tigertag_api_url() == "https://mirror.example/api/"


# --- get_tigertag_sync_interval ---------------------------------------------


def test_tigertag_sync_interval_defaults_to_3600(monkeypatch: pytest.MonkeyPatch) -> None:
    """Return 3600 seconds when SPOOLMAN_TIGERTAG_SYNC_INTERVAL is unset."""
    monkeypatch.delenv("SPOOLMAN_TIGERTAG_SYNC_INTERVAL", raising=False)
    assert env.get_tigertag_sync_interval() == 3600


def test_tigertag_sync_interval_parses_integer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Parse the configured interval into an int."""
    monkeypatch.setenv("SPOOLMAN_TIGERTAG_SYNC_INTERVAL", "900")
    result = env.get_tigertag_sync_interval()
    assert result == 900
    assert isinstance(result, int)


def test_tigertag_sync_interval_raises_on_non_integer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Raise ValueError on a non-integer interval (the getter does not tolerate it)."""
    monkeypatch.setenv("SPOOLMAN_TIGERTAG_SYNC_INTERVAL", "not-a-number")
    with pytest.raises(ValueError):
        env.get_tigertag_sync_interval()
