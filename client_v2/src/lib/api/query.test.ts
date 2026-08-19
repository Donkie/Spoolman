import { describe, expect, it } from 'vitest';
import { buildGroupQuery } from './query';
import type { LibraryState } from '$lib/library/params';

// A filament with no spools is the one you need to re-order, and grouping by
// filament used to drop it entirely — the library then looked fully stocked
// (#1092). Listing them is opt-in (showEmpty), and on top of that the query
// builder has a rule worth pinning down: a filter about SPOOLS (where they are,
// when they were used) is a question an empty filament cannot answer, so the API
// refuses that combination and the client must not send it.
//
// These cases run with showEmpty on unless they say otherwise; the default-off
// behaviour is its own case below.

function state(over: Partial<LibraryState> = {}): LibraryState {
	return {
		selection: null,
		group: 'filament',
		sortKey: 'last_used',
		sortAsc: false,
		filters: [],
		showArchived: false,
		showEmpty: true,
		page: 1,
		pageSize: 20,
		...over
	};
}

describe('buildGroupQuery — includeEmpty', () => {
	it('asks for empty groups when grouping by filament with no filters', () => {
		expect(buildGroupQuery(state()).includeEmpty).toBe(true);
	});

	it('does not ask unless the user turned it on', () => {
		// Off by default: a filament you own none of cannot serve the daily job of
		// finding something to print with, and how many of them there are depends
		// on how big a catalogue the user keeps.
		expect(buildGroupQuery(state({ showEmpty: false })).includeEmpty).toBe(false);
	});

	it('does not ask on any other grouping, which has no empty groups to list', () => {
		for (const group of ['vendor', 'material', 'location'] as const) {
			expect(buildGroupQuery(state({ group })).includeEmpty).toBe(false);
		}
	});

	it('keeps asking under filters the filament itself answers', () => {
		const filters = [
			{ prop: 'filament', value: '4' },
			{ prop: 'material', value: 'PLA' },
			{ prop: 'vendor', value: 'Acme' },
			{ prop: 'direction', value: 'coaxial' },
			{ prop: 'filament.extra.shelf', value: '"A"' },
			{ prop: 'filament.vendor.extra.tier', value: '"gold"' }
		];
		for (const f of filters) {
			expect(buildGroupQuery(state({ filters: [f] })).includeEmpty).toBe(true);
		}
	});

	it('stops asking under a filter about the spools themselves', () => {
		const filters = [
			{ prop: 'location', value: 'Shelf A' },
			{ prop: 'lot', value: 'B12' },
			{ prop: 'last_used', value: '7d' },
			{ prop: 'first_used', value: '7d' },
			{ prop: 'registered', value: '7d' },
			{ prop: 'extra.opened', value: 'true' }
		];
		for (const f of filters) {
			expect(buildGroupQuery(state({ filters: [f] })).includeEmpty).toBe(false);
		}
	});

	it('lets one spool-scoped filter veto a set of filament-scoped ones', () => {
		const filters = [
			{ prop: 'material', value: 'PLA' },
			{ prop: 'location', value: 'Shelf A' }
		];
		expect(buildGroupQuery(state({ filters })).includeEmpty).toBe(false);
	});

	it('still asks when only archived spools are hidden, which is the default view', () => {
		// A filament whose every spool is archived has none to print with, so it
		// belongs in the list for the same reason a filament with no spools does.
		expect(buildGroupQuery(state({ showArchived: false })).includeEmpty).toBe(true);
	});
});
