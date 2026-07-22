/**
 * Normalize hex color values to canonical #RRGGBB format (uppercase, with hash).
 * Strips existing hash if present, then adds one back.
 * @param value - Hex string with or without leading hash
 * @returns Canonical color string: #RRGGBB uppercase
 */
/**
 * Normalize hex color values to canonical format.
 * Stored color values omit the hash, but every preview path in the UI should render
 * canonical uppercase #RRGGBB string so chips and labels stay visually consistent.
 */
export function normalizeHex(value: string): string {
  return `#${value.replace("#", "").toUpperCase()}`;
}
