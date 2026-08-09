import { formatCalendarDate, formatSpan } from '$lib/utils/datetime';
import * as m from '$lib/paraglide/messages';

// The Library's date filters: "last used in the last 24 hours", "registered
// before March", "first used between two dates".
//
// A range lives in the URL as one ordinary filter chip whose value is
// `<from>..<to>` — either end may be empty, meaning open — and each end is
// either a calendar date (`2026-01-14`, read as a day in the viewer's own
// timezone) or an offset back from now (`-24h`, `-7d`).
//
// Relative ends stay relative all the way into the URL rather than being
// resolved to an instant when the chip is made. "Used in the last 24 hours" is a
// question about *now*, so a bookmarked, reloaded or shared view has to re-ask
// it against the current time; freezing it at pick time would quietly turn it
// into "used since yesterday lunchtime" and drift further every day.
//
// Only the resolution to absolute instants (resolveDateRange) is sent to the
// backend, which takes plain ISO bounds and knows nothing about this grammar.

/** The spool timestamps the Library can filter on. Each is a backend column name. */
export const DATE_FILTER_PROPS = ['last_used', 'first_used', 'registered'] as const;

export type DateFilterProp = (typeof DATE_FILTER_PROPS)[number];

export function isDateFilterProp(prop: string): prop is DateFilterProp {
	return (DATE_FILTER_PROPS as readonly string[]).includes(prop);
}

/**
 * How far back a relative bound reaches. Hours and days are fixed spans; months
 * and years are calendar steps, because "six months ago" is a date on a calendar
 * and not 180 × 24 hours.
 */
export type RelativeUnit = 'h' | 'd' | 'm' | 'y';

/** One end of a range: a calendar day, or an offset back from now. */
export type DateBound =
	{ kind: 'date'; value: string } | { kind: 'relative'; amount: number; unit: RelativeUnit };

/** A range with at least one end. A null end is open. */
export interface DateRange {
	from: DateBound | null;
	to: DateBound | null;
}

/** What the API wants: absolute ISO instants, either side optional. */
export interface ResolvedDateRange {
	after?: string;
	before?: string;
}

const RELATIVE_RE = /^-(\d{1,5})([hdmy])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const SEPARATOR = '..';

/** Whether `raw` is a real calendar date — the regex alone accepts 2026-02-31. */
function isCalendarDate(raw: string): boolean {
	const parts = DATE_RE.exec(raw);
	if (!parts) return false;
	const [y, mo, d] = parts.slice(1).map(Number);
	const dt = new Date(y, mo - 1, d);
	return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function parseBound(raw: string): DateBound | null | 'invalid' {
	if (raw === '') return null;
	const rel = RELATIVE_RE.exec(raw);
	if (rel) return { kind: 'relative', amount: Number(rel[1]), unit: rel[2] as RelativeUnit };
	if (isCalendarDate(raw)) return { kind: 'date', value: raw };
	return 'invalid';
}

/**
 * Parse a chip value into a range, or null if it isn't one. Anything the URL can
 * carry reaches this — hand-edited, or written by a client that spelled the
 * grammar differently — so a malformed value is rejected rather than guessed at,
 * and its chip is then dropped instead of narrowing the list by something the
 * user can't see. A range with both ends open filters nothing, so it's rejected
 * too.
 */
export function parseDateRange(value: string): DateRange | null {
	const i = value.indexOf(SEPARATOR);
	if (i < 0) return null;
	const from = parseBound(value.slice(0, i));
	const to = parseBound(value.slice(i + SEPARATOR.length));
	if (from === 'invalid' || to === 'invalid') return null;
	if (from === null && to === null) return null;
	return { from, to };
}

function formatBound(bound: DateBound | null): string {
	if (!bound) return '';
	return bound.kind === 'date' ? bound.value : `-${bound.amount}${bound.unit}`;
}

/** Encode a range back to its chip value. Inverse of {@link parseDateRange}. */
export function formatDateRange(range: DateRange): string {
	return `${formatBound(range.from)}${SEPARATOR}${formatBound(range.to)}`;
}

/** Chip value for the "within the last N units" shape, the presets' form. */
export function withinLast(amount: number, unit: RelativeUnit): string {
	return formatDateRange({ from: { kind: 'relative', amount, unit }, to: null });
}

/** Chip value for the "nothing since N units ago" shape. */
export function olderThan(amount: number, unit: RelativeUnit): string {
	return formatDateRange({ from: null, to: { kind: 'relative', amount, unit } });
}

const MS: Partial<Record<RelativeUnit, number>> = { h: 3_600_000, d: 86_400_000 };

/** `now`, moved back by a whole number of calendar months or years. */
function calendarStepBack(now: Date, amount: number, unit: 'm' | 'y'): Date {
	const shifted = new Date(now.getTime());
	const day = shifted.getDate();
	if (unit === 'y') shifted.setFullYear(shifted.getFullYear() - amount);
	else shifted.setMonth(shifted.getMonth() - amount);
	// Both setters roll forward when the target month is too short — one month
	// back from the 31st lands on "Feb 31", i.e. March 3rd, which would put the
	// bound *later* than the month it was aiming at. setDate(0) walks back to the
	// last day of the intended month.
	if (shifted.getDate() !== day) shifted.setDate(0);
	return shifted;
}

/**
 * A bound as an instant. A calendar day covers the whole of that day in the
 * viewer's timezone, so which end of it we mean depends on which end of the
 * range it is: `2026-01-14..2026-01-14` is that one day in full, from its first
 * millisecond to its last.
 */
function resolveBound(bound: DateBound, end: 'from' | 'to', now: Date): Date {
	if (bound.kind === 'relative') {
		const fixed = MS[bound.unit];
		return fixed === undefined
			? calendarStepBack(now, bound.amount, bound.unit as 'm' | 'y')
			: new Date(now.getTime() - bound.amount * fixed);
	}
	const [y, mo, d] = bound.value.split('-').map(Number);
	return end === 'from' ? new Date(y, mo - 1, d, 0, 0, 0, 0) : new Date(y, mo - 1, d, 23, 59, 59, 999);
}

/** Resolve a range to the absolute ISO bounds the API filters on. */
export function resolveDateRange(range: DateRange, now: Date = new Date()): ResolvedDateRange {
	const resolved: ResolvedDateRange = {};
	if (range.from) resolved.after = resolveBound(range.from, 'from', now).toISOString();
	if (range.to) resolved.before = resolveBound(range.to, 'to', now).toISOString();
	return resolved;
}

const SPAN_UNITS: Record<RelativeUnit, 'hour' | 'day' | 'month' | 'year'> = {
	h: 'hour',
	d: 'day',
	m: 'month',
	y: 'year'
};

function spanText(bound: Extract<DateBound, { kind: 'relative' }>): string {
	return formatSpan(bound.amount, SPAN_UNITS[bound.unit]);
}

/** How one end reads inside a two-ended label ("Jan 14, 2026", "7 days ago"). */
function boundText(bound: DateBound): string {
	return bound.kind === 'date'
		? formatCalendarDate(bound.value)
		: m['library.dateFilter.ago']({ span: spanText(bound) });
}

/**
 * The human reading of a range, for the filter chip and the menu. The two
 * one-ended relative shapes get their own phrasing because they are the common
 * ones and "since 24 hours ago" is a clumsy way to say "last 24 hours".
 */
export function dateRangeLabel(range: DateRange): string {
	const { from, to } = range;
	if (from?.kind === 'relative' && !to) {
		return m['library.dateFilter.last']({ span: spanText(from) });
	}
	if (to?.kind === 'relative' && !from) {
		return m['library.dateFilter.olderThan']({ span: spanText(to) });
	}
	if (from && to) {
		return m['library.dateFilter.between']({ from: boundText(from), to: boundText(to) });
	}
	if (from) return m['library.dateFilter.since']({ date: boundText(from) });
	return m['library.dateFilter.until']({ date: boundText(to!) });
}
