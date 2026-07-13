// Parse the payload of a scanned Spoolman label back into a spool id. Mirrors
// the two forms produced by the QR generator (lib/labels/qr.ts) and understood
// by the old client's scanner (client/src/components/qrCodeScanner.tsx):
//   scheme → WEB+SPOOLMAN:S-<id>            (compact custom URI)
//   url    → <base_url>/spool/show/<id>     (opens in a browser)
// Anything that isn't a Spoolman code returns null, so unrelated codes in view
// are simply ignored.

const SCHEME_RE = /^web\+spoolman:s-(?<id>[0-9]+)$/i;
const URL_RE = /^https?:\/\/[^/]+(?:\/[^/]+)*\/spool\/show\/(?<id>[0-9]+)\/?$/i;

/** Extract the spool id from a scanned code, or null if it isn't a Spoolman code. */
export function parseSpoolCode(raw: string): number | null {
	const text = raw.trim();
	const match = SCHEME_RE.exec(text) ?? URL_RE.exec(text);
	if (!match?.groups) return null;
	const id = Number(match.groups.id);
	return Number.isSafeInteger(id) ? id : null;
}
