import { API_BASE } from './config';

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

const SESSION_EXPIRED = 401;
const FORBIDDEN = 403;

const CSRF_COOKIE = 'spoolman_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

/** Paths that own their own error handling — a failed sign-in must not read as a sign-out. */
const AUTH_PATH_PREFIX = '/auth/';

type AuthHandlers = {
	/** The server says we are not signed in. */
	unauthorized: () => void;
	/** The server refused for lack of permission. */
	forbidden: (detail: string) => void;
};

let authHandlers: AuthHandlers | null = null;

/**
 * Register what to do when the server rejects a request on authentication grounds.
 *
 * Inverted rather than imported directly: the auth store imports this module, so
 * reaching back for the store here would be a cycle.
 */
export function setAuthHandlers(handlers: AuthHandlers): void {
	authHandlers = handlers;
}

/** Read a cookie by name. Only used for the CSRF token, which is deliberately readable. */
function readCookie(name: string): string {
	const prefix = name + '=';
	for (const part of document.cookie.split('; ')) {
		if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
	}
	return '';
}

/**
 * Headers for a request that carries a body.
 *
 * The session cookie is HttpOnly and travels on its own, but because it is sent
 * automatically it needs a second factor the browser will not supply cross-site: the
 * CSRF token, which lives in a readable cookie precisely so it can be echoed here.
 */
function writeHeaders(): Record<string, string> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const token = readCookie(CSRF_COOKIE);
	if (token) headers[CSRF_HEADER] = token;
	return headers;
}

async function ensureOk(res: Response, method: string, path: string): Promise<Response> {
	if (!res.ok) {
		let detail = '';
		try {
			detail = (await res.json())?.message ?? '';
		} catch {
			/* ignore */
		}
		if (!path.startsWith(AUTH_PATH_PREFIX)) {
			if (res.status === SESSION_EXPIRED) authHandlers?.unauthorized();
			else if (res.status === FORBIDDEN) authHandlers?.forbidden(detail);
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
	const res = await ensureOk(
		await fetch(API_BASE + path + queryString(params), { signal, credentials: 'include' }),
		'GET',
		path
	);
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
	const res = await ensureOk(
		await fetch(API_BASE + path + queryString(params), { signal, credentials: 'include' }),
		'GET',
		path
	);
	return (await res.json()) as T;
}

export async function patchJson<T = unknown>(path: string, body: unknown): Promise<T> {
	const res = await ensureOk(
		await fetch(API_BASE + path, {
			method: 'PATCH',
			headers: writeHeaders(),
			credentials: 'include',
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
			headers: writeHeaders(),
			credentials: 'include',
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
			headers: writeHeaders(),
			credentials: 'include',
			body: JSON.stringify(body)
		}),
		'POST',
		path
	);
	return (await res.json()) as T;
}

export async function deleteResource(path: string): Promise<void> {
	await ensureOk(
		await fetch(API_BASE + path, { method: 'DELETE', headers: writeHeaders(), credentials: 'include' }),
		'DELETE',
		path
	);
}

export async function deleteJson<T = unknown>(path: string): Promise<T> {
	const res = await ensureOk(
		await fetch(API_BASE + path, { method: 'DELETE', headers: writeHeaders(), credentials: 'include' }),
		'DELETE',
		path
	);
	return (await res.json()) as T;
}
