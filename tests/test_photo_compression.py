from __future__ import annotations

import asyncio

import pytest

from spoolman.photo_compression import (
    HARD_MAX_COMPRESSED_BYTES,
    MAX_OUTPUT_SIDE,
    MAX_PHOTO_BYTES,
    OUTPUT_CONTENT_TYPE,
    PhotoValidationError,
    _safe_filename,
    compress_photo_stream,
)


def _require_pyvips():
    try:
        import pyvips

        pyvips.version(0)
        return pyvips
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"pyvips/libvips is not available: {exc}")


async def _chunks(data: bytes, size: int = 8192):
    for pos in range(0, len(data), size):
        await asyncio.sleep(0)
        yield data[pos : pos + size]


def _make_png_bytes() -> bytes:
    pyvips = _require_pyvips()
    image = pyvips.Image.black(2400, 1600).new_from_image([130, 90, 50])
    return bytes(image.write_to_buffer(".png"))


def test_safe_filename_normalizes_to_jpeg() -> None:
    assert _safe_filename("../source.png") == "source.jpg"
    assert _safe_filename("%00") == "photo.jpg"


@pytest.mark.asyncio
async def test_compress_photo_stream_writes_backpressured_jpeg_chunks() -> None:
    source = _make_png_bytes()
    stream = compress_photo_stream(
        _chunks(source),
        filename="source.png",
        original_content_type="image/png",
    )

    compressed = bytearray()
    async for chunk in stream.chunks():
        compressed.extend(chunk)
    metadata = await stream.finish()

    assert compressed.startswith(b"\xff\xd8")
    assert metadata.content_type == OUTPUT_CONTENT_TYPE
    assert metadata.size_bytes == len(compressed)
    assert metadata.size_bytes <= HARD_MAX_COMPRESSED_BYTES
    assert metadata.original_size_bytes == len(source)
    assert len(metadata.sha256) == 64
    assert metadata.width <= MAX_OUTPUT_SIDE
    assert metadata.height <= MAX_OUTPUT_SIDE


@pytest.mark.asyncio
async def test_compress_photo_stream_rejects_too_large_upload_before_buffering() -> None:
    _require_pyvips()

    async def big_chunks():
        yield b"x" * (MAX_PHOTO_BYTES + 1)

    stream = compress_photo_stream(
        big_chunks(),
        filename="huge.jpg",
        original_content_type="image/jpeg",
    )

    with pytest.raises(PhotoValidationError, match="50 MB"):
        async for _chunk in stream.chunks():
            pass
        await stream.finish()


@pytest.mark.asyncio
async def test_compress_photo_stream_rejects_non_image() -> None:
    _require_pyvips()
    stream = compress_photo_stream(
        _chunks(b"not an image"),
        filename="not-image.bin",
        original_content_type="application/octet-stream",
    )

    with pytest.raises(PhotoValidationError, match="valid streaming photo"):
        async for _chunk in stream.chunks():
            pass
        await stream.finish()
