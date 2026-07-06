"""Pydantic data models for calibration API endpoints."""

import json
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from spoolman.api.v1.models import SpoolmanDateTime
from spoolman.database import models


class CalibrationStepType(str, Enum):
    """Calibration step types in OrcaSlicer wiki order."""

    TEMPERATURE = "temperature"
    VOLUMETRIC_SPEED = "volumetric_speed"
    PRESSURE_ADVANCE = "pressure_advance"
    FLOW_RATE = "flow_rate"
    RETRACTION = "retraction"
    TOLERANCE = "tolerance"
    CORNERING = "cornering"
    INPUT_SHAPING = "input_shaping"
    VFA = "vfa"


class CalibrationStatus(str, Enum):
    """Status of a calibration session."""

    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    ARCHIVED = "archived"


class CalibrationStepResult(BaseModel):
    id: int = Field(description="Unique internal ID of this step result.")
    session_id: int = Field(description="ID of the parent calibration session.")
    step_type: CalibrationStepType = Field(description="Which OrcaSlicer calibration step this result covers.")
    inputs: dict[str, Any] | None = Field(
        None,
        description="Structured inputs used during this step, as a JSON object.",
    )
    outputs: dict[str, Any] | None = Field(
        None,
        description="Measured or observed outputs from this step, as a JSON object.",
    )
    selected_values: dict[str, Any] | None = Field(
        None,
        description="Recommended values selected from this step, as a JSON object.",
    )
    notes: str | None = Field(None, max_length=1024, description="Free-text notes for this step.")
    confidence: str | None = Field(
        None,
        max_length=32,
        description="Subjective confidence level, e.g. 'high', 'medium', 'low'.",
    )
    recorded_at: SpoolmanDateTime = Field(description="When this result was recorded. UTC Timezone.")

    @staticmethod
    def from_db(item: models.CalibrationStepResult) -> "CalibrationStepResult":
        """Build a response model from a database row."""
        return CalibrationStepResult(
            id=item.id,
            session_id=item.session_id,
            step_type=CalibrationStepType(item.step_type),
            inputs=json.loads(item.inputs) if item.inputs else None,
            outputs=json.loads(item.outputs) if item.outputs else None,
            selected_values=json.loads(item.selected_values) if item.selected_values else None,
            notes=item.notes,
            confidence=item.confidence,
            recorded_at=item.recorded_at,
        )


class CalibrationSession(BaseModel):
    id: int = Field(description="Unique internal ID of this calibration session.")
    registered: SpoolmanDateTime = Field(description="When the session was created. UTC Timezone.")
    filament_id: int = Field(description="ID of the filament this session belongs to.")
    status: CalibrationStatus = Field(description="Current status of the session.")
    started_at: SpoolmanDateTime | None = Field(None, description="When calibration was started. UTC Timezone.")
    completed_at: SpoolmanDateTime | None = Field(None, description="When calibration was completed. UTC Timezone.")
    printer_name: str | None = Field(None, max_length=256, description="Name of the printer used.")
    nozzle_diameter: float | None = Field(
        None,
        gt=0,
        description="Nozzle diameter in mm.",
        examples=[0.4],
    )
    notes: str | None = Field(None, max_length=1024, description="Free-text notes for this session.")
    steps: list[CalibrationStepResult] = Field(
        default_factory=list,
        description="Step results recorded in this session.",
    )

    @staticmethod
    def from_db(item: models.CalibrationSession) -> "CalibrationSession":
        """Build a response model from a database row."""
        return CalibrationSession(
            id=item.id,
            registered=item.registered,
            filament_id=item.filament_id,
            status=CalibrationStatus(item.status),
            started_at=item.started_at,
            completed_at=item.completed_at,
            printer_name=item.printer_name,
            nozzle_diameter=item.nozzle_diameter,
            notes=item.notes,
            steps=[CalibrationStepResult.from_db(step) for step in item.steps],
        )
