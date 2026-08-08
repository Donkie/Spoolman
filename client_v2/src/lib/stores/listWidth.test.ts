import { describe, expect, it } from 'vitest';
import { clampListWidth, DETAIL_MIN, LIST_DEFAULT, LIST_MIN } from './listWidth.svelte';

// The rule the resizable list (#1034) rests on: the stored preference is never
// what gets rendered directly — it is held to what the window can fit, so the
// inspector can't be squeezed away and the list can't be dragged into uselessness.

describe('clampListWidth', () => {
	it('keeps a width that fits both panes', () => {
		expect(clampListWidth(600, 1400)).toBe(600);
	});

	it('leaves the inspector its minimum', () => {
		expect(clampListWidth(1300, 1400)).toBe(1400 - DETAIL_MIN);
	});

	it('never goes below the list minimum, however narrow the window', () => {
		expect(clampListWidth(100, 1400)).toBe(LIST_MIN);
		// A window too small for both minimums: the list keeps its own.
		expect(clampListWidth(900, 500)).toBe(LIST_MIN);
	});

	it('treats an unmeasured container as no ceiling, so the first paint is not narrow', () => {
		expect(clampListWidth(900, 0)).toBe(900);
		expect(clampListWidth(900)).toBe(900);
	});

	it('rounds to whole pixels', () => {
		expect(clampListWidth(512.4, 1400)).toBe(512);
	});

	it('falls back to the default for a value that isn’t a number', () => {
		expect(clampListWidth(Number.NaN, 1400)).toBe(LIST_DEFAULT);
	});
});
