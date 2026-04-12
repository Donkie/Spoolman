"""NFC reader hardware abstraction service.

Provides a singleton NfcService wrapping the nfcpy library for
PN532/RC522 USB/UART and ACR122U NFC readers on Raspberry Pi and similar.

Supports:
- NTAG213 (TigerTag) — NFC Forum Type 2 Tag
- MIFARE Classic 1K (Qidi) — ISO 14443-A with Crypto-1 auth
"""

import logging
import threading
import time
from dataclasses import dataclass
from typing import Optional

from spoolman.env import get_nfc_device_path, get_nfc_reader_type

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
            try:
                self._clf.close()
            except Exception:
                pass
            self._clf = None
            self._initialized = False

        try:
            import nfc  # noqa: PLC0415

            path = device_path or "usb"
            self._clf = nfc.ContactlessFrontend(path)
            self._initialized = True
            self._status = "connected"
            logger.info("NFC reader initialized successfully on %s", path)
            return True
        except ImportError:
            logger.warning(
                "nfcpy is not installed. Install it with: pip install nfcpy. "
                "NFC features will be unavailable.",
            )
            self._status = "nfcpy_not_installed"
            return False
        except Exception:
            logger.exception("Failed to initialize NFC reader")
            self._initialized = False
            self._status = "error"
            return False

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

    def read_tag(self, timeout: float = 10.0) -> Optional[bytes]:
        """Read raw bytes from an NTAG213 tag.

        Reads pages 4-39 (144 bytes of user memory).

        Args:
            timeout: Timeout in seconds for waiting for a tag.

        Returns:
            Optional[bytes]: Raw tag data (144 bytes), or None if no tag found.

        """
        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return None

        with self._lock:
            try:
                import nfc  # noqa: PLC0415
                import nfc.tag  # noqa: PLC0415

                tag = self._clf.connect(
                    rdwr={"on-connect": lambda tag: False},
                    terminate=lambda: False,
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

                return bytes(data[:144])

            except OSError:
                logger.warning("NFC reader disconnected during read, marking for reconnect")
                self._initialized = False
                self._clf = None
                self._status = "error"
                return None
            except Exception:
                logger.exception("Failed to read NFC tag")
                return None

    def read_tag_auto(self, timeout: float = 10.0) -> Optional[TagReadResult]:
        """Read any NFC tag, auto-detecting the tag type.

        Connects to the tag, determines if it is NTAG213 or MIFARE Classic
        based on the tag product/type, then reads accordingly.

        Returns:
            TagReadResult with tag_type, data, and uid, or None if no tag found.
        """
        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return None

        with self._lock:
            try:
                import nfc  # noqa: PLC0415
                import nfc.tag  # noqa: PLC0415

                tag = self._clf.connect(
                    rdwr={"on-connect": lambda tag: False},
                    terminate=lambda: False,
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
                    return TagReadResult(tag_type="ntag213", data=bytes(data[:144]), uid=uid)

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

    def _read_mifare_classic_block(self, tag, uid: bytes) -> Optional[bytes]:
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
            try:
                if hasattr(tag, "authenticate"):
                    # nfcpy tag-level MIFARE Classic authentication
                    if tag.authenticate(block_num, key):
                        block_data = tag[block_num] if hasattr(tag, "__getitem__") else tag.read(block_num)
                        if block_data is not None:
                            return bytes(block_data[:16])
                elif hasattr(tag, "transceive"):
                    # Try raw MIFARE auth + read via transceive
                    # Auth command: 0x60 (Key A), block, key[6], uid[4]
                    auth_cmd = bytes([0x60, block_num]) + key + uid[:4]
                    tag.transceive(auth_cmd)
                    # Read command: 0x30, block
                    read_cmd = bytes([0x30, block_num])
                    block_data = tag.transceive(read_cmd)
                    if block_data and len(block_data) >= 16:
                        return bytes(block_data[:16])
            except Exception:
                logger.debug("MIFARE Classic auth failed with key %s", key.hex())
                continue

        logger.warning("MIFARE Classic authentication failed with all keys for block %d", block_num)
        return None

    def write_tag(self, data: bytes, timeout: float = 10.0) -> bool:
        """Write raw bytes to an NTAG213 tag.

        Writes to pages 4-39 (144 bytes of user memory).

        Args:
            data: Raw bytes to write (should be 144 bytes).
            timeout: Timeout in seconds for waiting for a tag.

        Returns:
            bool: True if write was successful, False otherwise.

        """
        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return False

        if len(data) != 144:
            logger.warning("Expected 144 bytes, got %d", len(data))
            return False

        with self._lock:
            try:
                import nfc  # noqa: PLC0415

                tag = self._clf.connect(
                    rdwr={"on-connect": lambda tag: False},
                    terminate=lambda: False,
                )

                if tag is None:
                    return False

                if not hasattr(tag, "write"):
                    logger.warning("Connected tag does not support write operations")
                    return False

                # Write pages 4-39 (4 bytes per page, 36 pages)
                for page_num in range(36):
                    page_offset = page_num * 4
                    page_data = data[page_offset : page_offset + 4]
                    success = tag.write(page_num + 4, page_data)
                    if not success:
                        logger.warning("Failed to write page %d", page_num + 4)
                        return False

                return True

            except OSError:
                logger.warning("NFC reader disconnected during write, marking for reconnect")
                self._initialized = False
                self._clf = None
                self._status = "error"
                return False
            except Exception:
                logger.exception("Failed to write NFC tag")
                return False

    def write_mifare_classic_block(self, data: bytes, timeout: float = 10.0) -> Optional[bytes]:
        """Write 16 bytes to MIFARE Classic sector 1 block 0 (absolute block 4).

        Connects to a MIFARE Classic tag, authenticates, and writes the block.

        Args:
            data: 16 bytes to write.
            timeout: Timeout in seconds for waiting for a tag.

        Returns:
            The tag UID on success, None on failure.
        """
        if not self._ensure_connected():
            logger.warning("NFC reader not available")
            return None

        if len(data) != 16:
            logger.warning("Expected 16 bytes for MIFARE Classic block, got %d", len(data))
            return None

        with self._lock:
            try:
                import nfc  # noqa: PLC0415

                tag = self._clf.connect(
                    rdwr={"on-connect": lambda tag: False},
                    terminate=lambda: False,
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

    def _write_mifare_classic_block(self, tag, uid: bytes, data: bytes) -> Optional[bytes]:
        """Authenticate and write 16 bytes to MIFARE Classic block 4.

        Returns the tag UID on success, None on failure.
        """
        from spoolman.qidi_codec import QIDI_ABSOLUTE_BLOCK, QIDI_KEYS  # noqa: PLC0415

        block_num = QIDI_ABSOLUTE_BLOCK

        for key in QIDI_KEYS:
            try:
                if hasattr(tag, "authenticate"):
                    if tag.authenticate(block_num, key):
                        if hasattr(tag, "__setitem__"):
                            tag[block_num] = data
                        elif hasattr(tag, "write"):
                            tag.write(block_num, data)
                        else:
                            continue
                        logger.info("MIFARE Classic block %d written successfully", block_num)
                        return uid
                elif hasattr(tag, "transceive"):
                    auth_cmd = bytes([0x60, block_num]) + key + uid[:4]
                    tag.transceive(auth_cmd)
                    # MIFARE Classic write: 0xA0, block, then 16 bytes
                    write_cmd = bytes([0xA0, block_num]) + data
                    tag.transceive(write_cmd)
                    logger.info("MIFARE Classic block %d written via transceive", block_num)
                    return uid
            except Exception:
                logger.debug("MIFARE Classic write auth failed with key %s", key.hex())
                continue

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
