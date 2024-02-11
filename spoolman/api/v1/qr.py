"""QR-Code related endpoints."""

# ruff: noqa: D103

import io
import logging
from typing import Annotated

import qrcode
from fastapi import APIRouter, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="",
    tags=["qrcode"],
)


class QRRequestBody(BaseModel):
    """The request body for the QR code endpoint."""

    data: Annotated[str, "The data to encode into the QR code."]
    box_size: Annotated[int, "The size of the boxes in the QR code."] = 10
    border: Annotated[int, "The size of the border around the QR code."] = 2


@router.post(
    "/qr",
    name="Create QR code",
    description="Encode the supplied data into a QR code.",
    response_model_exclude_none=True,
    response_class=Response,
    responses={
        200: {
            "content": {
                "image/png": {},
            },
        },
    },
)
async def export_qr(
    *,
    body: QRRequestBody,
) -> StreamingResponse:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=body.box_size,
        border=body.border,
    )

    qr.add_data(body.data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer)
    buffer.seek(0)

    return StreamingResponse(content=buffer, media_type="image/png")
