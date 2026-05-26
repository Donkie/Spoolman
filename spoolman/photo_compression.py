"""Streaming photo compression."""

from __future__ import annotations

import asyncio
import hashlib
import os
import queue
import threading
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Final
from urllib.parse import unquote

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

DEFAULT_MAX_PHOTO_BYTES: Final[int] = 50 * 1024 * 1024
MAX_PHOTO_BYTES: Final[int] = DEFAULT_MAX_PHOTO_BYTES
MAX_IMAGE_PIXELS: Final[int] = 60_000_000
READ_CHUNK_SIZE: Final[int] = 1024 * 1024
TARGET_MAX_BYTES: Final[int] = 150 * 1024
HARD_MAX_COMPRESSED_BYTES: Final[int] = 512 * 1024
MAX_OUTPUT_SIDE: Final[int] = 1280
JPEG_QUALITY: Final[int] = 74
OUTPUT_CONTENT_TYPE: Final[str] = "image/jpeg"
RGB_BANDS: Final[int] = 3
_OUTPUT_QUEUE_END: Final[object] = object()


class PhotoValidationError(ValueError):
    """Photo validation error."""


@dataclass(slots=True)
class CompressedPhotoMetadata:
    """Compressed photo metadata."""

    filename: str
    content_type: str
    original_content_type: str | None
    size_bytes: int
    original_size_bytes: int
    width: int
    height: int
    sha256: str


def _require_pyvips():  # noqa: ANN202
    try:
        import pyvips  # noqa: PLC0415
    except OSError as exc:
        raise RuntimeError("libvips is required for streaming photo compression.") from exc
    except ImportError as exc:
        raise RuntimeError("pyvips is required for streaming photo compression.") from exc
    return pyvips


def _safe_filename(filename: str | None) -> str:
    name = unquote(filename or "photo.jpg").strip().replace("\x00", "")
    name = Path(name).name
    if not name:
        return "photo.jpg"
    stem, _dot, _suffix = name.rpartition(".")
    if stem:
        name = f"{stem}.jpg"
    elif not name.lower().endswith(".jpg"):
        name = f"{name}.jpg"
    return name[:256]


def _write_all(fd: int, chunk: bytes) -> None:
    written = 0
    view = memoryview(chunk)
    while written < len(chunk):
        written += os.write(fd, view[written:])


@dataclass(slots=True)
class _PhotoState:
    filename: str
    original_content_type: str | None
    original_size_bytes: int = 0
    compressed_size_bytes: int = 0
    width: int = 0
    height: int = 0
    sha256: str = ""
    writer_error: BaseException | None = None
    compressor_error: BaseException | None = None


class StreamingCompressedPhoto:
    """Compressed photo stream."""

    def __init__(
        self,
        chunks: AsyncIterator[bytes],
        *,
        filename: str | None,
        original_content_type: str | None,
        max_photo_bytes: int = DEFAULT_MAX_PHOTO_BYTES,
        allowed_content_types: tuple[str, ...] = (),
    ) -> None:
        """Initialize the stream."""
        self._chunks = chunks
        self._state = _PhotoState(filename=_safe_filename(filename), original_content_type=original_content_type)
        self._max_photo_bytes = max_photo_bytes
        self._allowed_content_types = tuple(item.lower() for item in allowed_content_types)
        self._output_queue: queue.Queue[bytes | BaseException | object] = queue.Queue(maxsize=8)
        self._read_fd, self._write_fd = os.pipe()
        self._writer_task: asyncio.Task[None] | None = None
        self._compressor_thread = threading.Thread(
            target=self._compress_from_pipe,
            name="spoolman-photo-vips",
            daemon=True,
        )
        self._started = False
        self._finished = False

    def start(self) -> StreamingCompressedPhoto:
        """Start compression."""
        if self._started:
            return self
        self._started = True
        self._writer_task = asyncio.create_task(self._write_upload_to_pipe())
        self._compressor_thread.start()
        return self

    async def aclose(self) -> None:
        """Close the stream."""
        for fd in (self._read_fd, self._write_fd):
            with suppress(OSError):
                os.close(fd)
        if self._writer_task is not None and not self._writer_task.done():
            self._writer_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._writer_task
        if self._compressor_thread.is_alive():
            await asyncio.to_thread(self._compressor_thread.join, 2)

    async def _write_upload_to_pipe(self) -> None:
        hasher = hashlib.sha256()
        total = 0
        try:
            async for chunk in self._chunks:
                if not chunk:
                    continue
                total += len(chunk)
                if total > self._max_photo_bytes:
                    max_mb = self._max_photo_bytes // (1024 * 1024)
                    raise PhotoValidationError(f"Photo is larger than {max_mb} MB.")  # noqa: TRY301
                hasher.update(chunk)
                await asyncio.to_thread(_write_all, self._write_fd, chunk)
            if total == 0:
                raise PhotoValidationError("Photo file is empty.")  # noqa: TRY301
            if self._allowed_content_types and self._state.original_content_type:
                content_type = self._state.original_content_type.split(";", 1)[0].strip().lower()
                if content_type and content_type not in self._allowed_content_types:
                    raise PhotoValidationError(f"Unsupported photo content type: {content_type}.")  # noqa: TRY301
            self._state.original_size_bytes = total
            self._state.sha256 = hasher.hexdigest()
        except BrokenPipeError:
            if self._state.compressor_error is None:
                self._state.writer_error = PhotoValidationError("Photo stream was rejected while reading.")
        except BaseException as exc:  # noqa: BLE001
            self._state.writer_error = exc
        finally:
            with suppress(OSError):
                os.close(self._write_fd)

    def _read_from_pipe(self, size: int) -> bytes | None:
        try:
            chunk = os.read(self._read_fd, size)
        except OSError:
            return None
        return chunk or None

    def _queue_output_chunk(self, chunk: object) -> None:
        self._output_queue.put(chunk)

    def _write_output_chunk(self, buf: object) -> int:
        chunk = bytes(buf)
        if not chunk:
            return 0
        self._state.compressed_size_bytes += len(chunk)
        if self._state.compressed_size_bytes > HARD_MAX_COMPRESSED_BYTES:
            self._state.compressor_error = PhotoValidationError(
                "Compressed photo is still too large after streaming compression.",
            )
            return -1
        self._queue_output_chunk(chunk)
        return len(chunk)

    def _prepare_image(self, image):  # noqa: ANN001, ANN202
        image = image.autorot()
        pixels = image.width * image.height
        if pixels > MAX_IMAGE_PIXELS:
            raise PhotoValidationError("Uploaded photo is too large in pixels.")

        if image.bands > RGB_BANDS:
            image = image.flatten(background=[255, 255, 255])
        if image.bands < RGB_BANDS or str(image.interpretation).lower() != "srgb":
            image = image.colourspace("srgb")

        max_side = max(image.width, image.height)
        if max_side > MAX_OUTPUT_SIDE:
            image = image.resize(MAX_OUTPUT_SIDE / max_side, kernel="lanczos3")

        self._state.width = image.width
        self._state.height = image.height
        return image

    def _compress_from_pipe(self) -> None:
        try:
            pyvips = _require_pyvips()
            source = pyvips.SourceCustom()
            source.on_read(self._read_from_pipe)

            image = pyvips.Image.new_from_source(source, "", access="sequential", fail=True)
            image = self._prepare_image(image)

            target = pyvips.TargetCustom()
            target.on_write(self._write_output_chunk)
            image.write_to_target(
                target,
                ".jpg",
                Q=JPEG_QUALITY,
                strip=True,
                interlace=True,
                optimize_coding=True,
            )
            if self._state.compressed_size_bytes == 0:
                raise PhotoValidationError("Failed to compress photo.")  # noqa: TRY301
        except PhotoValidationError as exc:
            self._state.compressor_error = exc
            self._queue_output_chunk(exc)
        except BaseException as exc:  # noqa: BLE001
            if self._state.compressor_error is not None:
                self._queue_output_chunk(self._state.compressor_error)
            else:
                message = str(exc) or exc.__class__.__name__
                wrapped = PhotoValidationError(f"Uploaded file is not a valid streaming photo: {message}")
                self._state.compressor_error = wrapped
                self._queue_output_chunk(wrapped)
        finally:
            with suppress(OSError):
                os.close(self._read_fd)
            self._queue_output_chunk(_OUTPUT_QUEUE_END)

    async def chunks(self) -> AsyncIterator[bytes]:
        """Yield compressed chunks."""
        if not self._started:
            self.start()
        while True:
            item = await asyncio.to_thread(self._output_queue.get)
            if item is _OUTPUT_QUEUE_END:
                break
            if isinstance(item, BaseException):
                if self._state.writer_error is not None:
                    raise self._state.writer_error
                raise item
            yield item

    async def finish(self) -> CompressedPhotoMetadata:
        """Return compression metadata."""
        if self._finished:
            return self._metadata()
        self._finished = True
        if self._writer_task is not None:
            await self._writer_task
        if self._compressor_thread.is_alive():
            await asyncio.to_thread(self._compressor_thread.join)
        if self._state.writer_error is not None:
            raise self._state.writer_error
        if self._state.compressor_error is not None:
            raise self._state.compressor_error
        if not self._state.sha256 or self._state.original_size_bytes <= 0:
            raise PhotoValidationError("Photo upload did not complete.")
        return self._metadata()

    def _metadata(self) -> CompressedPhotoMetadata:
        return CompressedPhotoMetadata(
            filename=self._state.filename,
            content_type=OUTPUT_CONTENT_TYPE,
            original_content_type=self._state.original_content_type,
            size_bytes=self._state.compressed_size_bytes,
            original_size_bytes=self._state.original_size_bytes,
            width=self._state.width,
            height=self._state.height,
            sha256=self._state.sha256,
        )


def compress_photo_stream(
    chunks: AsyncIterator[bytes],
    *,
    filename: str | None,
    original_content_type: str | None,
    max_photo_bytes: int = DEFAULT_MAX_PHOTO_BYTES,
    allowed_content_types: tuple[str, ...] = (),
) -> StreamingCompressedPhoto:
    """Create a streaming compression pipeline."""
    return StreamingCompressedPhoto(
        chunks,
        filename=filename,
        original_content_type=original_content_type,
        max_photo_bytes=max_photo_bytes,
        allowed_content_types=allowed_content_types,
    )
