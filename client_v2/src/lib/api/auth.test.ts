import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The cooldown is the whole safety story here: without it, a 401 that a reload
// cannot fix turns the tab into a reload loop. These tests run the module fresh
// each time (vi.resetModules) because it keeps an in-memory stamp that would
// otherwise leak between cases.

function fakeStorage(): Storage {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k),
		clear: () => data.clear(),
		key: () => null,
		get length() {
			return data.size;
		}
	} as Storage;
}

async function load() {
	vi.resetModules();
	return (await import('./auth')).recoverFromUnauthorized;
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
	reload = vi.fn();
	vi.stubGlobal('location', { reload });
	vi.stubGlobal('localStorage', fakeStorage());
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('recoverFromUnauthorized', () => {
	it('reloads the page on the first 401', async () => {
		const recover = await load();
		expect(recover()).toBe(true);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('reloads only once for a burst of 401s', async () => {
		const recover = await load();
		// A view firing several requests at once gets several 401s back, and
		// location.reload() does not stop the code that follows it.
		recover();
		expect(recover()).toBe(false);
		expect(recover()).toBe(false);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload again after coming back still unauthenticated', async () => {
		const recover = await load();
		recover();

		// The reload re-runs the app: fresh module, empty in-memory stamp. Only
		// localStorage carries the cooldown across, which is why it is there.
		const afterReload = await load();
		vi.advanceTimersByTime(5_000);
		expect(afterReload()).toBe(false);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('allows another attempt once the cooldown has passed', async () => {
		const recover = await load();
		recover();
		vi.advanceTimersByTime(30_001);
		expect(recover()).toBe(true);
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('still rate-limits when localStorage is unavailable', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('storage disabled');
			},
			setItem: () => {
				throw new Error('storage disabled');
			}
		});
		const recover = await load();
		expect(recover()).toBe(true);
		expect(recover()).toBe(false);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('is not locked out by a future stamp from a clock change', async () => {
		localStorage.setItem('spoolman.auth-reload-at', String(Date.now() + 60 * 60_000));
		const recover = await load();
		expect(recover()).toBe(true);
	});

	it('does nothing when there is no document to reload', async () => {
		vi.stubGlobal('location', undefined);
		const recover = await load();
		expect(recover()).toBe(false);
	});
});
