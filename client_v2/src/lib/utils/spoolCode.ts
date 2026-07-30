// Parse the payload of a scanned Spoolman label back into an entity reference.
// Mirrors the forms produced by the QR generator (lib/labels/qr.ts):
//   scheme → WEB+SPOOLMAN:S-<id> / F-<id>                    (compact custom URI)
//   url    → <base_url>/spool/show/<id> or /filament/show/<id>  (opens in a browser)
// `S`/`spool` codes resolve to a spool, `F`/`filament` codes to a filament.
// Anything that isn't a Spoolman code returns null, so unrelated codes in view
// are simply ignored.

const SCHEME_RE = /^web\+spoolman:(?<kind>[sf])-(?<id>[0-9]+)$/i;
const URL_RE = /^https?:\/\/[^/]+(?:\/[^/]+)*\/(?<kind>spool|filament)\/show\/(?<id>[0-9]+)\/?$/i;

/** A scanned Spoolman code resolved to the entity it points at. */
export interface ScannedRef {
	kind: 'spool' | 'filament';
	id: number;
}

/** Normalise the `kind` capture (`s`/`f` or `spool`/`filament`) to an entity kind. */
function normaliseKind(raw: string): ScannedRef['kind'] {
	return raw.toLowerCase().startsWith('f') ? 'filament' : 'spool';
}

/** Extract the entity reference from a scanned code, or null if it isn't a Spoolman code. */
export function parseSpoolCode(raw: string): ScannedRef | null {
	const text = raw.trim();
	const match = SCHEME_RE.exec(text) ?? URL_RE.exec(text);
	if (!match?.groups) return null;
	const id = Number(match.groups.id);
	if (!Number.isSafeInteger(id)) return null;
	return { kind: normaliseKind(match.groups.kind), id };
}
