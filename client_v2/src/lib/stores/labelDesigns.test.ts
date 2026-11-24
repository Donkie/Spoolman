import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getDesignsSetting: vi.fn(), saveDesigns: vi.fn() }));
vi.mock('$lib/api/labelDesigns', () => api);
vi.mock('$lib/labels/migrateV1', () => ({ importV1Presets: vi.fn().mockResolvedValue([]) }));

describe('label design initialization', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.resetAllMocks();
	});

	it('does not write after a failed load and retries before creating', async () => {
		const failure = new Error('offline');
		api.getDesignsSetting.mockRejectedValueOnce(failure).mockResolvedValueOnce({ designs: [], isSet: true });
		api.saveDesigns.mockResolvedValue(undefined);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { labelDesigns } = await import('./labelDesigns.svelte');
			await expect(labelDesigns.create()).rejects.toThrow('offline');
			expect(api.saveDesigns).not.toHaveBeenCalled();
			expect(labelDesigns.loaded).toBe(false);
			const created = await labelDesigns.create();
			expect(api.getDesignsSetting).toHaveBeenCalledTimes(2);
			expect(api.saveDesigns).toHaveBeenCalledTimes(1);
			expect(api.saveDesigns.mock.calls[0][0]).toEqual([expect.objectContaining({ id: created.id })]);
		} finally {
			logged.mockRestore();
		}
	});
});
