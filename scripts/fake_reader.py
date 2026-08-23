#!/usr/bin/env python3
"""Pretend to be an NFC/RFID reader, so the tag features can be driven without hardware.

Spoolman never talks to reader hardware. A reader — an ESP32 at the printer, a phone, a
Node-RED flow — reports a tag it has read by making one HTTP POST, and the server fans
that out to whichever browsers are listening. That contract being ordinary HTTP is what
makes this script possible: it is a complete, conforming reader in about a hundred lines,
and everything a real one can do it can do too.

Stdlib only; talks to a running instance over the public API:

    python scripts/fake_reader.py                       # interactive, keeps tapping
    python scripts/fake_reader.py 04:a2:b3:c4           # one tap, then exit
    python scripts/fake_reader.py --new                 # invent a blank tag and tap it

Also available as `uv run poe fake-reader <args>`.

Point a browser at the same instance, turn on "Open the spool a scanned tag belongs to"
in Settings, and taps here will move it. Pairing works too: click "Pair by tapping" and
then tap anything — this reader's `--reader-id` is what the browser latches onto.

Unlike the seed scripts this one writes nothing and deletes nothing. A scan is an event,
not a record: it is broadcast to listeners and remembered only as "this reader was seen
recently". Safe to point anywhere you would be willing to click around in the UI.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_URL = "http://localhost:7912"

# The server constrains reader ids to this because they travel in a websocket path
# (`/api/v1/tag/scan/{reader_id}`), so a bad one is a 422 rather than a mystery.
READER_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


class ApiError(RuntimeError):
    """A non-2xx response from the Spoolman API."""

    def __init__(self, method: str, path: str, status: int, body: str) -> None:
        super().__init__(f"{method} {path} -> {status}: {body}")
        self.status = status
        self.body = body


class Api:
    """Minimal Spoolman API v1 client."""

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self.base = base_url.rstrip("/") + "/api/v1"
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Any = None, params: dict | None = None) -> Any:
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)  # noqa: S310
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                raw = resp.read()
        except urllib.error.HTTPError as e:
            raise ApiError(method, path, e.code, e.read().decode(errors="replace")[:500]) from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"Could not reach {url}: {e.reason}") from None
        if not raw:
            return None
        return json.loads(raw)

    def get(self, path: str, params: dict | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, body: Any) -> Any:
        return self._request("POST", path, body=body)


def new_uid() -> str:
    """Invent a UID shaped like a blank NTAG sticker's: 7 bytes, NXP's 0x04 first."""
    return "04" + "".join(f"{random.randrange(256):02X}" for _ in range(6))


def describe(spool: dict) -> str:
    """Name a spool the way the UI would, so a tap is recognisable at a glance."""
    filament = spool.get("filament") or {}
    vendor = (filament.get("vendor") or {}).get("name")
    parts = [p for p in (vendor, filament.get("name")) if p]
    label = " ".join(parts) or filament.get("material") or "unnamed filament"
    remaining = spool.get("remaining_weight")
    weight = f", {remaining:.0f} g left" if isinstance(remaining, (int, float)) else ""
    return f"spool #{spool['id']} — {label}{weight}"


def tap(api: Api, uid: str, reader_id: str, name: str | None, tag_format: str | None) -> None:
    """Report one tag read, and say what the server made of it."""
    body: dict[str, Any] = {"uid": uid, "reader_id": reader_id}
    if name:
        body["name"] = name
    if tag_format:
        body["format"] = tag_format

    try:
        scan = api.post("/tag/scan", body)
    except ApiError as e:
        # A UID that isn't hexadecimal is a 400 and an empty one a 422; both are the
        # user's typing rather than anything wrong with the reader, so keep going.
        # Only the 400 carries a `message` worth showing — 422 is FastAPI's own
        # validation blob, which says the same thing at ten times the length.
        message = ""
        with contextlib.suppress(ValueError, AttributeError):
            message = json.loads(e.body).get("message") or ""
        if not message:
            message = "the UID is empty" if e.status == 422 else e.body
        print(f"  rejected ({e.status}): {message}")
        return

    # `matched_spool_id` is always present in the HTTP response, null when unknown —
    # that is the published device contract, and it is what a real reader keys off.
    if scan.get("matched_spool_id") is None:
        print(f"  {uid} — unknown tag, no spool has it")
    else:
        print(f"  {uid} — {describe(scan['spool'])}")


def show_tagged(api: Api) -> None:
    """List the tags already linked, so there is something known to tap."""
    spools = api.get("/spool", {"allow_archived": "true"})
    rows = [(t["uid"], s) for s in spools for t in s.get("tags", [])]
    if not rows:
        print("  nothing is tagged yet — link one in a spool's inspector, or press 'n' for a blank tag")
        return
    for uid, spool in rows:
        print(f"  {uid}  {describe(spool)}")


def interactive(api: Api, reader_id: str, name: str | None, tag_format: str | None) -> int:
    print(f"Reader '{reader_id}' ready. Enter a UID to tap it.")
    print("  <enter> re-taps the last one (the server de-duplicates repeats, as it does for a real")
    print("          reader that keeps re-reading a tag left sitting on it)")
    print("  n       invent a blank tag and tap it")
    print("  l       list the tags already linked")
    print("  q       quit")
    last: str | None = None
    while True:
        try:
            line = input("tap> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0

        if line in {"q", "quit", "exit"}:
            return 0
        if line in {"l", "list"}:
            show_tagged(api)
            continue
        if line in {"n", "new"}:
            last = new_uid()
        elif line:
            last = line
        elif last is None:
            print("  nothing tapped yet — enter a UID, or 'n' for a blank tag")
            continue

        tap(api, last, reader_id, name, tag_format)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("uid", nargs="*", help="UID(s) to tap, in any spelling. Omit for an interactive reader.")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Spoolman base URL (default: {DEFAULT_URL})")
    parser.add_argument("--reader-id", default="desk", help="What to call this reader (default: desk)")
    parser.add_argument("--name", help="Friendly name, shown in the UI in place of the reader id")
    parser.add_argument("--format", dest="tag_format", help="Tag type, e.g. ntag. Informational.")
    parser.add_argument("--new", action="store_true", help="Invent a blank tag's UID and tap it")
    args = parser.parse_args()

    if not READER_ID_RE.match(args.reader_id):
        print(
            f"--reader-id {args.reader_id!r} is not usable: it travels in a websocket path, so it may only "
            "contain letters, digits, dot, underscore, colon or dash (max 64).",
            file=sys.stderr,
        )
        return 2

    api = Api(args.url)
    try:
        info = api.get("/info")
    except (ApiError, RuntimeError) as e:
        print(f"{e}\n\nIs Spoolman running? Point elsewhere with --url.", file=sys.stderr)
        return 1
    print(f"Spoolman {info.get('version', '?')} at {args.url}")

    uids = list(args.uid)
    if args.new:
        uids.append(new_uid())
    if not uids:
        return interactive(api, args.reader_id, args.name, args.tag_format)

    for uid in uids:
        tap(api, uid, args.reader_id, args.name, args.tag_format)
    return 0


if __name__ == "__main__":
    sys.exit(main())
