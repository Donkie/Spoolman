import { describe, expect, it } from 'vitest';
import { layoutMargin, sheetGrid } from './paper';
import { DEFAULT_LAYOUT, type PrintLayout } from './types';

// Issue #1149: a QL-700 preset carried over from v1, which allowed margins down
// to -20mm. Negative margins made sheetGrid think a 34mm page fit two rows, and
// made the safe-zone inset (safe - margin) larger than the label itself.
const ql700: PrintLayout = {
	...DEFAULT_LAYOUT,
	paper: 'custom',
	custom: { w: 62, h: 34 },
	columns: 1,
	spacing: { h: 0, v: 0 },
	margin: { t: -20, b: -20, l: -20, r: -20 },
	safe: { t: 1.5, b: 1.5, l: 0, r: 0 }
};

describe('layoutMargin', () => {
	it('clamps negative margins to zero', () => {
		expect(layoutMargin(ql700)).toEqual({ t: 0, b: 0, l: 0, r: 0 });
	});

	it('leaves non-negative margins alone', () => {
		expect(layoutMargin(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT.margin);
	});
});

describe('sheetGrid', () => {
	it('fits one label per page when the page is the label', () => {
		const grid = sheetGrid(ql700, { w: 62, h: 34 });
		expect([grid.cols, grid.rows, grid.perPage]).toEqual([1, 1, 1]);
		expect(grid.fits).toBe(true);
	});
});
