import { describe, expect, it } from 'vitest';
import { catalogSections, MIN_PIP_FILL, spoolPips } from './catalog';
import type { GroupSummary } from '$lib/api/types';

function filament(key: string, vendorId?: string): GroupSummary {
	return {
		field: 'filament',
		key,
		title: `F${key}`,
		subtitle: '',
		badge: '',
		vendorId,
		vendorName: vendorId ? `V${vendorId}` : undefined,
		colors: [],
		spoolCount: 0,
		inUseCount: 0,
		unusedCount: 0,
		totalRemaining: 0,
		hasStock: false,
		lastUsedLabel: '',
		lastUsedSort: 0
	};
}

describe('catalogSections', () => {
	it('groups consecutive rows of one manufacturer, keeping the server order', () => {
		const page = [filament('1', '7'), filament('2', '7'), filament('3', '9'), filament('4')];
		const sections = catalogSections(page);
		expect(sections.map((s) => [s.vendorId, s.vendorName, s.rows.map((r) => r.key)])).toEqual([
			['7', 'V7', ['1', '2']],
			['9', 'V9', ['3']],
			['', undefined, ['4']]
		]);
	});

	it('returns no sections for an empty page', () => {
		expect(catalogSections([])).toEqual([]);
	});
});

describe('spoolPips', () => {
	it('fills by remaining over initial and flags low stock at the threshold', () => {
		const pips = spoolPips(
			[
				{ id: '1', remaining: 500, initial: 1000 },
				{ id: '2', remaining: 150, initial: 1000 },
				{ id: '3', remaining: 1000, initial: 1000 }
			],
			150
		);
		expect(pips).toEqual([
			{ fill: 0.5, low: false },
			{ fill: 0.15, low: true },
			{ fill: 1, low: false }
		]);
	});

	it('keeps a sliver visible on an empty spool and caps an overfull one', () => {
		const [empty, over] = spoolPips(
			[
				{ id: '1', remaining: 0, initial: 1000 },
				{ id: '2', remaining: 1200, initial: 1000 }
			],
			150
		);
		expect(empty.fill).toBe(MIN_PIP_FILL);
		expect(over.fill).toBe(1);
	});

	it('marks the fill unknown when the spool size is', () => {
		const pips = spoolPips(
			[
				{ id: '1', remaining: 80, initial: null },
				{ id: '2', remaining: null, initial: null },
				{ id: '3', remaining: 400, initial: 0 }
			],
			150
		);
		expect(pips).toEqual([
			{ fill: null, low: true },
			{ fill: null, low: false },
			{ fill: null, low: false }
		]);
	});
});
