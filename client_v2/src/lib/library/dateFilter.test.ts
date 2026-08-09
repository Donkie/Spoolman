import { describe, expect, it } from 'vitest';
import {
	formatDateRange,
	isDateFilterProp,
	olderThan,
	parseDateRange,
	resolveDateRange,
	withinLast
} from './dateFilter';

// The grammar behind a date filter chip: `<from>..<to>`, either end open, each
// end a calendar day or an offset back from now. It is a URL format, so it has
// to round-trip exactly and refuse anything it can't read; and it is resolved
// against the clock at request time, which is what keeps "the last 24 hours"
// meaning the last 24 hours on every fetch rather than on the day it was picked.

describe('parseDateRange', () => {
	it('reads a relative lower bound', () => {
		expect(parseDateRange('-24h..')).toEqual({
			from: { kind: 'relative', amount: 24, unit: 'h' },
			to: null
		});
	});

	it('reads a relative upper bound', () => {
		expect(parseDateRange('..-90d')).toEqual({
			from: null,
			to: { kind: 'relative', amount: 90, unit: 'd' }
		});
	});

	it('reads a two-ended calendar range', () => {
		expect(parseDateRange('2026-01-14..2026-02-01')).toEqual({
			from: { kind: 'date', value: '2026-01-14' },
			to: { kind: 'date', value: '2026-02-01' }
		});
	});

	it('reads an open-ended calendar range', () => {
		expect(parseDateRange('2026-01-14..')).toEqual({
			from: { kind: 'date', value: '2026-01-14' },
			to: null
		});
	});

	it('reads the calendar units', () => {
		expect(parseDateRange('-6m..')).toEqual({
			from: { kind: 'relative', amount: 6, unit: 'm' },
			to: null
		});
		expect(parseDateRange('..-1y')).toEqual({
			from: null,
			to: { kind: 'relative', amount: 1, unit: 'y' }
		});
	});

	it.each([
		['no separator', '2026-01-14'],
		['both ends open', '..'],
		['a date that does not exist', '2026-02-31..'],
		['a malformed date', '2026-1-4..'],
		['an offset without a sign', '24h..'],
		['an unknown unit', '-2w..'],
		['free text', 'yesterday..today']
	])('rejects %s', (_case, value) => {
		expect(parseDateRange(value)).toBeNull();
	});
});

describe('formatDateRange', () => {
	it.each(['-24h..', '..-90d', '-6m..', '..-1y', '2026-01-14..2026-02-01', '2026-01-14..', '..2026-02-01'])(
		'round-trips %s',
		(value) => {
			expect(formatDateRange(parseDateRange(value)!)).toBe(value);
		}
	);

	it('builds the preset shapes', () => {
		expect(withinLast(24, 'h')).toBe('-24h..');
		expect(olderThan(6, 'm')).toBe('..-6m');
	});
});

describe('resolveDateRange', () => {
	const now = new Date('2026-03-10T12:00:00Z');

	it('measures a relative bound back from the given moment', () => {
		expect(resolveDateRange(parseDateRange('-24h..')!, now)).toEqual({
			after: '2026-03-09T12:00:00.000Z'
		});
		expect(resolveDateRange(parseDateRange('..-7d')!, now)).toEqual({
			before: '2026-03-03T12:00:00.000Z'
		});
	});

	it('re-measures a relative bound against the current moment', () => {
		const later = new Date(now.getTime() + 3_600_000);
		const first = resolveDateRange(parseDateRange('-24h..')!, now).after;
		const second = resolveDateRange(parseDateRange('-24h..')!, later).after;
		expect(second).not.toBe(first);
	});

	it('steps a month bound back on the calendar, not by a fixed number of days', () => {
		const { after } = resolveDateRange(parseDateRange('-6m..')!, new Date(2026, 2, 10, 12, 0, 0));
		expect(new Date(after!)).toEqual(new Date(2025, 8, 10, 12, 0, 0));
	});

	it('clamps a month step onto a shorter month instead of overshooting it', () => {
		// One month back from March 31st is "Feb 31" to JS, i.e. March 3rd — a bound
		// *later* than the month it was aiming at, which would drop a month's spools.
		const { after } = resolveDateRange(parseDateRange('-1m..')!, new Date(2026, 2, 31, 9, 0, 0));
		expect(new Date(after!)).toEqual(new Date(2026, 1, 28, 9, 0, 0));
	});

	it('steps a year bound back on the calendar', () => {
		const { before } = resolveDateRange(parseDateRange('..-1y')!, new Date(2026, 2, 10, 12, 0, 0));
		expect(new Date(before!)).toEqual(new Date(2025, 2, 10, 12, 0, 0));
	});

	it('leaves an open end unbounded', () => {
		expect(resolveDateRange(parseDateRange('-24h..')!, now).before).toBeUndefined();
		expect(resolveDateRange(parseDateRange('..-7d')!, now).after).toBeUndefined();
	});

	it('covers a single calendar day from its first to its last millisecond', () => {
		// Local time, as the date input meant it — so the assertion has to be in
		// local time too, or it only passes in the timezone it was written in.
		const { after, before } = resolveDateRange(parseDateRange('2026-01-14..2026-01-14')!, now);
		expect(new Date(after!)).toEqual(new Date(2026, 0, 14, 0, 0, 0, 0));
		expect(new Date(before!)).toEqual(new Date(2026, 0, 14, 23, 59, 59, 999));
	});
});

describe('isDateFilterProp', () => {
	it('knows the three spool timestamps', () => {
		expect(isDateFilterProp('last_used')).toBe(true);
		expect(isDateFilterProp('first_used')).toBe(true);
		expect(isDateFilterProp('registered')).toBe(true);
	});

	it('leaves every other filter prop alone', () => {
		expect(isDateFilterProp('location')).toBe(false);
		expect(isDateFilterProp('extra.last_used')).toBe(false);
	});
});
