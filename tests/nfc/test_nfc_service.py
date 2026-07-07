"""Tests for NfcService reader-loop behavior (no hardware, no nfcpy needed).

Oracle: the observable service behavior at the nfcpy boundary — the ``terminate``
callable handed to ``clf.connect`` must abort polling at the requested deadline
(regression: ``terminate=lambda: False`` pinned a worker thread forever when no
tag was present), reads must cover NTAG213 user memory exactly, disconnects must
mark the service for reconnect, and the reconnect handle-swap must happen under
the same lock the read/write paths hold (regression: use-after-close race).

The nfcpy frontend is replaced with in-test fakes; ``nfc`` itself is never
imported (the service imports it lazily inside ``_try_connect`` only).
"""

import sys
import time
import types
from typing import Any

import pytest

from spoolman import nfc_service as nfc_service_module
from spoolman.nfc_service import NfcService

# Iteration cap so a broken terminate can never hang the test suite.
_POLL_SAFETY_CAP = 10_000


class PollingFrontend:
    """Fake ContactlessFrontend that polls like nfcpy: no tag ever appears.

    nfcpy calls ``terminate()`` between polling rounds and aborts with ``None``
    as soon as it returns True. A correct deadline-based terminate makes this
    loop finite; the pre-fix ``lambda: False`` would spin until the safety cap.
    """

    def __init__(self) -> None:
        self.terminate_calls = 0

    def connect(self, rdwr: dict, terminate: Any) -> None:  # noqa: ARG002
        for _ in range(_POLL_SAFETY_CAP):
            if terminate():
                return None
            self.terminate_calls += 1
            time.sleep(0.001)
        pytest.fail("terminate() never returned True — deadline logic is broken")
        return None


class FakeTag:
    """Fake NTAG213: read(page) returns 16 bytes (4 pages) stamped with the page number."""

    def __init__(self) -> None:
        self.pages_read: list[int] = []

    def read(self, page: int) -> bytes:
        self.pages_read.append(page)
        return bytes([page]) * 16


class TagFrontend:
    """Fake frontend where a tag is present immediately."""

    def __init__(self, tag: Any) -> None:
        self.tag = tag

    def connect(self, rdwr: dict, terminate: Any) -> Any:  # noqa: ARG002
        return self.tag


def _connected_service(clf: Any) -> NfcService:
    """Build a service with an injected fake frontend, bypassing hardware setup."""
    service = NfcService()
    service._clf = clf  # noqa: SLF001
    service._initialized = True  # noqa: SLF001
    service._status = "connected"  # noqa: SLF001
    return service


def test_read_tag_aborts_at_deadline_when_no_tag_present() -> None:
    clf = PollingFrontend()
    service = _connected_service(clf)

    start = time.monotonic()
    result = service.read_tag(timeout=0.05)
    elapsed = time.monotonic() - start

    assert result is None
    # Polled at least once, then aborted near the deadline — not at the safety cap.
    assert 0 < clf.terminate_calls < _POLL_SAFETY_CAP
    assert elapsed < 5.0, f"read_tag took {elapsed:.1f}s for a 0.05s timeout"


def test_read_tag_auto_aborts_at_deadline_when_no_tag_present() -> None:
    clf = PollingFrontend()
    service = _connected_service(clf)
    assert service.read_tag_auto(timeout=0.05) is None
    assert 0 < clf.terminate_calls < _POLL_SAFETY_CAP


def test_read_tag_returns_full_ntag213_user_memory() -> None:
    tag = FakeTag()
    service = _connected_service(TagFrontend(tag))

    data = service.read_tag(timeout=0.05)

    assert data is not None
    assert len(data) == 144
    # NTAG213 READ returns 4 pages per call: pages 4..36 step 4, no overlap.
    assert tag.pages_read == [4, 8, 12, 16, 20, 24, 28, 32, 36]


def test_read_tag_marks_service_for_reconnect_on_reader_disconnect() -> None:
    class DisconnectingFrontend:
        def connect(self, rdwr: dict, terminate: Any) -> Any:  # noqa: ARG002
            raise OSError("USB device unplugged")

    service = _connected_service(DisconnectingFrontend())

    assert service.read_tag(timeout=0.05) is None
    assert service._status == "error"  # noqa: SLF001
    assert service._clf is None  # noqa: SLF001


def test_write_tag_rejects_wrong_payload_length() -> None:
    service = _connected_service(TagFrontend(FakeTag()))
    assert service.write_tag(b"too short", timeout=0.05) is False


def test_try_connect_swaps_handle_under_the_read_write_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The stale-handle close and new-handle open must hold self._lock.

    Regression guard for the use-after-close race: a reconnect closing the
    handle while a read in another thread is mid-``clf.connect``.
    """
    service = NfcService()
    observed: dict[str, bool] = {}

    class OldClf:
        def close(self) -> None:
            observed["close_held_lock"] = service._lock.locked()  # noqa: SLF001

    class NewClf:
        def __init__(self, path: str) -> None:
            observed["open_held_lock"] = service._lock.locked()  # noqa: SLF001
            self.path = path

    service._clf = OldClf()  # noqa: SLF001
    service._initialized = True  # noqa: SLF001

    fake_nfc = types.ModuleType("nfc")
    fake_nfc.ContactlessFrontend = NewClf
    monkeypatch.setitem(sys.modules, "nfc", fake_nfc)
    monkeypatch.setattr(nfc_service_module, "get_nfc_reader_type", lambda: "nfcpy")
    monkeypatch.setattr(nfc_service_module, "get_nfc_device_path", lambda: None)

    assert service._try_connect() is True  # noqa: SLF001

    assert observed == {"close_held_lock": True, "open_held_lock": True}
    assert isinstance(service._clf, NewClf)  # noqa: SLF001
    assert service.get_status() == "connected"
