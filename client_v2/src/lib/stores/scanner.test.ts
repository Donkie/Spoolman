import { beforeEach, describe, expect, it } from 'vitest';
import { isBrowsableRoute, isTypingTarget, scanner } from './scanner.svelte';

// A tag tapped in the next room fires with no warning, so what stops a scan from
// yanking the browser somewhere is the only thing standing between "handy" and
// "hostile". These cover that guard; the socket plumbing around it is exercised
// end to end by the Playwright specs instead.

/** Enough of an Element for the guard, which reads nothing else. */
const el = (tagName: string, isContentEditable = false) =>
	({ tagName, isContentEditable }) as unknown as Element;

describe('isTypingTarget', () => {
	it('recognises the fields a navigation would interrupt', () => {
		expect(isTypingTarget(el('INPUT'))).toBe(true);
		expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
		expect(isTypingTarget(el('SELECT'))).toBe(true);
		expect(isTypingTarget(el('DIV', true))).toBe(true);
	});

	it('leaves ordinary elements alone', () => {
		expect(isTypingTarget(el('DIV'))).toBe(false);
		expect(isTypingTarget(el('BUTTON'))).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});

// Pairing a reader is done by tapping a tag on it, and that tap reaches the
// auto-navigate subscription too — so without this, setting a reader up threw you
// off the settings page the instant it worked.
describe('isBrowsableRoute', () => {
	it('lets the inventory pages react to a scan', () => {
		expect(isBrowsableRoute('/')).toBe(true);
		expect(isBrowsableRoute('/dashboard')).toBe(true);
	});

	it('leaves pages you are working on alone', () => {
		expect(isBrowsableRoute('/settings')).toBe(false);
		expect(isBrowsableRoute('/labels')).toBe(false);
	});

	// Route ids, not pathnames: an instance under SPOOLMAN_BASE_PATH serves the
	// library from e.g. /spoolman/, which would never equal "/".
	it('treats an unresolved route as not browsable', () => {
		expect(isBrowsableRoute(null)).toBe(false);
		expect(isBrowsableRoute(undefined)).toBe(false);
		expect(isBrowsableRoute('/spoolman/')).toBe(false);
	});
});

describe('scanner.mayNavigate', () => {
	beforeEach(() => {
		scanner.setAutoNavigate(false);
		scanner.unpair();
	});

	it('stays put until auto-navigate is switched on', () => {
		expect(scanner.mayNavigate(null, false)).toBe(false);
		scanner.setAutoNavigate(true);
		expect(scanner.mayNavigate(null, false)).toBe(true);
	});

	it('never navigates out from under an open dialog', () => {
		scanner.setAutoNavigate(true);
		expect(scanner.mayNavigate(null, true)).toBe(false);
	});

	it('never navigates away from a field being typed in', () => {
		scanner.setAutoNavigate(true);
		expect(scanner.mayNavigate(el('INPUT'), false)).toBe(false);
	});

	// The tag dialog holds one of these while it is open, because the tap it is
	// waiting for is exactly the event that would otherwise navigate away from it.
	it('stands down while a hold is out, and resumes once it is released', () => {
		scanner.setAutoNavigate(true);
		const release = scanner.suppress();
		expect(scanner.mayNavigate(null, false)).toBe(false);
		release();
		expect(scanner.mayNavigate(null, false)).toBe(true);
	});

	it('keeps overlapping holds from releasing each other', () => {
		scanner.setAutoNavigate(true);
		const first = scanner.suppress();
		const second = scanner.suppress();
		first();
		expect(scanner.mayNavigate(null, false)).toBe(false);
		second();
		expect(scanner.mayNavigate(null, false)).toBe(true);
	});

	// $effect cleanups can run more than once; a release that decremented twice
	// would leave the counter negative and re-enable navigation under a live hold.
	it('ignores a release called twice', () => {
		scanner.setAutoNavigate(true);
		const release = scanner.suppress();
		const other = scanner.suppress();
		release();
		release();
		expect(scanner.mayNavigate(null, false)).toBe(false);
		other();
		expect(scanner.mayNavigate(null, false)).toBe(true);
	});
});

describe('scanner pairing', () => {
	beforeEach(() => scanner.unpair());

	it('starts on every reader, which is the working default for one reader', () => {
		expect(scanner.pool).toBeNull();
	});

	it('narrows to the reader it was paired with, and widens again on unpair', () => {
		scanner.pair('printer-voron', 'Voron spool holder');
		expect(scanner.pool).toBe('printer-voron');
		expect(scanner.pairedReaderName).toBe('Voron spool holder');
		scanner.unpair();
		expect(scanner.pool).toBeNull();
		expect(scanner.pairedReaderName).toBeNull();
	});

	// Readers derive an id from their address when they send none, so a great many
	// of them are called `ip-192-168-1-50` and only the name is worth showing.
	it('picks up a renamed reader from its own scans', () => {
		scanner.pair('ip-192-168-1-50');
		expect(scanner.pairedReaderName).toBeNull();
		scanner.receive({ uid: '04A2B3C4', readerId: 'ip-192-168-1-50', name: 'Shelf reader' });
		expect(scanner.pairedReaderName).toBe('Shelf reader');
	});

	it('does not take a name from a reader it is not paired with', () => {
		scanner.pair('desk', 'Desk reader');
		scanner.receive({ uid: '04A2B3C4', readerId: 'other', name: 'Someone else' });
		expect(scanner.pairedReaderName).toBe('Desk reader');
	});
});
