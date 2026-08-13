"""NFC/RFID tag identity: UID normalization and the known tag formats.

Spoolman keys a tag on its hardware UID and nothing else, which is the one thing every
tag has -- a blank NTAG215 sticker, a Prusa NFC-V tag and a Bambu MIFARE tag whose
contents we can never decrypt all report one. Readers, however, report that UID in
whatever shape their library happens to use: Web NFC's ``serialNumber`` is
colon-separated lowercase, ESPHome emits ``04-a2-b3``, nfcpy hands you raw bytes that
most scripts ``.hex()`` into unseparated lowercase.

``normalize_uid`` collapses all of those to one canonical spelling so that the unique
index on ``spool_tag.uid`` actually means "one tag, one spool". Without it the same
physical tag could be linked to three spools under three spellings and no constraint
would notice.

Pure module: no database, no FastAPI. Same shape as ``colors.py`` and ``math.py``.
"""

import re

# Mirrors the SpoolTag.uid column width, so an over-long UID is a 400 and not a 500.
UID_MAX_LENGTH = 64

# Mirrors the SpoolTag.format column width.
FORMAT_MAX_LENGTH = 32

# Tag formats Spoolman knows the name of. Deliberately NOT an enum and NOT enforced:
# `format` is informational in phase 1, new tag types appear faster than migrations
# should, and rejecting an unknown one would make Spoolman the thing standing between a
# user and their hardware. These exist to document the vocabulary and to keep clients
# spelling the common ones the same way.
KNOWN_FORMATS = (
    "openprinttag",
    "opentag3d",
    "ntag",
    "bambu",
    "tigertag",
    "qidi",
    "creality",
    "prusa",
)

# Separators readers put between UID bytes, plus the whitespace that survives a
# copy-paste out of a log line.
_SEPARATORS = re.compile(r"[\s:_.-]+")

_HEX_ONLY = re.compile(r"^[0-9A-F]+$")


def normalize_uid(uid: str) -> str:
    """Normalize a tag UID to its canonical form: uppercase hex, no separators.

    Accepts any separator style and any case, plus an optional ``0x`` prefix, so a
    reader-side agent never has to care which shape its NFC library produces.

    Args:
        uid: The UID as reported by a reader, e.g. ``04:a2:b3:c4``, ``04-A2-B3-C4`` or
            ``04a2b3c4``.

    Returns:
        str: The canonical UID, e.g. ``04A2B3C4``.

    Raises:
        ValueError: If the UID is empty, is not hexadecimal, or is longer than the
            column can hold. A tag UID is a byte string by definition, so anything else
            is a caller bug worth surfacing rather than a row worth storing -- a
            junk-drawer uid column would make the uniqueness guarantee meaningless.

    """
    normalized = _SEPARATORS.sub("", uid).strip().upper().removeprefix("0X")
    if not normalized:
        raise ValueError("A tag UID must not be empty.")
    if not _HEX_ONLY.match(normalized):
        raise ValueError(f'"{uid}" is not a valid tag UID. A UID must be hexadecimal.')
    if len(normalized) > UID_MAX_LENGTH:
        raise ValueError(f"A tag UID can be at most {UID_MAX_LENGTH} hex characters.")
    return normalized


def normalize_format(tag_format: str | None) -> str | None:
    """Normalize a tag format name, or return None if none was given.

    Lowercased and trimmed so that ``NTAG`` and ``ntag`` are the same format. Unknown
    values pass through unchanged -- see KNOWN_FORMATS.

    Raises:
        ValueError: If the name is longer than the column can hold.

    """
    if tag_format is None:
        return None
    normalized = tag_format.strip().lower()
    if not normalized:
        return None
    if len(normalized) > FORMAT_MAX_LENGTH:
        raise ValueError(f"A tag format can be at most {FORMAT_MAX_LENGTH} characters.")
    return normalized
