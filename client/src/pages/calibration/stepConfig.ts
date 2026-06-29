/**
 * Per-step-type field definitions for the calibration step result form.
 * Drives form rendering and the recommended settings summary display.
 *
 * Order matches the OrcaSlicer wiki calibration guide exactly:
 * Temperature → Volumetric Speed → Pressure Advance → Flow Rate →
 * Retraction → Tolerance → Cornering → Input Shaping → VFA
 *
 * Auto-compute formula approach inspired by the Orca-Slicer-Assistant project:
 * https://github.com/ItsDeidara/Orca-Slicer-Assistant
 * Authors: ItsDeidara, SoCuul, Ulfzerk, nyghtly-derek
 */

import { CalibrationStepType } from "./model";

export interface StepField {
  key: string;
  label: string;
  unit?: string;
  type: "number" | "select" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  options?: { label: string; value: string }[];
  section: "inputs" | "outputs";
  /** Override the default Ant Design Col span (1–24) for this field */
  colSpan?: number;
}

export interface StepConfig {
  inputFields: StepField[];
  outputFields: StepField[];
  /** Key(s) from outputFields whose values go into selected_values */
  recommendedKeys: string[];
  /**
   * Auto-compute output (result) values from current input values.
   * Called reactively in the wizard whenever inputs change.
   * Returns a partial record of output keys → computed values.
   */
  autoCompute?: (inputs: Record<string, number | null>) => Partial<Record<string, number>>;
}

export const STEP_CONFIGS: Record<CalibrationStepType, StepConfig> = {
  temperature: {
    inputFields: [
      {
        key: "start_temp",
        label: "Start Temp",
        unit: "°C",
        type: "number",
        min: 100,
        max: 400,
        precision: 0,
        section: "inputs",
      },
      {
        key: "end_temp",
        label: "End Temp",
        unit: "°C",
        type: "number",
        min: 100,
        max: 400,
        precision: 0,
        section: "inputs",
      },
      {
        key: "step_size",
        label: "Step Size",
        unit: "°C",
        type: "number",
        min: 1,
        max: 20,
        precision: 0,
        section: "inputs",
      },
    ],
    outputFields: [
      {
        key: "temperature",
        label: "Optimal Temp",
        unit: "°C",
        type: "number",
        min: 100,
        max: 400,
        precision: 0,
        section: "outputs",
      },
    ],
    recommendedKeys: ["temperature"],
  },

  volumetric_speed: {
    inputFields: [
      {
        key: "start_speed",
        label: "Start Speed",
        unit: "mm³/s",
        type: "number",
        min: 0,
        precision: 1,
        section: "inputs",
      },
      { key: "step_size", label: "Step Size", unit: "mm³/s", type: "number", min: 0, precision: 1, section: "inputs" },
      {
        key: "measured_height",
        label: "Measured Height",
        unit: "mm",
        type: "number",
        min: 0,
        precision: 1,
        section: "inputs",
      },
    ],
    outputFields: [
      {
        key: "max_volumetric_speed",
        label: "Max Volumetric Speed",
        unit: "mm³/s",
        type: "number",
        min: 0,
        precision: 2,
        section: "outputs",
      },
    ],
    recommendedKeys: ["max_volumetric_speed"],
    // max_speed = start + measured_height × step_size  (OrcaSlicer wiki)
    autoCompute: (inputs) => {
      const start = inputs.start_speed;
      const step = inputs.step_size;
      const h = inputs.measured_height;
      if (start !== null && step !== null && h !== null && !isNaN(start) && !isNaN(step) && !isNaN(h)) {
        return { max_volumetric_speed: parseFloat((start + h * step).toFixed(2)) };
      }
      return {};
    },
  },

  pressure_advance: {
    inputFields: [
      {
        key: "extruder_type",
        label: "Extruder Type",
        type: "select",
        options: [
          { label: "Direct Drive", value: "direct_drive" },
          { label: "Bowden", value: "bowden" },
        ],
        section: "inputs",
      },
      { key: "pa_step_a", label: "PA Step (A)", type: "number", min: 0, step: 0.001, precision: 4, section: "inputs" },
      {
        key: "measured_height_b",
        label: "Measured Height (B)",
        unit: "mm",
        type: "number",
        min: 0,
        precision: 1,
        section: "inputs",
      },
    ],
    outputFields: [
      {
        key: "pressure_advance",
        label: "PA Value",
        type: "number",
        min: 0,
        max: 2,
        step: 0.001,
        precision: 4,
        section: "outputs",
      },
    ],
    recommendedKeys: ["pressure_advance"],
    // PA = A × B  (OrcaSlicer wiki)
    autoCompute: (inputs) => {
      const a = inputs.pa_step_a;
      const b = inputs.measured_height_b;
      if (a !== null && b !== null && !isNaN(a) && !isNaN(b)) {
        return { pressure_advance: parseFloat((a * b).toFixed(4)) };
      }
      return {};
    },
  },

  flow_rate: {
    inputFields: [],
    outputFields: [
      {
        key: "flow_ratio",
        label: "Flow Ratio",
        type: "number",
        min: 0.5,
        max: 1.5,
        step: 0.00001,
        precision: 5,
        section: "outputs",
      },
    ],
    recommendedKeys: ["flow_ratio"],
  },

  retraction: {
    inputFields: [
      {
        key: "start_retract",
        label: "Start Retraction",
        unit: "mm",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        precision: 2,
        section: "inputs",
      },
      {
        key: "measured_height",
        label: "Measured Height",
        unit: "mm",
        type: "number",
        min: 0,
        precision: 1,
        section: "inputs",
      },
      { key: "factor", label: "Factor", type: "number", min: 0, step: 0.01, precision: 3, section: "inputs" },
    ],
    outputFields: [
      {
        key: "retraction_length",
        label: "Recommended Retraction",
        unit: "mm",
        type: "number",
        min: 0,
        max: 10,
        step: 0.00001,
        precision: 5,
        section: "outputs",
      },
    ],
    recommendedKeys: ["retraction_length"],
    // retraction = start + measured_height × factor  (OrcaSlicer wiki)
    autoCompute: (inputs) => {
      const start = inputs.start_retract;
      const h = inputs.measured_height;
      const factor = inputs.factor;
      if (start !== null && h !== null && factor !== null && !isNaN(start) && !isNaN(h) && !isNaN(factor)) {
        return { retraction_length: parseFloat((start + h * factor).toFixed(5)) };
      }
      return {};
    },
  },

  tolerance: {
    inputFields: [
      {
        key: "test_size",
        label: "Test Feature Size",
        unit: "mm",
        type: "number",
        min: 0,
        precision: 2,
        section: "inputs",
      },
      {
        key: "measured_size",
        label: "Measured Size",
        unit: "mm",
        type: "number",
        min: 0,
        precision: 3,
        section: "inputs",
      },
    ],
    outputFields: [
      {
        key: "tolerance_offset",
        label: "Tolerance Offset",
        unit: "mm",
        type: "number",
        step: 0.01,
        precision: 3,
        section: "outputs",
      },
    ],
    recommendedKeys: ["tolerance_offset"],
    autoCompute: (inputs) => {
      const t = inputs.test_size;
      const m = inputs.measured_size;
      if (t !== null && m !== null && !isNaN(t) && !isNaN(m)) {
        return { tolerance_offset: parseFloat((t - m).toFixed(3)) };
      }
      return {};
    },
  },

  cornering: {
    inputFields: [
      {
        key: "firmware_type",
        label: "Firmware / Feature",
        type: "select",
        options: [
          { label: "Junction Deviation (Marlin 2.x / RepRapFirmware)", value: "junction_deviation" },
          { label: "Jerk (Classic Marlin)", value: "jerk" },
          { label: "Square Corner Velocity (Klipper)", value: "square_corner_velocity" },
        ],
        section: "inputs",
      },
      { key: "start_value", label: "Start Value", type: "number", min: 0, step: 0.01, precision: 3, section: "inputs" },
      { key: "end_value", label: "End Value", type: "number", min: 0, step: 0.01, precision: 3, section: "inputs" },
    ],
    outputFields: [
      {
        key: "cornering_value",
        label: "Recommended Value",
        type: "number",
        min: 0,
        step: 0.01,
        precision: 3,
        section: "outputs",
      },
    ],
    recommendedKeys: ["cornering_value"],
  },

  input_shaping: {
    inputFields: [
      {
        key: "shaper_type",
        label: "Shaper Type",
        type: "select",
        options: [
          { label: "MZV", value: "mzv" },
          { label: "EI", value: "ei" },
          { label: "ZV", value: "zv" },
          { label: "2HUMP_EI", value: "2hump_ei" },
          { label: "3HUMP_EI", value: "3hump_ei" },
        ],
        section: "inputs",
      },
      {
        key: "frequency_x",
        label: "Resonance Freq X",
        unit: "Hz",
        type: "number",
        min: 0,
        precision: 1,
        section: "inputs",
      },
      {
        key: "frequency_y",
        label: "Resonance Freq Y",
        unit: "Hz",
        type: "number",
        min: 0,
        precision: 1,
        section: "inputs",
      },
    ],
    outputFields: [
      {
        key: "shaper_type_x",
        label: "X Recommended Shaper",
        type: "select",
        options: [
          { label: "MZV", value: "mzv" },
          { label: "EI", value: "ei" },
          { label: "ZV", value: "zv" },
          { label: "2HUMP_EI", value: "2hump_ei" },
          { label: "3HUMP_EI", value: "3hump_ei" },
        ],
        section: "outputs",
        colSpan: 12,
      },
      {
        key: "frequency_x",
        label: "Tuned Freq X",
        unit: "Hz",
        type: "number",
        min: 0,
        precision: 1,
        section: "outputs",
        colSpan: 12,
      },
      {
        key: "shaper_type_y",
        label: "Y Recommended Shaper",
        type: "select",
        options: [
          { label: "MZV", value: "mzv" },
          { label: "EI", value: "ei" },
          { label: "ZV", value: "zv" },
          { label: "2HUMP_EI", value: "2hump_ei" },
          { label: "3HUMP_EI", value: "3hump_ei" },
        ],
        section: "outputs",
        colSpan: 12,
      },
      {
        key: "frequency_y",
        label: "Tuned Freq Y",
        unit: "Hz",
        type: "number",
        min: 0,
        precision: 1,
        section: "outputs",
        colSpan: 12,
      },
    ],
    recommendedKeys: ["shaper_type_x", "frequency_x", "shaper_type_y", "frequency_y"],
  },

  vfa: {
    inputFields: [
      {
        key: "start_speed",
        label: "Start Speed",
        unit: "mm/s",
        type: "number",
        min: 0,
        precision: 0,
        section: "inputs",
        colSpan: 8,
      },
      {
        key: "end_speed",
        label: "End Speed",
        unit: "mm/s",
        type: "number",
        min: 0,
        precision: 0,
        section: "inputs",
        colSpan: 8,
      },
      {
        key: "step_size",
        label: "Step Size",
        unit: "mm/s",
        type: "number",
        min: 0,
        precision: 0,
        section: "inputs",
        colSpan: 8,
      },
    ],
    outputFields: [
      {
        key: "min_avoidance_speed",
        label: "Min Avoidance Speed",
        unit: "mm/s",
        type: "number",
        min: 0,
        precision: 0,
        section: "outputs",
        colSpan: 12,
      },
      {
        key: "max_avoidance_speed",
        label: "Max Avoidance Speed",
        unit: "mm/s",
        type: "number",
        min: 0,
        precision: 0,
        section: "outputs",
        colSpan: 12,
      },
    ],
    recommendedKeys: ["min_avoidance_speed", "max_avoidance_speed"],
  },
};

/** Display label for a recommended value, including its unit. */
export function formatRecommendedValue(stepType: CalibrationStepType, key: string, value: unknown): string {
  const allFields = [...STEP_CONFIGS[stepType].inputFields, ...STEP_CONFIGS[stepType].outputFields];
  const field = allFields.find((f) => f.key === key);
  if (!field) return String(value);
  const unit = field.unit ? ` ${field.unit}` : "";
  return `${value}${unit}`;
}
