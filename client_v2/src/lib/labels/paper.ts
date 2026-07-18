import type { PaperName, PrintLayout } from './types';

// Paper sizes in millimeters (portrait). Custom sizes come from the layout.
const PAPER_MM: Record<Exclude<PaperName, 'custom'>, { w: number; h: number }> = {
	A4: { w: 210, h: 297 },
	A3: { w: 297, h: 420 },
	A5: { w: 148, h: 210 },
	Letter: { w: 215.9, h: 279.4 },
	Legal: { w: 215.9, h: 355.6 }
};

export const PAPER_NAMES: PaperName[] = ['A4', 'A3', 'A5', 'Letter', 'Legal', 'custom'];

/** Resolve a layout's paper size to concrete mm dimensions, honoring orientation. */
export function paperSize(layout: PrintLayout): { w: number; h: number } {
	const base = layout.paper === 'custom' ? layout.custom : PAPER_MM[layout.paper];
	return layout.landscape ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
}

/** 1 inch = 25.4 mm. */
export const MM_PER_INCH = 25.4;

/** Convert millimeters to CSS pixels at 96 dpi (the web reference density). */
export function mmToCssPx(mm: number): number {
	return (mm / MM_PER_INCH) * 96;
}

/**
 * Pixels-per-mm needed so that a raster export lands at `dpi` dots per inch.
 * Used as the Konva layer scale when rendering labels for print.
 */
export function pxPerMmForDpi(dpi: number): number {
	return dpi / MM_PER_INCH;
}

export interface SheetGrid {
	cols: number;
	rows: number;
	perPage: number;
	cellW: number;
	cellH: number;
	/** Total width the grid occupies (mm): cols labels plus the gaps between them. */
	gridW: number;
	/** False when the grid is wider than the usable page width (labels would overflow). */
	fits: boolean;
}

/**
 * Compute the sheet grid. The label size is fixed by the design, so the user picks
 * the column count and the rows are auto-fitted down the usable height. Because
 * columns are chosen freely, the grid can be wider than the page — `fits` reports
 * that so the UI can warn instead of silently overflowing.
 */
export function sheetGrid(layout: PrintLayout, label: { w: number; h: number }): SheetGrid {
	const page = paperSize(layout);
	const usableW = page.w - layout.margin.l - layout.margin.r;
	const usableH = page.h - layout.margin.t - layout.margin.b;
	// Fall back to an auto column fit for older saved layouts that predate `columns`.
	const cols =
		layout.columns && layout.columns > 0
			? Math.floor(layout.columns)
			: Math.max(1, Math.floor((usableW + layout.spacing.h) / (label.w + layout.spacing.h)));
	const rows = Math.max(1, Math.floor((usableH + layout.spacing.v) / (label.h + layout.spacing.v)));
	const gridW = cols * label.w + (cols - 1) * layout.spacing.h;
	return { cols, rows, perPage: cols * rows, cellW: label.w, cellH: label.h, gridW, fits: gridW <= usableW };
}
