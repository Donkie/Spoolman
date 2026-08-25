"""In-memory state for the tag scan relay: scan debouncing and the reader registry.

Relay state is neither database state nor HTTP state, so it lives on its own. Isolating it
means the debounce window and the registry's eviction are testable without a socket or a
session.

Everything here is per-process and deliberately not persisted. `entrypoint.sh` runs a single
uvicorn process with no `--workers`, so a module-level registry and debounce cache are correct
as deployed; a user who adds `--workers 4` gets a partitioned registry and a per-worker
debounce window. That is a documented limit, not a reason to add Redis or a table for state
whose whole lifetime is "a few seconds" or "until the next restart".
"""

import re
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# Readers poll continuously -- nfc2klipper re-reads a tag for as long as it sits on the
# reader -- so the same UID fires over and over. Suppressing repeats server-side, before the
# broadcast, means every subscriber benefits and no device has to be well-behaved for the UI
# to be. Only a scan that resolves the same way is a repeat; see should_broadcast.
DEBOUNCE_WINDOW = timedelta(seconds=3)

# How long a reader stays listed after its last scan. Long, because the list exists to fill a
# "choose a reader" dropdown: a reader tapped this morning should still be pickable this
# afternoon, and a stale entry is a much smaller annoyance than a missing one. The registry is
# in-memory, so a restart clears it regardless and this is really "seen since startup".
READER_TTL = timedelta(hours=24)

# Hard caps. Spoolman has no authentication, so anything on the LAN can post scans; these keep
# a broken or hostile agent from growing either structure without bound. Both evict oldest
# first, so a working setup never notices them.
MAX_READERS = 256
MAX_DEBOUNCE_ENTRIES = 1024

READER_ID_MAX_LENGTH = 64

# What a reader_id may contain. It is operator-chosen, travels in a websocket path, and is
# echoed back in events, so keep it to characters that are unambiguous in all three places.
READER_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,64}$"

_NON_ID_CHARS = re.compile(r"[^A-Za-z0-9]+")


def derive_reader_id(client_host: str | None) -> str:
    """Derive a stable reader id from a client's network address.

    Some setups are a dozen lines of ESPHome YAML and will never be rewritten to send a
    reader_id. Deriving one from the address is ugly and breaks on DHCP churn, but it is
    stable enough that tap-to-pair works against a completely unmodified agent, which is the
    point.
    """
    sanitized = _NON_ID_CHARS.sub("-", client_host or "").strip("-")
    if not sanitized:
        return "unknown"
    return f"ip-{sanitized}"[:READER_ID_MAX_LENGTH]


@dataclass
class Reader:
    """A reader that has reported a scan."""

    reader_id: str
    name: str | None
    last_seen: datetime


class ScanRelay:
    """Debounce cache and reader registry for the tag scan relay."""

    def __init__(
        self,
        debounce_window: timedelta = DEBOUNCE_WINDOW,
        reader_ttl: timedelta = READER_TTL,
    ) -> None:
        """Initialize an empty relay."""
        self.debounce_window = debounce_window
        self.reader_ttl = reader_ttl
        # (uid, reader_id, matched_spool_id) -> when it was last broadcast. The match is part
        # of the key because it is part of the answer: a repeat is only a repeat while the scan
        # still resolves to the same thing.
        self._last_broadcast: dict[tuple[str, str, int | None], datetime] = {}
        self._readers: dict[str, Reader] = {}
        # Scans arrive on the event loop, but the loop is not the only thing that can touch
        # this: pruning walks the dicts while a scan may be inserting into them. A plain lock
        # is enough and is never held across an await.
        self._lock = threading.Lock()

    def register(self, reader_id: str, name: str | None, now: datetime | None = None) -> None:
        """Record that a reader reported a scan just now."""
        # Aware, like the other two clocks in this class. They all end up compared against each
        # other -- register writes last_seen, readers() prunes on it -- and mixing one naive
        # clock in raises "can't compare offset-naive and offset-aware datetimes".
        now = now or datetime.now(tz=timezone.utc)
        with self._lock:
            # Popping first re-inserts at the end, so the dict stays ordered least- to
            # most-recently-seen and eviction can drop from the front.
            existing = self._readers.pop(reader_id, None)
            # A reader that stops sending a name keeps the one it last gave, so a scan from a
            # trimmed-down agent doesn't blank the label in someone's dropdown.
            self._readers[reader_id] = Reader(
                reader_id=reader_id,
                name=name if name is not None else (existing.name if existing else None),
                last_seen=now,
            )
            self._prune_readers(now)
            while len(self._readers) > MAX_READERS:
                self._readers.pop(next(iter(self._readers)))

    def should_broadcast(
        self,
        uid: str,
        reader_id: str,
        matched_spool_id: int | None,
        now: datetime | None = None,
    ) -> bool:
        """Whether this scan is new enough to broadcast, recording it if so.

        Only the fan-out is debounced. The caller still answers the device on every POST: a
        de-duplicated scan must not look to the device like a failed lookup.

        `matched_spool_id` is required rather than optional so that a future call site cannot
        quietly reintroduce the bug this argument exists to fix (#1115): a tag scanned before it
        was linked, then linked and scanned again, used to be suppressed as a duplicate, leaving
        every subscriber that trusts the broadcast still showing "unknown tag".
        """
        now = now or datetime.now(tz=timezone.utc)
        key = (uid, reader_id, matched_spool_id)
        with self._lock:
            self._prune_debounce(now)
            last = self._last_broadcast.get(key)
            if last is not None and now - last < self.debounce_window:
                return False
            self._last_broadcast[key] = now
            while len(self._last_broadcast) > MAX_DEBOUNCE_ENTRIES:
                self._last_broadcast.pop(next(iter(self._last_broadcast)))
            return True

    def readers(self, now: datetime | None = None) -> list[Reader]:
        """List the readers seen within the TTL, most recently seen first.

        Eviction happens here rather than on a timer: there is no background task to start, no
        lifecycle hook to register, and nothing to shut down cleanly.
        """
        now = now or datetime.now(tz=timezone.utc)
        with self._lock:
            self._prune_readers(now)
            return sorted(self._readers.values(), key=lambda reader: reader.last_seen, reverse=True)

    def _prune_readers(self, now: datetime) -> None:
        """Drop readers past their TTL. Caller holds the lock."""
        cutoff = now - self.reader_ttl
        for reader_id in [rid for rid, reader in self._readers.items() if reader.last_seen < cutoff]:
            del self._readers[reader_id]

    def _prune_debounce(self, now: datetime) -> None:
        """Drop debounce entries older than the window. Caller holds the lock."""
        cutoff = now - self.debounce_window
        for key in [k for k, seen in self._last_broadcast.items() if seen < cutoff]:
            del self._last_broadcast[key]


scan_relay = ScanRelay()
