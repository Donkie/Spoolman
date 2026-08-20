"""NFC reader hardware abstraction service.

Provides a singleton NfcService wrapping the nfcpy library for
PN532/RC522 USB/UART and ACR122U NFC readers on Raspberry Pi and similar.

Supports:
- NTAG213 (TigerTag) — NFC Forum Type 2 Tag
- MIFARE Classic 1K (Qidi) — ISO 14443-A with Crypto-1 auth
"""

import contextlib
import logging
import threading
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from spoolman.env import get_nfc_device_path, get_nfc_reader_type

if TYPE_CHECKING:
    import nfc.tag

logger = logging.getLogger(__name__)

# Minimum seconds between reconnection attempts
_RECONNECT_COOLDOWN = 10.0


@dataclass
class TagReadResult:
    """Result of an auto-detected tag read."""

    tag_type: str  # "ntag213", "mifare_classic", "unknown"
    data: bytes  # raw tag data
    uid: bytes  # tag hardware UID


class NfcService:
    """NFC reader service for reading/writing NTAG213 and MIFARE Classic tags."""

    def __init__(self) -> None:
        """Initialize an unconnected service; call initialize() to open the reader."""
        self._clf = None
        self._lock = threading.Lock()
        self._initialized = False
        self._status = "not_initialized"
        self._last_reconnect_attempt: float = 0

    def initialize(self) -> None:
        """Initialize the NFC reader. Call once at startup."""
        self._try_connect()

    def _try_connect(self) -> bool:
        """Attempt to open the NFC reader. Returns True on success."""
        reader_type = get_nfc_reader_type()
        device_path = get_nfc_device_path()

        if reader_type != "nfcpy":
            logger.warning("Unsupported NFC reader type: %s. Only 'nfcpy' is supported.", reader_type)
            self._status = "unsupported_reader"
            return False

        # Close any stale handle before reconnecting
        if self._clf is not None:
            with contextlib.suppress(Exception):
                self._clf.close()
            self._clf = None
            self._initialized = False

        try:
            import nfc  # noqa: PLC0415

            path = device_path or "usb"
            self._clf = nfc.ContactlessFrontend(path)
        except ImportError:
            logger.warning(
                "nfcpy is not installed. Install it with: pip install nfcpy. NFC features will be unavailable.",
            )
            self._status = "nfcpy_not_installed"
            return False
        except Exception:
            logger.exception("Failed to initialize NFC reader")
            self._initialized = False
            self._status = "error"
            return False
        else:
            self._initialized = True
            self._status = "connected"
            logger.info("NFC reader initialized successfully on %s", path)
            return True

    def _ensure_connected(self) -> bool:
        """Reconnect if the reader is in an error/disconnected state.

        Rate-limited to avoid hammering USB on every request.
        """
        if self._initialized and self._clf is not None:
            return True

        now = time.monotonic()
        if now - self._last_reconnect_attempt < _RECONNECT_COOLDOWN:
            return False

        self._last_reconnect_attempt = now
        logger.info("NFC reader not connected, attempting reconnect...")
        return self._try_connect()

    def get_status(self) -> str:
        """Get the current status of the NFC reader.

        Attempts a reconnect if currently in an error state.

        Returns:
            str: Status string ('connected', 'not_initialized', 'error', etc.)

        """
        if self._status in ("error", "not_initialized"):
            self._ensure_connected()
        return self._status

    # Early returns on each hardware/protocol failure are clearer here than
    # threading a result-or-error value through the read loop.
    def read_tag(self, timeout: float = 10.0) -> bytes | None:  # noqa: PLR0911
        """Read raw bytes from an NTAG213 tag.

        Reads pages 4-39 (144 bytes of user memory).

        Args:
            timeout: Timeout in seconds for waiting for a tag.

        Returns:
            Optional[bytes]: Raw tag data (144 bytes), or None if no tag found.

        """
        from spoolman.tigertag_codec import NTAG213_USER_BYTES  # noqa: PLC0415

        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return None

        with self._lock:
            start = time.monotonic()
            try:
                tag = self._clf.connect(
                    rdwr={"on-connect": lambda _tag: False},
                    terminate=lambda: time.monotonic() - start > timeout,
                )

                if tag is None:
                    return None

                if not hasattr(tag, "read"):
                    logger.warning("Connected tag does not support read operations")
                    return None

                # Read pages 4-39 (NTAG213 user memory)
                # NTAG213 READ command returns 16 bytes (4 pages) per call,
                # so we step by 4 to avoid overlapping reads.
                data = bytearray()
                for page in range(4, 40, 4):
                    page_data = tag.read(page)
                    if page_data is None:
                        logger.warning("Failed to read page %d", page)
                        return None
                    data.extend(page_data)

                return bytes(data[:NTAG213_USER_BYTES])

            except OSError:
                logger.warning("NFC reader disconnected during read, marking for reconnect")
                self._initialized = False
                self._clf = None
                self._status = "error"
                return None
            except Exception:
                logger.exception("Failed to read NFC tag")
                return None

    # See read_tag: one return per outcome is clearer than a shared result variable.
    def read_tag_auto(self, timeout: float = 10.0) -> TagReadResult | None:  # noqa: PLR0911
        """Read any NFC tag, auto-detecting the tag type.

        Connects to the tag, determines if it is NTAG213 or MIFARE Classic
        based on the tag product/type, then reads accordingly.

        Returns:
            TagReadResult with tag_type, data, and uid, or None if no tag found.

        """
        from spoolman.tigertag_codec import NTAG213_USER_BYTES  # noqa: PLC0415

        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return None

        with self._lock:
            start = time.monotonic()
            try:
                tag = self._clf.connect(
                    rdwr={"on-connect": lambda _tag: False},
                    terminate=lambda: time.monotonic() - start > timeout,
                )

                if tag is None:
                    return None

                uid = tag.identifier if hasattr(tag, "identifier") else b""
                product = getattr(tag, "product", "")
                tag_type_str = getattr(tag, "type", "")

                logger.info("Tag detected: product=%s type=%s uid=%s", product, tag_type_str, uid.hex())

                # Detect MIFARE Classic by product string or tag type
                if "Classic" in product or "MIFARE Classic" in str(tag):
                    data = self._read_mifare_classic_block(tag, uid)
                    if data is not None:
                        return TagReadResult(tag_type="mifare_classic", data=data, uid=uid)
                    return TagReadResult(tag_type="mifare_classic", data=b"", uid=uid)

                # Default: NTAG213 (Type 2 Tag)
                if hasattr(tag, "read"):
                    data = bytearray()
                    for page in range(4, 40, 4):
                        page_data = tag.read(page)
                        if page_data is None:
                            logger.warning("Failed to read page %d", page)
                            return TagReadResult(tag_type="unknown", data=bytes(data), uid=uid)
                        data.extend(page_data)
                    return TagReadResult(tag_type="ntag213", data=bytes(data[:NTAG213_USER_BYTES]), uid=uid)

                logger.warning("Connected tag type not recognized: %s", product)
                return TagReadResult(tag_type="unknown", data=b"", uid=uid)

            except OSError:
                logger.warning("NFC reader disconnected during read, marking for reconnect")
                self._initialized = False
                self._clf = None
                self._status = "error"
                return None
            except Exception:
                logger.exception("Failed to read NFC tag (auto-detect)")
                return None

    def _read_mifare_classic_block_with_key(
        self,
        tag: "nfc.tag.Tag",
        uid: bytes,
        block_num: int,
        key: bytes,
    ) -> bytes | None:
        """Try one MIFARE Classic key against block_num. Returns the block, or None on failure."""
        from spoolman.qidi_codec import MIFARE_BLOCK_SIZE  # noqa: PLC0415

        try:
            if hasattr(tag, "authenticate"):
                # nfcpy tag-level MIFARE Classic authentication
                if tag.authenticate(block_num, key):
                    block_data = tag[block_num] if hasattr(tag, "__getitem__") else tag.read(block_num)
                    if block_data is not None:
                        return bytes(block_data[:MIFARE_BLOCK_SIZE])
            elif hasattr(tag, "transceive"):
                # Try raw MIFARE auth + read via transceive
                # Auth command: 0x60 (Key A), block, key[6], uid[4]
                auth_cmd = bytes([0x60, block_num]) + key + uid[:4]
                tag.transceive(auth_cmd)
                # Read command: 0x30, block
                read_cmd = bytes([0x30, block_num])
                block_data = tag.transceive(read_cmd)
                if block_data and len(block_data) >= MIFARE_BLOCK_SIZE:
                    return bytes(block_data[:MIFARE_BLOCK_SIZE])
        except Exception:  # noqa: BLE001 - nfcpy's transceive()/authenticate() don't document a
            # narrow failure type across reader backends (PN532/ACR122U); one bad key must not
            # abort the loop over the rest.
            logger.debug("MIFARE Classic auth failed with key %s", key.hex())
        return None

    def _read_mifare_classic_block(self, tag: "nfc.tag.Tag", uid: bytes) -> bytes | None:
        """Read MIFARE Classic sector 1 block 0 (absolute block 4).

        Tries authentication with Qidi custom key first, then factory default.
        Uses the tag's authenticate() method if available (nfcpy with PN532/ACR122U),
        or falls back to raw command exchange.

        Returns:
            16 bytes of block data, or None on failure.

        """
        from spoolman.qidi_codec import QIDI_ABSOLUTE_BLOCK, QIDI_KEYS  # noqa: PLC0415

        block_num = QIDI_ABSOLUTE_BLOCK

        # Try each authentication key
        for key in QIDI_KEYS:
            block_data = self._read_mifare_classic_block_with_key(tag, uid, block_num, key)
            if block_data is not None:
                return block_data

        logger.warning("MIFARE Classic authentication failed with all keys for block %d", block_num)
        return None

    # See read_tag: one return per outcome is clearer than a shared result variable.
    def write_tag(self, data: bytes, timeout: float = 10.0) -> bool:  # noqa: PLR0911
        """Write raw bytes to an NTAG213 tag.

        Writes to pages 4-39 (144 bytes of user memory).

        Args:
            data: Raw bytes to write (should be 144 bytes).
            timeout: Timeout in seconds for waiting for a tag.

        Returns:
            bool: True if write was successful, False otherwise.

        """
        from spoolman.tigertag_codec import NTAG213_USER_BYTES  # noqa: PLC0415

        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return False

        if len(data) != NTAG213_USER_BYTES:
            logger.warning("Expected %d bytes, got %d", NTAG213_USER_BYTES, len(data))
            return False

        with self._lock:
            start = time.monotonic()
            try:
                tag = self._clf.connect(
                    rdwr={"on-connect": lambda _tag: False},
                    terminate=lambda: time.monotonic() - start > timeout,
                )

                if tag is None:
                    return False

                if not hasattr(tag, "write"):
                    logger.warning("Connected tag does not support write operations")
                    return False

                # Write pages 4-39 (4 bytes per page, 36 pages)
                write_failed = False
                for page_num in range(36):
                    page_offset = page_num * 4
                    page_data = data[page_offset : page_offset + 4]
                    if not tag.write(page_num + 4, page_data):
                        logger.warning("Failed to write page %d", page_num + 4)
                        write_failed = True
                        break

            except OSError:
                logger.warning("NFC reader disconnected during write, marking for reconnect")
                self._initialized = False
                self._clf = None
                self._status = "error"
                return False
            except Exception:
                logger.exception("Failed to write NFC tag")
                return False
            else:
                return not write_failed

    def write_mifare_classic_block(self, data: bytes, timeout: float = 10.0) -> bytes | None:
        """Write 16 bytes to MIFARE Classic sector 1 block 0 (absolute block 4).

        Connects to a MIFARE Classic tag, authenticates, and writes the block.

        Args:
            data: 16 bytes to write.
            timeout: Timeout in seconds for waiting for a tag.

        Returns:
            The tag UID on success, None on failure.

        """
        from spoolman.qidi_codec import MIFARE_BLOCK_SIZE  # noqa: PLC0415

        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return None

        if len(data) != MIFARE_BLOCK_SIZE:
            logger.warning("Expected %d bytes for MIFARE Classic block, got %d", MIFARE_BLOCK_SIZE, len(data))
            return None

        with self._lock:
            start = time.monotonic()
            try:
                tag = self._clf.connect(
                    rdwr={"on-connect": lambda _tag: False},
                    terminate=lambda: time.monotonic() - start > timeout,
                )

                if tag is None:
                    return None

                uid = tag.identifier if hasattr(tag, "identifier") else b""

                return self._write_mifare_classic_block(tag, uid, data)

            except OSError:
                logger.warning("NFC reader disconnected during write, marking for reconnect")
                self._initialized = False
                self._clf = None
                self._status = "error"
                return None
            except Exception:
                logger.exception("Failed to write MIFARE Classic tag")
                return None

    def _write_mifare_classic_block_with_key(
        self,
        tag: "nfc.tag.Tag",
        uid: bytes,
        block_num: int,
        key: bytes,
        data: bytes,
    ) -> bool:
        """Try one MIFARE Classic key to authenticate and write block_num. Returns success."""
        try:
            if hasattr(tag, "authenticate"):
                if tag.authenticate(block_num, key):
                    if hasattr(tag, "__setitem__"):
                        tag[block_num] = data
                    elif hasattr(tag, "write"):
                        tag.write(block_num, data)
                    else:
                        return False
                    logger.info("MIFARE Classic block %d written successfully", block_num)
                    return True
            elif hasattr(tag, "transceive"):
                auth_cmd = bytes([0x60, block_num]) + key + uid[:4]
                tag.transceive(auth_cmd)
                # MIFARE Classic write: 0xA0, block, then 16 bytes
                write_cmd = bytes([0xA0, block_num]) + data
                tag.transceive(write_cmd)
                logger.info("MIFARE Classic block %d written via transceive", block_num)
                return True
        except Exception:  # noqa: BLE001 - see _read_mifare_classic_block_with_key
            logger.debug("MIFARE Classic write auth failed with key %s", key.hex())
        return False

    def _write_mifare_classic_block(self, tag: "nfc.tag.Tag", uid: bytes, data: bytes) -> bytes | None:
        """Authenticate and write 16 bytes to MIFARE Classic block 4.

        Returns the tag UID on success, None on failure.
        """
        from spoolman.qidi_codec import QIDI_ABSOLUTE_BLOCK, QIDI_KEYS  # noqa: PLC0415

        block_num = QIDI_ABSOLUTE_BLOCK

        for key in QIDI_KEYS:
            if self._write_mifare_classic_block_with_key(tag, uid, block_num, key, data):
                return uid

        logger.warning("MIFARE Classic write failed: authentication failed with all keys")
        return None

    def close(self) -> None:
        """Close the NFC reader connection."""
        if self._clf is not None:
            try:
                self._clf.close()
            except Exception:
                logger.exception("Error closing NFC reader")
            finally:
                self._clf = None
                self._initialized = False
                self._status = "closed"


# Singleton instance
nfc_service = NfcService()
