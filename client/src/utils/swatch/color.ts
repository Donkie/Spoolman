// Contrast math for picking a black or white marking color on top of the
// filament color, following the WCAG relative-luminance definition.

export type MarkingColor = "black" | "white";

/** Normalize a hex color ("aabbcc", "#aabbcc" or "aabbccdd") to "#rrggbb", or null if invalid. */
export function normalizeHexColor(hex: string | undefined): string | null {
  if (!hex) return null;
  const match = hex.trim().match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return null;
  return `#${match[1].toLowerCase()}`;
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white) of a hex color, or null if invalid. */
export function relativeLuminance(hex: string | undefined): number | null {
  const normalized = normalizeHexColor(hex);
  if (normalized === null) return null;
  const r = parseInt(normalized.substring(1, 3), 16);
  const g = parseInt(normalized.substring(3, 5), 16);
  const b = parseInt(normalized.substring(5, 7), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Luminance above which black text has a higher WCAG contrast ratio against the
 * background than white text: solving (Lw+0.05)/(L+0.05) = (L+0.05)/(Lb+0.05)
 * with Lw=1, Lb=0 gives L = sqrt(0.0525) - 0.05.
 */
export const BLACK_MARKING_LUMINANCE_THRESHOLD = Math.sqrt(1.05 * 0.05) - 0.05;

/**
 * Pick the marking (text/QR) color with the best contrast against the filament
 * color(s). Multi-color filaments are judged by their average luminance; if no
 * valid color is known the filament is assumed to be light (natural/uncolored),
 * so the marking defaults to black.
 */
export function pickMarkingColor(hexes: readonly (string | undefined)[]): MarkingColor {
  const luminances = hexes
    .map((hex) => relativeLuminance(hex))
    .filter((luminance): luminance is number => luminance !== null);
  if (luminances.length === 0) return "black";
  const average = luminances.reduce((sum, luminance) => sum + luminance, 0) / luminances.length;
  return average > BLACK_MARKING_LUMINANCE_THRESHOLD ? "black" : "white";
}
