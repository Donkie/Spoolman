import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Covers which failures reach for the page-reload recovery in ./auth.ts. The
// split between reads and writes is the part worth pinning down: getting it
// wrong means a user loses a half-typed form to a login redirect.

const { recover } = vi.hoisted(() => ({ recover: vi.fn() }));
vi.mock('./auth', () => ({ recoverFromUnauthorized: recover }));
vi.mock('./config', () => ({ API_BASE: 'http://spoolman.test/api/v1' }));

import { getJson, getList, HttpError, patchJson, postJson, deleteResource } from './http';

function respond(status: number): Response {
	const body = status === 200 ? '[]' : JSON.stringify({ message: 'Unauthorized' });
	return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function serving(status: number) {
	fetchMock = vi.fn(async () => respond(status));
	vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => recover.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('401 handling', () => {
	it('tries to recover when a read is rejected', async () => {
		serving(401);
		await expect(getJson('/spool/1')).rejects.toThrow(HttpError);
		expect(recover).toHaveBeenCalledTimes(1);
	});

	it('tries to recover when a list read is rejected', async () => {
		serving(401);
		await expect(getList('/spool')).rejects.toThrow(HttpError);
		expect(recover).toHaveBeenCalledTimes(1);
	});

	it('leaves a rejected write alone so the user keeps their input', async () => {
		serving(401);
		await expect(patchJson('/spool/1', { comment: 'half typed' })).rejects.toThrow(HttpError);
		await expect(postJson('/spool', {})).rejects.toThrow(HttpError);
		await expect(deleteResource('/spool/1')).rejects.toThrow(HttpError);
		expect(recover).not.toHaveBeenCalled();
	});

	it('ignores failures that are not about authentication', async () => {
		serving(500);
		await expect(getJson('/spool/1')).rejects.toThrow(HttpError);
		expect(recover).not.toHaveBeenCalled();
	});

	it('carries the status on the error either way', async () => {
		serving(401);
		await expect(getJson('/spool/1')).rejects.toMatchObject({ status: 401 });
	});

	it('does nothing on a successful read', async () => {
		serving(200);
		await expect(getList('/spool')).resolves.toEqual({ items: [], total: 0 });
		expect(recover).not.toHaveBeenCalled();
	});
});
