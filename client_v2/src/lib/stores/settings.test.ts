import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/settings', () => ({
	getSettings: async () => ({}),
	setSetting: async () => {},
	parseSetting: <T>(_: unknown, fallback: T) => fallback
}));

const { settings } = await import('./settings.svelte');

function storeThreshold(value: string | null) {
	vi.stubGlobal('localStorage', {
		getItem: () => value,
		setItem: () => {}
	});
}

describe('low-stock threshold', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		settings.lowThreshold = 150;
	});

	it('keeps a stored 0 across a reload', async () => {
		storeThreshold('0');
		await settings.load();
		expect(settings.lowThreshold).toBe(0);
	});

	it('reads a stored threshold', async () => {
		storeThreshold('42.5');
		await settings.load();
		expect(settings.lowThreshold).toBe(42.5);
	});

	it('falls back to the default for nothing stored or garbage', async () => {
		for (const bad of [null, '', 'NaN', 'abc', '-5', 'Infinity']) {
			storeThreshold(bad);
			await settings.load();
			expect(settings.lowThreshold, String(bad)).toBe(150);
		}
	});
});
