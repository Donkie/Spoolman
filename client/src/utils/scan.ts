// Spoolman QR-code payload encode/decode, extracted from the scanner modal and the
// QR print dialogs so the two halves can be round-trip tested against each other
// (TESTING_STRATEGY.md — the encoder and decoder are independent code paths, so a
// build→parse round-trip is a genuine oracle).

export type ScanResource = "spool" | "filament";

export interface ScanTarget {
  resource: ScanResource;
  id: string;
  /** The in-app route to navigate to, e.g. "/spool/show/42". */
  path: string;
}

const PREFIX: Record<ScanResource, string> = { spool: "S", filament: "F" };

/**
 * Build the QR payload for a spool/filament, matching what the print dialogs emit.
 *
 * With no baseUrl this yields the custom scheme `WEB+SPOOLMAN:S-<id>` / `...:F-<id>`.
 * With a baseUrl it yields the deep link `<baseUrl>/<resource>/show/<id>`.
 */
export function buildScanPayload(resource: ScanResource, id: number | string, baseUrl?: string): string {
  if (baseUrl) {
    return `${baseUrl}/${resource}/show/${id}`;
  }
  return `WEB+SPOOLMAN:${PREFIX[resource]}-${id}`;
}

const SPOOL_SCHEME = /^web\+spoolman:s-(?<id>[0-9]+)$/i;
const FILAMENT_SCHEME = /^web\+spoolman:f-(?<id>[0-9]+)$/i;
const SPOOL_URL = /^https?:\/\/[^/]+(?:\/[^/]+)*\/spool\/show\/(?<id>[0-9]+)$/i;
const FILAMENT_URL = /^https?:\/\/[^/]+(?:\/[^/]+)*\/filament\/show\/(?<id>[0-9]+)$/i;

/**
 * Parse a scanned QR value into a navigation target, or null if it is not a
 * recognised Spoolman code. Accepts both the custom scheme and deep-link URL
 * forms, for spools and filaments, case-insensitively. The URL form tolerates a
 * base path (any number of intermediate path segments) for sub-path deploys.
 */
export function parseScanResult(raw: string): ScanTarget | null {
  const spool = raw.match(SPOOL_SCHEME) ?? raw.match(SPOOL_URL);
  if (spool?.groups) {
    return { resource: "spool", id: spool.groups.id, path: `/spool/show/${spool.groups.id}` };
  }
  const filament = raw.match(FILAMENT_SCHEME) ?? raw.match(FILAMENT_URL);
  if (filament?.groups) {
    return { resource: "filament", id: filament.groups.id, path: `/filament/show/${filament.groups.id}` };
  }
  return null;
}
