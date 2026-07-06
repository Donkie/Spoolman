export type CalibrationStatus = "planned" | "in_progress" | "complete" | "archived";

export type CalibrationStepType =
  | "temperature"
  | "volumetric_speed"
  | "pressure_advance"
  | "flow_rate"
  | "retraction"
  | "tolerance"
  | "cornering"
  | "input_shaping"
  | "vfa";

export interface ICalibrationStepResult {
  id: number;
  session_id: number;
  step_type: CalibrationStepType;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  selected_values?: Record<string, unknown>;
  notes?: string;
  confidence?: string;
  recorded_at: string;
}

export interface ICalibrationSession {
  id: number;
  registered: string;
  filament_id: number;
  status: CalibrationStatus;
  started_at?: string;
  completed_at?: string;
  printer_name?: string;
  nozzle_diameter?: number;
  notes?: string;
  steps: ICalibrationStepResult[];
}
