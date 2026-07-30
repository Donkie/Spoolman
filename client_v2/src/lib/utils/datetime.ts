import { languages } from '$lib/i18n/languages';
import { getLocale } from '$lib/paraglide/runtime';

/** BCP-47 locale code (e.g. "en-US") for the active app language, for Intl. */
export function dateLocale(): string {
	return languages[getLocale()].code;
}

// Intl formatters are comparatively expensive to construct and get reused across
// thousands of rows during data mapping, so memoize them per (locale, config).
const dateFmts = new Map<string, Intl.DateTimeFormat>();
const unitFmts = new Map<string, Intl.NumberFormat>();

function dateFmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const loc = dateLocale();
	const cacheKey = `${loc}|${key}`;
	let f = dateFmts.get(cacheKey);
	if (!f) {
		f = new Intl.DateTimeFormat(loc, opts);
		dateFmts.set(cacheKey, f);
	}
	return f;
}

function unitFmt(unit: string): Intl.NumberFormat {
	const loc = dateLocale();
	const cacheKey = `${loc}|${unit}`;
	let f = unitFmts.get(cacheKey);
	if (!f) {
		// 'short' (not 'narrow'): narrow collapses minute and month to the same
		// "5m" in English, so "used 5m ago" would be ambiguous.
		f = new Intl.NumberFormat(loc, { style: 'unit', unit, unitDisplay: 'short' });
		unitFmts.set(cacheKey, f);
	}
	return f;
}

function parse(iso: string | null | undefined): Date | null {
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format an ISO timestamp the way builtin datetime fields display it, e.g.
 * "Jul 20, 2026  14:30" in the active locale (12/24-hour per locale). Returns
 * an empty string for an unset or unparseable value.
 *
 * Kept in sync with the trigger label in `DateTimeField.svelte`, which calls
 * this, so builtin and extra-field datetimes always render identically.
 */
export function formatDateTime(iso: string | null | undefined): string {
	const d = parse(iso);
	if (!d) return '';
	const datePart = dateFmt('date', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
	const timePart = dateFmt('time', { hour: '2-digit', minute: '2-digit' }).format(d);
	return `${datePart}  ${timePart}`;
}

/** ISO timestamp → short localized date like "Jan 14" (month + day, no year). */
export function formatShortDate(iso: string | null | undefined): string {
	const d = parse(iso);
	if (!d) return '';
	return dateFmt('short', { month: 'short', day: 'numeric' }).format(d);
}

/**
 * ISO timestamp → compact localized elapsed-time magnitude such as "5 hr",
 * "2 days", "3 wks", "2 mths", "1 yr". Only the single largest unit is shown;
 * callers wrap it in an "… ago" phrase. The unit label comes from Intl (unit
 * number format), so nothing is hard-coded per language.
 */
export function formatDurationShort(iso: string | null | undefined): string {
	const d = parse(iso);
	if (!d) return '';
	const secs = Math.max(0, (Date.now() - d.getTime()) / 1000);
	const mins = secs / 60;
	const hours = mins / 60;
	const days = hours / 24;

	let value: number;
	let unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
	if (days < 1) {
		if (hours >= 1) {
			value = Math.round(hours);
			unit = 'hour';
		} else {
			value = Math.max(1, Math.round(mins));
			unit = 'minute';
		}
	} else if (days < 14) {
		value = Math.round(days);
		unit = 'day';
	} else if (days < 60) {
		value = Math.round(days / 7);
		unit = 'week';
	} else if (days < 365) {
		value = Math.round(days / 30);
		unit = 'month';
	} else {
		value = Math.round(days / 365);
		unit = 'year';
	}
	return unitFmt(unit).format(value);
}
