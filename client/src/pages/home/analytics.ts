import dayjs from "dayjs";
import { ISpool } from "../spools/model";

// Pure, framework-free dashboard analytics extracted from home/index.tsx so the
// KPI/inventory math can be unit-tested against hand-computed oracles and
// invariants rather than through a rendered component. See TESTING_STRATEGY.md.

// A spool with no weight information at all falls back to this nominal total so
// the low-stock ratio stays finite.
export const DEFAULT_TOTAL_WEIGHT = 1000;
// A spool is "low stock" once its remaining fraction drops below this.
export const LOW_STOCK_THRESHOLD = 0.15;

export interface MaterialStat {
  count: number;
  weight: number;
}

/** Effective stock weight of one spool, using the remaining→initial→filament fallback. */
export function spoolStockWeight(spool: ISpool): number {
  return spool.remaining_weight ?? spool.initial_weight ?? spool.filament.weight ?? 0;
}

/** Total remaining filament weight across all spools (headline KPI). */
export function totalRemainingWeight(spools: ISpool[]): number {
  return spools.reduce((sum, s) => sum + spoolStockWeight(s), 0);
}

/** Total monetary value across all spools; spools without a price contribute nothing. */
export function totalValue(spools: ISpool[]): number {
  return spools.reduce((sum, s) => sum + (s.price ?? 0), 0);
}

/** Remaining stock fraction of one spool; a missing remaining weight counts as a full spool. */
function remainingFraction(s: ISpool): number {
  const total = s.initial_weight ?? s.filament.weight ?? DEFAULT_TOTAL_WEIGHT;
  return (s.remaining_weight ?? total) / total;
}

/** Spools below the low-stock threshold, ordered most-depleted first. */
export function lowStockSpools(spools: ISpool[]): ISpool[] {
  return spools
    .filter((s) => remainingFraction(s) < LOW_STOCK_THRESHOLD)
    .sort((a, b) => remainingFraction(a) - remainingFraction(b));
}

/** The most-recently-used spools, newest first, capped at `limit`. Does not mutate the input. */
export function recentSpools(spools: ISpool[], limit = 5): ISpool[] {
  return spools
    .filter((s) => s.last_used)
    .map((s) => [dayjs(s.last_used).valueOf(), s] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([, s]) => s);
}

/** Count + total weight grouped by material (default "Unknown"), heaviest group first. */
export function materialBreakdown(spools: ISpool[]): [string, MaterialStat][] {
  const map: Record<string, MaterialStat> = {};
  spools.forEach((s) => {
    const mat = s.filament.material ?? "Unknown";
    if (!map[mat]) map[mat] = { count: 0, weight: 0 };
    map[mat].count++;
    map[mat].weight += spoolStockWeight(s);
  });
  return Object.entries(map).sort((a, b) => b[1].weight - a[1].weight);
}

/** Spool count grouped by location (empty → `noLocationLabel`), most-populated first. */
export function locationBreakdown(spools: ISpool[], noLocationLabel: string): [string, number][] {
  const map: Record<string, number> = {};
  spools.forEach((s) => {
    const loc = s.location || noLocationLabel;
    map[loc] = (map[loc] ?? 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** Spool count grouped by vendor name (unknown → "?"), most-populated first. */
export function vendorBreakdown(spools: ISpool[]): [string, number][] {
  const map: Record<string, number> = {};
  spools.forEach((s) => {
    const name = s.filament.vendor && "name" in s.filament.vendor ? s.filament.vendor.name : "?";
    map[name] = (map[name] ?? 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/** The vendor owning the most spools, or "-" when there are no spools. */
export function topVendor(spools: ISpool[]): string {
  return vendorBreakdown(spools)[0]?.[0] ?? "-";
}

/** Number of spools registered within the last `days` days relative to `now`. */
export function registeredWithinDays(spools: ISpool[], days: number, now: dayjs.Dayjs = dayjs()): number {
  const cutoff = now.subtract(days, "day");
  return spools.filter((s) => dayjs(s.registered).isAfter(cutoff)).length;
}

/** "#rrggbb" swatch for a spool, defaulting to a mid-grey when no colour is set. */
export function getColorHex(spool: ISpool): string {
  return "#" + (spool.filament.color_hex ?? "555555").replace("#", "");
}

/** Human label for a spool: "Vendor - Name", falling back to the filament name or id. */
export function getSpoolName(spool: ISpool): string {
  if (spool.filament.vendor && "name" in spool.filament.vendor) {
    return `${spool.filament.vendor.name} - ${spool.filament.name}`;
  }
  return spool.filament.name ?? spool.filament.id.toString();
}

/** Remaining-weight percentage (0–100, clamped) for a progress bar. */
export function getWeightPct(spool: ISpool): number {
  const total = spool.initial_weight ?? spool.filament.weight ?? DEFAULT_TOTAL_WEIGHT;
  const remaining = spool.remaining_weight ?? total;
  return Math.max(0, Math.min(100, (remaining / total) * 100));
}
