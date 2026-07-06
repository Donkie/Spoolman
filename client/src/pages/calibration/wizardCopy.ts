/**
 * Short, practical instructional copy for each calibration step in the wizard.
 * Tool-agnostic — does not require OrcaSlicer. Order matches the OrcaSlicer
 * wiki calibration guide exactly.
 */

import { CalibrationStepType } from "./model";

export interface WizardStepCopy {
  title: string;
  description: string;
  /** Direct link to the OrcaSlicer wiki page for this calibration step. */
  wikiUrl: string;
}

const WIKI_BASE = "https://github.com/SoftFever/OrcaSlicer/wiki";

export const WIZARD_COPY: Record<CalibrationStepType, WizardStepCopy> = {
  temperature: {
    title: "Temperature",
    description:
      "Find the optimal printing temperature for this filament. Print a temperature tower and look for the layer that gives the best balance of layer adhesion, surface quality, and minimal stringing. Hotter improves bonding; cooler reduces ooze and stringing.",
    wikiUrl: `${WIKI_BASE}/temp-calib`,
  },

  volumetric_speed: {
    title: "Volumetric Speed",
    description:
      "Determine the maximum volumetric flow rate your hotend can sustain with this filament before under-extrusion appears. Print a flow-rate ramp test or a series of single-wall cubes at increasing speeds, and note the speed just before quality degrades.",
    wikiUrl: `${WIKI_BASE}/volumetric-speed-calib`,
  },

  pressure_advance: {
    title: "Pressure Advance",
    description:
      "Tune Pressure Advance (Klipper / Bambu) or Linear Advance (Marlin) to eliminate corner bulging and improve sharp-corner quality. Print a PA test pattern and dial in the value that gives the cleanest, sharpest corners. Enable Adaptive PA if supported by your firmware.",
    wikiUrl: `${WIKI_BASE}/pressure-advance-calib`,
  },

  flow_rate: {
    title: "Flow Rate",
    description:
      "Fine-tune the extrusion multiplier so that the actual amount of plastic deposited matches the slicer's expectation. Print two calibration cubes (one at 98%, one at 100%) and measure their walls with calipers to calculate the correct flow ratio.",
    wikiUrl: `${WIKI_BASE}/flow-rate-calib`,
  },

  retraction: {
    title: "Retraction",
    description:
      "Find the minimum retraction length and speed that eliminates stringing without grinding the filament or causing clogs. Print a retraction distance tower and pick the lowest setting that produces clean travel moves.",
    wikiUrl: `${WIKI_BASE}/retraction-calib`,
  },

  tolerance: {
    title: "Tolerance",
    description:
      "Measure how accurately your printer reproduces feature sizes. Print a tolerance test model, measure the target features with calipers, and record the offset. Apply the result in your slicer's dimensional accuracy / xy compensation settings.",
    wikiUrl: `${WIKI_BASE}/tolerance-calib`,
  },

  cornering: {
    title: "Cornering",
    description:
      "Tune cornering behavior to balance print speed against ringing and artifacts at direction changes. Use Junction Deviation (Marlin 2.x / RepRapFirmware), classic Jerk (older Marlin), or Square Corner Velocity (Klipper). Print a cornering test pattern and reduce the value until ringing disappears.",
    wikiUrl: `${WIKI_BASE}/cornering-calib`,
  },

  input_shaping: {
    title: "Input Shaping",
    description:
      "Reduce ghosting and ringing by applying resonance compensation. Measure the resonance frequency of your printer (accelerometer recommended, or use a visual ringing tower). Select the shaper type and frequencies that minimise artifacts, then enter them below.",
    wikiUrl: `${WIKI_BASE}/input-shaping-calib`,
  },

  vfa: {
    title: "VFA (Vertical Fine Artifacts)",
    description:
      "Find the maximum print speed before vertical surface artifacts (VFA / ribbing) become visible. Print a speed-ramp test on a smooth-walled object and note the speed just before regular ribbing appears on the surface.",
    wikiUrl: `${WIKI_BASE}/vfa-calib`,
  },
};

/** The canonical wizard step order, matching the OrcaSlicer wiki exactly. */
export const WIZARD_STEP_ORDER: CalibrationStepType[] = [
  "temperature",
  "volumetric_speed",
  "pressure_advance",
  "flow_rate",
  "retraction",
  "tolerance",
  "cornering",
  "input_shaping",
  "vfa",
];
