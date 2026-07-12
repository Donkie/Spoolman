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

async function ensureOk(res: Response, method: string, path: string): Promise<Response> {
	if (!res.ok) {
		let detail = '';
		try {
			detail = (await res.json())?.message ?? '';
		} catch {
			/* ignore */
		}
		throw new Error(`${method} ${path} → ${res.status}${detail ? `: ${detail}` : ''}`);
	}
	return res;
}

export interface RawPage {
	items: unknown[];
	total: number;
}

/** GET a list endpoint, returning the parsed array plus the X-Total-Count total. */
export async function getList(path: string, params: QueryParams = {}): Promise<RawPage> {
	const res = await ensureOk(await fetch(API_BASE + path + queryString(params)), 'GET', path);
	const items = (await res.json()) as unknown[];
	const header = res.headers.get('x-total-count');
	const total = header != null && header !== '' ? Number(header) : items.length;
	return { items, total: Number.isNaN(total) ? items.length : total };
}

export async function getJson<T = unknown>(path: string, params: QueryParams = {}): Promise<T> {
	const res = await ensureOk(await fetch(API_BASE + path + queryString(params)), 'GET', path);
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
