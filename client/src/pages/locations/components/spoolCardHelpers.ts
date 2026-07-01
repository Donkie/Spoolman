import { ISpool } from "../../spools/model";

// Pure weight helpers extracted from SpoolCard so the threshold/clamp logic can be
// unit-tested directly (TESTING_CANDIDATES row 69). NOTE: getWeightPercentage is
// intentionally the same computation as home/analytics.ts getWeightPct — the audit
// flagged the duplication as a drift risk; the shared test here pins the behaviour.

const DEFAULT_TOTAL_WEIGHT = 1000;

/** Remaining-weight percentage (0–100, clamped) for a spool's progress bar. */
export function getWeightPercentage(spool: ISpool): number {
  const total = spool.initial_weight ?? spool.filament.weight ?? DEFAULT_TOTAL_WEIGHT;
  const remaining = spool.remaining_weight ?? total;
  return Math.max(0, Math.min(100, (remaining / total) * 100));
}

/** Bar colour by remaining percentage: red ≤10%, amber ≤25%, green above. */
export function getWeightColor(percentage: number): string {
  if (percentage <= 10) return "#ff4d4f";
  if (percentage <= 25) return "#faad14";
  return "#52c41a";
}
