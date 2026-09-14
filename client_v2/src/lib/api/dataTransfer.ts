import { API_BASE } from './config';
import { HttpError } from './http';

// Moving whole lists in and out of an instance: the `/export` and `/import`
// endpoints. Both deal in files rather than JSON payloads, so they do not go
// through the wrappers in ./http.ts — an export is a download the browser does
// on its own, and an import sends the file as the request body.

export type TransferEntity = 'vendors' | 'filaments' | 'spools';
export type TransferFormat = 'csv' | 'json';
export type OnConflict = 'skip' | 'update';

export interface ImportCounts {
	created: number;
	matched: number;
	updated: number;
}

export interface ImportProblem {
	row: number;
	column: string | null;
	message: string;
}

export interface ImportResult {
	dry_run: boolean;
	rows: number;
	vendors: ImportCounts;
	filaments: ImportCounts;
	spools: ImportCounts;
	ignored_columns: string[];
	problems: ImportProblem[];
}

/** Where a download of this list lives. Used as a plain link, so the browser saves it. */
export function exportUrl(entity: TransferEntity, fmt: TransferFormat): string {
	return `${API_BASE}/export/${entity}?fmt=${fmt}`;
}

/** What the file's name tells us about its format, when the user has not said. */
export function formatFromFilename(name: string): TransferFormat | null {
	const lower = name.toLowerCase();
	if (lower.endsWith('.json')) return 'json';
	if (lower.endsWith('.csv')) return 'csv';
	return null;
}

export interface ImportOptions {
	fmt: TransferFormat;
	dryRun: boolean;
	onConflict: OnConflict;
	signal?: AbortSignal;
}

/**
 * Send a file to an import endpoint.
 *
 * A refused file comes back as 422 with the same shape as a successful one, the
 * problems filled in — that is a result to show, not an error to throw, so it is
 * returned like any other. Anything else is a genuine failure and throws.
 */
export async function importFile(
	entity: TransferEntity,
	file: Blob,
	{ fmt, dryRun, onConflict, signal }: ImportOptions
): Promise<ImportResult> {
	const params = new URLSearchParams({
		fmt,
		dry_run: String(dryRun),
		on_conflict: onConflict
	});
	const path = `/import/${entity}?${params}`;

	const res = await fetch(API_BASE + path, {
		method: 'POST',
		// The body is the file itself. No multipart, so no boundary to negotiate and
		// nothing to unwrap on the far side.
		headers: { 'Content-Type': 'application/octet-stream' },
		body: file,
		signal
	});

	if (res.status === 422) return (await res.json()) as ImportResult;

	if (!res.ok) {
		let body: Record<string, unknown> | undefined;
		try {
			body = (await res.json()) as Record<string, unknown>;
		} catch {
			/* no body, or not JSON */
		}
		const detail = typeof body?.message === 'string' ? body.message : '';
		throw new HttpError(`POST ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, res.status, body);
	}

	return (await res.json()) as ImportResult;
}
