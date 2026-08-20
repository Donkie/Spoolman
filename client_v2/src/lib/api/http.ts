import { API_BASE } from './config';
import { recoverFromUnauthorized } from './auth';

// Thin fetch wrappers around the Spoolman REST API.

export type QueryParams = Record<string, string | number | undefined | null>;

function queryString(params: QueryParams): string {
	const usp = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		// Keep empty strings — the API treats e.g. `location=` as "match unset".
		if (value === undefined || value === null) continue;
		usp.append(key, String(value));
	}
	const s = usp.toString();
	return s ? '?' + s : '';
}

/**
 * True when a rejection is the result of cancelling the request rather than a
 * real failure — callers should return quietly instead of logging it or flagging
 * the view as broken.
 *
 * Pass the signal you cancelled with whenever you have it. It is the reliable
 * test: an aborted fetch does NOT always reject with a DOMException named
 * AbortError — Chromium reports a plain `TypeError: Failed to fetch` for aborts
 * that land while the request is on the wire, which is precisely the case here.
 * If we asked for the abort, any rejection that follows is ours.
 */
export function isAbortError(e: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true;
	return e instanceof DOMException && e.name === 'AbortError';
}

/** A non-2xx API response. Carries `status` so callers can report it to the user. */
export class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'HttpError';
	}
}

// Methods we're willing to answer a 401 with a page reload. A reload throws away
// whatever is on screen, which is a fine trade for a list that failed to load and
// a bad one for a half-filled form: the user would lose what they typed to a
// login redirect. Mutations therefore surface their 401 as an ordinary error and
// let the user copy their work out before dealing with it. See ./auth.ts.
const RELOAD_ON_401 = new Set(['GET', 'HEAD']);

async function ensureOk(res: Response, method: string, path: string): Promise<Response> {
	if (!res.ok) {
		if (res.status === 401 && RELOAD_ON_401.has(method)) recoverFromUnauthorized();
		let detail = '';
		try {
			detail = (await res.json())?.message ?? '';
		} catch {
			/* ignore */
		}
		throw new HttpError(`${method} ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
	}
	return res;
}

export interface RawPage {
	items: unknown[];
	total: number;
}

// Reads take an optional AbortSignal so a view can cancel what it no longer needs
// — a superseded query, or everything it had in flight when it was navigated away
// from. Writes deliberately don't: a PATCH that has left the browser has already
// changed the server, so cancelling it would only hide the result.

/** GET a list endpoint, returning the parsed array plus the X-Total-Count total. */
export async function getList(
	path: string,
	params: QueryParams = {},
	signal?: AbortSignal
): Promise<RawPage> {
	const res = await ensureOk(await fetch(API_BASE + path + queryString(params), { signal }), 'GET', path);
	const items = (await res.json()) as unknown[];
	const header = res.headers.get('x-total-count');
	const total = header != null && header !== '' ? Number(header) : items.length;
	return { items, total: Number.isNaN(total) ? items.length : total };
}

export async function getJson<T = unknown>(
	path: string,
	params: QueryParams = {},
	signal?: AbortSignal
): Promise<T> {
	const res = await ensureOk(await fetch(API_BASE + path + queryString(params), { signal }), 'GET', path);
	return (await res.json()) as T;
}

export async function patchJson<T = unknown>(path: string, body: unknown): Promise<T> {
	const res = await ensureOk(
		await fetch(API_BASE + path, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		'PATCH',
		path
	);
	return (await res.json()) as T;
}

export async function putJson<T = unknown>(path: string, body: unknown): Promise<T> {
	const res = await ensureOk(
		await fetch(API_BASE + path, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		'PUT',
		path
	);
	return (await res.json()) as T;
}

export async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
	const res = await ensureOk(
		await fetch(API_BASE + path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		'POST',
		path
	);
	return (await res.json()) as T;
}

export async function deleteResource(path: string): Promise<void> {
	await ensureOk(await fetch(API_BASE + path, { method: 'DELETE' }), 'DELETE', path);
}

export async function deleteJson<T = unknown>(path: string): Promise<T> {
	const res = await ensureOk(await fetch(API_BASE + path, { method: 'DELETE' }), 'DELETE', path);
	return (await res.json()) as T;
}
