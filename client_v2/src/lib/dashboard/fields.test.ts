import { describe, expect, it, vi } from 'vitest';
import type { Spool } from '$lib/types';

// The dashboard writes the grouped-by field when a spool is dragged between cards, so what
// these produce goes straight into a PATCH body. Clearing is the case worth pinning down:
// the API validates every value in the `extra` map as a JSON-encoded *string*, so the empty
// group has to be spelled as a real null — the string 'null' is a 400, which is what broke
// dragging onto the unassigned card (issue #1019).

const saveSpool = vi.fn();
vi.mock('$lib/api/spoolSource', () => ({
	spoolSource: {
		saveSpool: (...args: unknown[]) => saveSpool(...args),
		renameFieldValue: vi.fn()
	}
}));
vi.mock('$lib/stores/inventory.svelte', () => ({
	inventory: { patchSpool: vi.fn() }
}));

const { dashboardFields } = await import('./fields');
const { FieldType } = await import('$lib/api/fields');

const def = {
	key: 'printer',
	name: 'Printer',
	field_type: FieldType.text,
	entity_type: 'spool' as const,
	order: 0
};
const printerField = () => dashboardFields([def])[1];
const spool = (extra: Record<string, string>) => ({ id: 7, extra }) as unknown as Spool;

describe('dashboard extra field', () => {
	it('reads the decoded value, and an absent key as unassigned', () => {
		const f = printerField();
		expect(f.valueOf(spool({ printer: '"Prusa"' }))).toBe('Prusa');
		expect(f.valueOf(spool({}))).toBe('');
	});

	it('drops the key rather than storing a blank when a spool is unassigned', () => {
		const f = printerField();
		expect(f.withValue(spool({ printer: '"Prusa"' }), '')).toMatchObject({ extra: {} });
		expect(f.withValue(spool({}), 'Prusa')).toMatchObject({ extra: { printer: '"Prusa"' } });
	});

	it('clears with a real null, not the string the API rejects', async () => {
		const f = printerField();
		saveSpool.mockClear();
		await f.assign(spool({ printer: '"Prusa"' }), '');
		expect(saveSpool).toHaveBeenCalledWith(7, { extra: { printer: null } });
	});

	it('assigns a value JSON-encoded', async () => {
		const f = printerField();
		saveSpool.mockClear();
		await f.assign(spool({}), 'Prusa');
		expect(saveSpool).toHaveBeenCalledWith(7, { extra: { printer: '"Prusa"' } });
	});
});
