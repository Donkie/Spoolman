"""Calibration session and step result endpoints."""

import json
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.calibration_models import (
    CalibrationSession,
    CalibrationStatus,
    CalibrationStepResult,
    CalibrationStepType,
)
from spoolman.api.v1.models import Message
from spoolman.database import calibration
from spoolman.database.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/calibration",
    tags=["calibration"],
)

# ruff: noqa: D103


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class CalibrationSessionParameters(BaseModel):
    filament_id: int = Field(description="The ID of the filament this session belongs to.")
    status: CalibrationStatus = Field(
        default=CalibrationStatus.PLANNED,
        description="Initial status of the session.",
    )
    printer_name: str | None = Field(None, max_length=256, description="Name of the printer used.")
    nozzle_diameter: float | None = Field(
        None,
        gt=0,
        description="Nozzle diameter in mm.",
        examples=[0.4],
    )
    notes: str | None = Field(None, max_length=1024, description="Free-text notes.")
    started_at: datetime | None = Field(None, description="When calibration was started.")


class CalibrationSessionUpdateParameters(BaseModel):
    status: CalibrationStatus | None = Field(None, description="Updated status.")
    printer_name: str | None = Field(None, max_length=256, description="Name of the printer used.")
    nozzle_diameter: float | None = Field(None, gt=0, description="Nozzle diameter in mm.", examples=[0.4])
    notes: str | None = Field(None, max_length=1024, description="Free-text notes.")
    started_at: datetime | None = Field(None, description="When calibration was started.")
    completed_at: datetime | None = Field(None, description="When calibration was completed.")


class CalibrationStepResultParameters(BaseModel):
    step_type: CalibrationStepType = Field(description="The OrcaSlicer calibration step.")
    inputs: dict | None = Field(None, description="Structured inputs for this step.")
    outputs: dict | None = Field(None, description="Measured outputs from this step.")
    selected_values: dict | None = Field(None, description="Recommended values from this step.")
    notes: str | None = Field(None, max_length=1024, description="Free-text notes.")
    confidence: str | None = Field(None, max_length=32, description="Confidence level, e.g. 'high'.")
    recorded_at: datetime | None = Field(None, description="When this result was recorded.")


class CalibrationStepResultUpdateParameters(BaseModel):
    step_type: CalibrationStepType | None = Field(None, description="The OrcaSlicer calibration step.")
    inputs: dict | None = Field(None, description="Structured inputs for this step.")
    outputs: dict | None = Field(None, description="Measured outputs from this step.")
    selected_values: dict | None = Field(None, description="Recommended values from this step.")
    notes: str | None = Field(None, max_length=1024, description="Free-text notes.")
    confidence: str | None = Field(None, max_length=32, description="Confidence level.")
    recorded_at: datetime | None = Field(None, description="When this result was recorded.")


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/session",
    name="Find calibration sessions",
    description="Get a list of calibration sessions, optionally filtered by filament_id.",
    response_model_exclude_none=True,
    responses={200: {"model": list[CalibrationSession]}},
)
async def find_sessions(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: Annotated[int | None, Query(title="Filament ID", description="Filter by filament ID.")] = None,
    limit: Annotated[int | None, Query(title="Limit", description="Maximum number of items in the response.")] = None,
    offset: Annotated[int, Query(title="Offset", description="Offset in the full result set.")] = 0,
) -> JSONResponse:
    db_items, total_count = await calibration.list_sessions(
        db=db,
        filament_id=filament_id,
        limit=limit,
        offset=offset,
    )
    return JSONResponse(
        content=jsonable_encoder(
            [CalibrationSession.from_db(item) for item in db_items],
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.get(
    "/session/{session_id}",
    name="Get calibration session",
    description="Get a specific calibration session with all its step results.",
    response_model_exclude_none=True,
    responses={
        200: {"model": CalibrationSession},
        404: {"model": Message},
    },
)
async def get_session(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    session_id: int,
) -> CalibrationSession:
    db_item = await calibration.get_session(db, session_id)
    return CalibrationSession.from_db(db_item)


@router.post(
    "/session",
    name="Create calibration session",
    description="Create a new calibration session for a spool.",
    response_model_exclude_none=True,
    response_model=CalibrationSession,  # noqa: FAST001
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def create_session(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: CalibrationSessionParameters,
) -> CalibrationSession:
    db_item = await calibration.create_session(
        db=db,
        filament_id=body.filament_id,
        status=body.status.value,
        printer_name=body.printer_name,
        nozzle_diameter=body.nozzle_diameter,
        notes=body.notes,
        started_at=body.started_at,
    )
    return CalibrationSession.from_db(db_item)


@router.patch(
    "/session/{session_id}",
    name="Update calibration session",
    description="Update any attribute of a calibration session. Only supplied fields are affected.",
    response_model_exclude_none=True,
    response_model=CalibrationSession,  # noqa: FAST001
    responses={
        404: {"model": Message},
    },
)
async def update_session(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    session_id: int,
    body: CalibrationSessionUpdateParameters,
) -> CalibrationSession:
    patch_data = body.model_dump(exclude_unset=True)
    # Convert enum to its string value for storage
    if "status" in patch_data and isinstance(patch_data["status"], CalibrationStatus):
        patch_data["status"] = patch_data["status"].value
    db_item = await calibration.update_session(db, session_id, patch_data)
    return CalibrationSession.from_db(db_item)


@router.delete(
    "/session/{session_id}",
    name="Delete calibration session",
    description="Delete a calibration session and all its step results.",
    responses={404: {"model": Message}},
)
async def delete_session(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    session_id: int,
) -> Message:
    await calibration.delete_session(db, session_id)
    return Message(message="Success!")


# ---------------------------------------------------------------------------
# Step result endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/session/{session_id}/step",
    name="Add calibration step result",
    description="Add a step result to an existing calibration session.",
    response_model_exclude_none=True,
    response_model=CalibrationStepResult,  # noqa: FAST001
    responses={
        404: {"model": Message},
    },
)
async def create_step_result(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    session_id: int,
    body: CalibrationStepResultParameters,
) -> CalibrationStepResult:
    db_item = await calibration.create_step_result(
        db=db,
        session_id=session_id,
        step_type=body.step_type.value,
        inputs=json.dumps(body.inputs) if body.inputs is not None else None,
        outputs=json.dumps(body.outputs) if body.outputs is not None else None,
        selected_values=json.dumps(body.selected_values) if body.selected_values is not None else None,
        notes=body.notes,
        confidence=body.confidence,
        recorded_at=body.recorded_at,
    )
    return CalibrationStepResult.from_db(db_item)


@router.get(
    "/step/{step_id}",
    name="Get calibration step result",
    description="Get a specific calibration step result.",
    response_model_exclude_none=True,
    responses={
        200: {"model": CalibrationStepResult},
        404: {"model": Message},
    },
)
async def get_step_result(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    step_id: int,
) -> CalibrationStepResult:
    db_item = await calibration.get_step_result(db, step_id)
    return CalibrationStepResult.from_db(db_item)


@router.patch(
    "/step/{step_id}",
    name="Update calibration step result",
    description="Update any attribute of a calibration step result. Only supplied fields are affected.",
    response_model_exclude_none=True,
    response_model=CalibrationStepResult,  # noqa: FAST001
    responses={
        404: {"model": Message},
    },
)
async def update_step_result(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    step_id: int,
    body: CalibrationStepResultUpdateParameters,
) -> CalibrationStepResult:
    patch_data = body.model_dump(exclude_unset=True)
    # Convert enum to string for storage
    if "step_type" in patch_data and isinstance(patch_data["step_type"], CalibrationStepType):
        patch_data["step_type"] = patch_data["step_type"].value
    # Serialize dict fields to JSON text
    for field in ("inputs", "outputs", "selected_values"):
        if field in patch_data and patch_data[field] is not None:
            patch_data[field] = json.dumps(patch_data[field])
    db_item = await calibration.update_step_result(db, step_id, patch_data)
    return CalibrationStepResult.from_db(db_item)


@router.delete(
    "/step/{step_id}",
    name="Delete calibration step result",
    description="Delete a calibration step result.",
    responses={404: {"model": Message}},
)
async def delete_step_result(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    step_id: int,
) -> Message:
    await calibration.delete_step_result(db, step_id)
    return Message(message="Success!")
