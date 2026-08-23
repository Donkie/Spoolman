"""Tests for tag UID normalization.

The unique index on `tag.uid` only means "one tag, one thing" because every write goes
through `normalize_uid`. These pin the shapes real readers produce, so a change that stopped
collapsing one of them would show up here rather than as two spools quietly claiming the same
physical tag.
"""

import pytest

from spoolman.tags import UID_MAX_LENGTH, normalize_format, normalize_uid


@pytest.mark.parametrize(
    "reported",
    [
        "04A2B3C4D5E6F7",  # already canonical
        "04a2b3c4d5e6f7",  # nfcpy: bytes.hex()
        "04:a2:b3:c4:d5:e6:f7",  # Web NFC serialNumber
        "04:A2:B3:C4:D5:E6:F7",
        "04-a2-b3-c4-d5-e6-f7",  # ESPHome on_tag
        "04-A2-B3-C4-D5-E6-F7",
        "04 a2 b3 c4 d5 e6 f7",  # pasted out of a log line
        "04_A2_B3_C4_D5_E6_F7",
        "04.a2.b3.c4.d5.e6.f7",
        "0x04a2b3c4d5e6f7",
        "  04a2b3c4d5e6f7  ",
    ],
)
def test_every_reader_shape_collapses_to_one_uid(reported: str):
    """Every way a reader can spell one tag resolves to the same stored UID."""
    assert normalize_uid(reported) == "04A2B3C4D5E6F7"


def test_normalization_is_idempotent():
    """Normalizing an already-normalized UID is a no-op, so layers may normalize twice."""
    once = normalize_uid("04:a2:b3:c4")
    assert normalize_uid(once) == once


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "   ",
        ":::",
        "----",
        "not-a-uid",
        "04A2B3G4",  # G is not hex
        "04A2B3C4!",
        "0x",
    ],
)
def test_rejects_uids_that_are_not_hex(bad: str):
    """A UID is a byte string by definition; anything else is a caller bug, not a row."""
    with pytest.raises(ValueError, match="UID"):
        normalize_uid(bad)


def test_rejects_uid_longer_than_the_column():
    """An over-long UID is a 400, not a database error."""
    normalize_uid("A" * UID_MAX_LENGTH)  # the limit itself is fine
    with pytest.raises(ValueError, match="at most"):
        normalize_uid("A" * (UID_MAX_LENGTH + 1))


def test_separators_do_not_count_towards_the_length_limit():
    """The limit applies to the stored UID, not to what the reader happened to send."""
    assert len(normalize_uid(":".join("AB" * (UID_MAX_LENGTH // 2)))) == UID_MAX_LENGTH


@pytest.mark.parametrize(
    ("reported", "expected"),
    [
        ("ntag", "ntag"),
        ("NTAG", "ntag"),
        ("  OpenPrintTag  ", "openprinttag"),
        ("something-nobody-has-shipped-yet", "something-nobody-has-shipped-yet"),
        (None, None),
        ("", None),
        ("   ", None),
    ],
)
def test_format_is_normalized_but_not_restricted(reported: str | None, expected: str | None):
    """Formats are lowercased for consistency, and unknown ones pass through unchanged."""
    assert normalize_format(reported) == expected


def test_rejects_format_longer_than_the_column():
    with pytest.raises(ValueError, match="at most"):
        normalize_format("f" * 33)
