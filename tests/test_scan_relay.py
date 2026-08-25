"""Tests for the scan relay's debounce cache and reader registry.

Both are pure in-memory state, so they are tested here without a socket or a session. Time is
injected rather than slept through, which is what keeps this file fast enough to be worth
running on every change.
"""

import re
from datetime import datetime, timedelta, timezone

import pytest

from spoolman.scanrelay import MAX_READERS, READER_ID_PATTERN, ScanRelay, derive_reader_id

# Aware, matching the relay's own clock. Injected time and the relay's default must agree:
# register() writes last_seen and readers() prunes against it, so a naive value here would
# only pass because these tests inject every clock -- see the internal-consistency test below.
T0 = datetime(2026, 8, 13, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def relay() -> ScanRelay:
    return ScanRelay(debounce_window=timedelta(seconds=3), reader_ttl=timedelta(hours=1))


def test_first_scan_broadcasts(relay: ScanRelay):
    assert relay.should_broadcast("04A2", "desk", None, now=T0) is True


def test_repeat_within_the_window_is_suppressed(relay: ScanRelay):
    """A reader re-reads a tag that is sitting still; subscribers should see one event."""
    relay.should_broadcast("04A2", "desk", 7, now=T0)
    assert relay.should_broadcast("04A2", "desk", 7, now=T0 + timedelta(seconds=1)) is False
    assert relay.should_broadcast("04A2", "desk", 7, now=T0 + timedelta(seconds=2.9)) is False


def test_repeat_after_the_window_broadcasts_again(relay: ScanRelay):
    """Tapping the same tag again later is a new scan, not a duplicate."""
    relay.should_broadcast("04A2", "desk", 7, now=T0)
    assert relay.should_broadcast("04A2", "desk", 7, now=T0 + timedelta(seconds=4)) is True


def test_debounce_is_per_uid_and_per_reader(relay: ScanRelay):
    """Two readers tapping at once, or one reader seeing two tags, are distinct scans."""
    relay.should_broadcast("04A2", "desk", None, now=T0)
    assert relay.should_broadcast("04A2", "printer", None, now=T0) is True
    assert relay.should_broadcast("B1C2", "desk", None, now=T0) is True


def test_a_changed_match_is_not_a_repeat(relay: ScanRelay):
    """The correction after a tag is linked must go out, not wait for the window (#1115).

    An agent taps an unlinked tag, links it in its own UI, then re-reports the scan so the
    paired browser learns the tag is known. Keyed on `(uid, reader)` alone, that second scan
    looked like a duplicate of the first and the browser kept showing "unknown tag".
    """
    assert relay.should_broadcast("04A2", "desk", None, now=T0) is True
    assert relay.should_broadcast("04A2", "desk", 7, now=T0 + timedelta(seconds=1)) is True


def test_a_repeat_of_an_unlinked_tag_is_still_suppressed(relay: ScanRelay):
    """The reason the debounce exists survives the fix: the key stays `(uid, reader, None)`."""
    relay.should_broadcast("04A2", "desk", None, now=T0)
    assert relay.should_broadcast("04A2", "desk", None, now=T0 + timedelta(seconds=1)) is False


def test_repeats_of_the_corrected_match_are_suppressed(relay: ScanRelay):
    """A tag left sitting on the reader after being linked is still one event, not a stream."""
    relay.should_broadcast("04A2", "desk", None, now=T0)
    relay.should_broadcast("04A2", "desk", 7, now=T0 + timedelta(seconds=1))
    assert relay.should_broadcast("04A2", "desk", 7, now=T0 + timedelta(seconds=1.5)) is False


def test_losing_a_match_is_also_a_change(relay: ScanRelay):
    """Unlinking is the same event in reverse: the browser has to hear it lost its spool."""
    relay.should_broadcast("04A2", "desk", 7, now=T0)
    assert relay.should_broadcast("04A2", "desk", None, now=T0 + timedelta(seconds=1)) is True


def test_a_tag_moved_to_another_spool_is_a_change(relay: ScanRelay):
    relay.should_broadcast("04A2", "desk", 7, now=T0)
    assert relay.should_broadcast("04A2", "desk", 8, now=T0 + timedelta(seconds=1)) is True


def test_debounce_entries_are_pruned(relay: ScanRelay):
    """The cache does not grow without bound as tags come and go."""
    for i in range(50):
        relay.should_broadcast(f"UID{i:04X}", "desk", None, now=T0)
    assert len(relay._last_broadcast) == 50  # noqa: SLF001
    relay.should_broadcast("LATER", "desk", None, now=T0 + timedelta(seconds=30))
    assert len(relay._last_broadcast) == 1  # noqa: SLF001


def test_readers_are_listed_most_recently_seen_first(relay: ScanRelay):
    relay.register("desk", "Desk reader", now=T0)
    relay.register("printer", "Voron spool holder", now=T0 + timedelta(minutes=1))

    readers = relay.readers(now=T0 + timedelta(minutes=2))
    assert [r.reader_id for r in readers] == ["printer", "desk"]
    assert readers[0].name == "Voron spool holder"
    assert readers[1].last_seen == T0


def test_registry_is_empty_before_anything_scans(relay: ScanRelay):
    """The registry is not persisted, so this is also the state after a restart."""
    assert relay.readers(now=T0) == []


def test_reader_keeps_its_name_when_a_later_scan_omits_one(relay: ScanRelay):
    """A trimmed-down agent must not blank the label in someone's picker."""
    relay.register("desk", "Desk reader", now=T0)
    relay.register("desk", None, now=T0 + timedelta(minutes=1))

    readers = relay.readers(now=T0 + timedelta(minutes=2))
    assert readers[0].name == "Desk reader"
    assert readers[0].last_seen == T0 + timedelta(minutes=1)


def test_a_new_name_replaces_the_old_one(relay: ScanRelay):
    relay.register("desk", "Desk reader", now=T0)
    relay.register("desk", "Bench reader", now=T0 + timedelta(minutes=1))
    assert relay.readers(now=T0 + timedelta(minutes=2))[0].name == "Bench reader"


def test_reader_remembers_the_last_uid_it_reported(relay: ScanRelay):
    """What is on the reader right now, so a client can offer it instead of asking for a tap."""
    relay.register("desk", "Desk reader", "04A2B3C4", now=T0)
    assert relay.readers(now=T0)[0].last_uid == "04A2B3C4"


def test_a_new_scan_replaces_the_remembered_uid(relay: ScanRelay):
    """One UID, not a history: this answers "what is on the reader", not "what has been"."""
    relay.register("desk", None, "04A2B3C4", now=T0)
    relay.register("desk", None, "0455667788", now=T0 + timedelta(minutes=1))
    assert relay.readers(now=T0 + timedelta(minutes=2))[0].last_uid == "0455667788"


def test_reader_keeps_its_uid_when_a_later_register_omits_one(relay: ScanRelay):
    """Same rule as the name, so registering for another reason cannot blank it."""
    relay.register("desk", None, "04A2B3C4", now=T0)
    relay.register("desk", "Desk reader", now=T0 + timedelta(minutes=1))
    assert relay.readers(now=T0 + timedelta(minutes=2))[0].last_uid == "04A2B3C4"


def test_reader_that_has_not_scanned_has_no_uid(relay: ScanRelay):
    """Null rather than an empty string: "nothing seen yet" is not "seen nothing"."""
    relay.register("desk", "Desk reader", now=T0)
    assert relay.readers(now=T0)[0].last_uid is None


def test_readers_past_their_ttl_are_evicted_on_read(relay: ScanRelay):
    """Eviction happens as the response is built: no background task, nothing to shut down."""
    relay.register("desk", None, now=T0)
    assert len(relay.readers(now=T0 + timedelta(minutes=59))) == 1
    assert relay.readers(now=T0 + timedelta(hours=2)) == []


def test_registry_is_capped(relay: ScanRelay):
    """An unauthenticated endpoint cannot be used to grow the registry without bound."""
    for i in range(MAX_READERS + 20):
        relay.register(f"reader-{i}", None, now=T0 + timedelta(seconds=i))

    readers = relay.readers(now=T0 + timedelta(minutes=30))
    assert len(readers) == MAX_READERS
    # The least recently seen are the ones dropped.
    assert readers[0].reader_id == f"reader-{MAX_READERS + 19}"
    assert {r.reader_id for r in readers} == {f"reader-{i}" for i in range(20, MAX_READERS + 20)}


def test_the_relays_own_clock_is_internally_consistent():
    """Exercise the default `now` on every method, which the injected-time tests never do.

    Each method reaching for its own clock is exactly where a naive/aware mismatch hides: the
    stored last_seen and the pruning cutoff are compared, so one clock disagreeing with the
    others makes GET /tag/reader raise rather than return.
    """
    relay = ScanRelay()
    relay.register("desk", "Desk reader")
    assert relay.should_broadcast("04A2", "desk", None) is True
    assert relay.should_broadcast("04A2", "desk", None) is False

    listed = relay.readers()
    assert [r.reader_id for r in listed] == ["desk"]


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("192.168.1.50", "ip-192-168-1-50"),
        ("10.0.0.1", "ip-10-0-0-1"),
        ("fe80::1", "ip-fe80-1"),
        ("testclient", "ip-testclient"),
        (None, "unknown"),
        ("", "unknown"),
        ("...", "unknown"),
    ],
)
def test_reader_id_is_derived_from_the_client_address(host: str | None, expected: str):
    """An unmodified agent that sends no reader_id still gets a stable id to pair against."""
    assert derive_reader_id(host) == expected


def test_derived_reader_id_fits_the_pattern():
    """Whatever comes out must be usable as a websocket path segment."""
    assert re.match(READER_ID_PATTERN, derive_reader_id("a" * 200))
