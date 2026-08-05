import { describe, expect, it } from 'vitest';
import { groupUnusedByFilament, usageLabel } from './library';
import type { SpoolVM } from './library';
import { mapSpool } from '$lib/api/map';

// The usage status is the one thing every spool row claims, and #986 was it claiming the
// wrong thing: a spool still in its vacuum pack reported "in use". Both halves of that bug
// are pinned here — what counts as used, and what the label says when it is.

describe('mapSpool unused', () => {
	it('treats a spool with no usage as unused', () => {
		expect(mapSpool({ id: 1, used_weight: 0 }).unused).toBe(true);
	});

	it('treats the float dust of a measured registration as unused', () => {
		// A full 1 kg spool weighed on a 128.11 g core: the API stores 2.3e-13 used, not 0.
		const dust = 1000 + 128.11 - 1128.11;
		expect(dust).toBeGreaterThan(0);
		expect(mapSpool({ id: 1, used_weight: dust }).unused).toBe(true);
	});

	it('treats a spool that has had filament added back as unused', () => {
		expect(mapSpool({ id: 1, used_weight: -5 }).unused).toBe(true);
	});

	it('still counts a real print as used', () => {
		expect(mapSpool({ id: 1, used_weight: 0.5 }).unused).toBe(false);
		expect(mapSpool({ id: 1, used_weight: 120 }).unused).toBe(false);
	});
});

describe('usageLabel', () => {
	const spool = (over: Record<string, unknown>) => ({ unused: false, lastUsedLabel: '', ...over }) as never;

	it('says unused for an untouched spool', () => {
		expect(usageLabel(spool({ unused: true }))).toBe('unused');
	});

	it('says how long ago a dated spool was used', () => {
		expect(usageLabel(spool({ lastUsedLabel: '3 days' }))).toBe('used 3 days ago');
	});

	it('says plainly that an undated spool has been used, never that it is in use', () => {
		// The old fallback here was "in use", which reads as "printing right now" — something
		// Spoolman has no way of knowing (#986).
		expect(usageLabel(spool({}))).toBe('used');
	});
});

// A collapsed "×N unused" row speaks for its whole pile with one filament's name, swatch and
// weight, so the pile has to BE one filament. Under a vendor/material/location group it isn't,
// which is what #1012 reported: five different SUNLU woods filed under "Wood Cherry".
describe('groupUnusedByFilament', () => {
	const vm = (id: number, filamentId: string) => ({ spool: { id, filamentId } }) as SpoolVM;
	const ids = (buckets: SpoolVM[][]) => buckets.map((b) => b.map((v) => v.spool.id));

	it('keeps one filament as a single bucket', () => {
		expect(ids(groupUnusedByFilament([vm(1, 'a'), vm(2, 'a'), vm(3, 'a')]))).toEqual([[1, 2, 3]]);
	});

	it('splits a vendor group that spans several filaments', () => {
		const buckets = groupUnusedByFilament([vm(168, 'cherry'), vm(169, 'maple'), vm(170, 'walnut')]);
		expect(ids(buckets)).toEqual([[168], [169], [170]]);
	});

	it('collects a filament whose spools are interleaved with others', () => {
		// Sorting by last-used interleaves filaments freely; each still gets exactly one row.
		const buckets = groupUnusedByFilament([
			vm(117, 'jade'),
			vm(92, 'black'),
			vm(119, 'jade'),
			vm(176, 'tan'),
			vm(177, 'tan'),
			vm(178, 'black')
		]);
		expect(ids(buckets)).toEqual([
			[117, 119],
			[92, 178],
			[176, 177]
		]);
	});

	it('orders buckets by where each filament first appears', () => {
		// The backend sort drives the list; bucketing must not reshuffle it.
		expect(ids(groupUnusedByFilament([vm(3, 'z'), vm(1, 'a'), vm(2, 'z')]))).toEqual([[3, 2], [1]]);
	});

	it('handles an empty pile', () => {
		expect(groupUnusedByFilament([])).toEqual([]);
	});
});
