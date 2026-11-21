import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldParams } from '$lib/api/fields';

const api = vi.hoisted(() => ({ getFields: vi.fn(), setField: vi.fn(), deleteField: vi.fn() }));
vi.mock('$lib/api/fields', () => api);

const field = (key: string) => ({ key, entity_type: 'spool', name: key, order: 0, field_type: 'text' });
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

describe('extra-field cache ordering', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.resetAllMocks();
	});

	it.each(['save', 'remove'] as const)('keeps a completed %s when an older GET resolves', async (operation) => {
		const stale = deferred<ReturnType<typeof field>[]>();
		api.getFields.mockReturnValue(stale.promise);
		api.setField.mockResolvedValue([field('saved')]);
		api.deleteField.mockResolvedValue([field('remaining')]);
		const { fields } = await import('./fields.svelte');
		fields.ensure('spool');
		if (operation === 'save') {
			await fields.save('spool', 'saved', { name: 'saved', order: 0, field_type: 'text' as FieldParams['field_type'] });
		} else {
			await fields.remove('spool', 'deleted');
		}
		const expected = operation === 'save' ? 'saved' : 'remaining';
		expect(fields.get('spool').map((f) => f.key)).toEqual([expected]);
		stale.resolve([field('stale')]);
		await stale.promise;
		await vi.waitFor(() => expect(fields.get('spool').map((f) => f.key)).toEqual([expected]));
		expect(fields.isLoaded('spool')).toBe(true);
	});

	it('shares a single initial request across concurrent ensure calls', async () => {
		const pending = deferred<ReturnType<typeof field>[]>();
		api.getFields.mockReturnValue(pending.promise);
		const { fields } = await import('./fields.svelte');
		fields.ensure('spool');
		fields.ensure('spool');
		expect(api.getFields).toHaveBeenCalledTimes(1);
		pending.resolve([field('one')]);
		await vi.waitFor(() => expect(fields.isLoaded('spool')).toBe(true));
		expect(fields.get('spool').map((f) => f.key)).toEqual(['one']);
		fields.ensure('spool');
		expect(api.getFields).toHaveBeenCalledTimes(1);
	});
});
