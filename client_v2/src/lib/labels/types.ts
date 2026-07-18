// Label-designer data model. All geometry is in millimeters — device-independent
// so the same design renders identically on screen (mm→px at an editor scale) and
// on paper (mm→px at the printer's DPI). Designs are persisted as a JSON array in
// the `label_designs` server setting (see $lib/api/labelDesigns).

export type ElementType = 'qr' | 'text' | 'swatch' | 'rect';

/** Fields common to every element: an id and a top-left position in mm. */
interface BaseElement {
	id: string;
	type: ElementType;
	/** Top-left corner, millimeters from the label's top-left. */
	x: number;
	y: number;
}

/** A QR code encoding a link back to the spool. Always square. */
export interface QrElement extends BaseElement {
	type: 'qr';
	/** Side length in mm. */
	size: number;
	/**
	 * Error-correction level. Fixed at 'H' (highest redundancy) so a centre logo
	 * never breaks scanning; not exposed in the UI.
	 */
	ec: 'L' | 'M' | 'Q' | 'H';
	/**
	 * `scheme` → `WEB+SPOOLMAN:S-<id>` (compact, scanned by the Spoolman apps).
	 * `url` → `<base_url>/spool/show/<id>` (opens in any browser).
	 */
	encoding: 'scheme' | 'url';
	/** Draw the Spoolman logo in the centre of the code. */
	logo: boolean;
}

/** A text block whose `template` may contain `{placeholder}` tags resolved per spool. */
export interface TextElement extends BaseElement {
	type: 'text';
	/** Wrap width in mm. Height grows with content. */
	w: number;
	/** Font size in mm. */
	fontSize: number;
	bold: boolean;
	align: 'left' | 'center' | 'right';
	color: string;
	/**
	 * When true (default), text wraps within `w`. When false, each line stays on
	 * one line and any overflow past `w` is clipped (hidden).
	 */
	wrap: boolean;
	/** e.g. "**{filament.name}**\n{filament.material}" — see labels/template.ts. */
	template: string;
}

/** A rectangle filled with the spool's filament color(s). */
export interface SwatchElement extends BaseElement {
	type: 'swatch';
	w: number;
	h: number;
	/** Corner radius in mm. */
	radius: number;
}

/** A static rectangle / border for decoration (no per-spool data). */
export interface RectElement extends BaseElement {
	type: 'rect';
	w: number;
	h: number;
	radius: number;
	/** Fill color, or '' for no fill (outline only). */
	fill: string;
	stroke: string;
	/** Stroke width in mm. */
	strokeWidth: number;
}

export type LabelElement = QrElement | TextElement | SwatchElement | RectElement;

export interface LabelDesign {
	id: string;
	name: string;
	/** Physical label size in mm. */
	label: { w: number; h: number };
	elements: LabelElement[];
	/** Sheet/label print layout, saved per-design (see PrintLayout below). */
	layout: PrintLayout;
}

// --- Print layout ----------------------------------------------------------

export type PaperName = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'custom';

export interface PrintLayout {
	/** `sheet` tiles many labels on one page; `label` prints one label per page. */
	mode: 'sheet' | 'label';
	paper: PaperName;
	/** Used when `paper === 'custom'`, in mm. */
	custom: { w: number; h: number };
	landscape: boolean;
	/**
	 * Page margins in mm (sheet mode only): where the label grid begins, measured
	 * from the paper edges. These size and position the grid.
	 */
	margin: { t: number; b: number; l: number; r: number };
	/**
	 * Printer safe-zone in mm (sheet mode only): how close to the paper edge the
	 * printer can actually print. Unlike `margin` this does NOT move the grid — it
	 * only insets the content of the edge labels inward when the safe-zone is larger
	 * than the corresponding margin, so nothing gets clipped by the printer.
	 */
	safe: { t: number; b: number; l: number; r: number };
	/**
	 * Number of columns in the sheet grid (sheet mode only). The label size is fixed
	 * by the design, so the user picks how many of those labels sit side by side;
	 * rows then fill down the page automatically. (Label width × columns can exceed
	 * the paper — the panel warns when it does.)
	 */
	columns: number;
	/** Gap between adjacent labels in mm (sheet mode only). */
	spacing: { h: number; v: number };
	/** Blank cells to skip before the first label (for reusing partial sheets). */
	skip: number;
	/** Copies of each selected spool's label. */
	copies: number;
	/** Cut-guide drawing around each cell. */
	border: 'none' | 'border';
}

export const DEFAULT_LAYOUT: PrintLayout = {
	mode: 'sheet',
	paper: 'A4',
	custom: { w: 50, h: 25 },
	landscape: false,
	margin: { t: 10, b: 10, l: 10, r: 10 },
	safe: { t: 0, b: 0, l: 0, r: 0 },
	columns: 3,
	spacing: { h: 2, v: 2 },
	skip: 0,
	copies: 1,
	border: 'none'
};

/** A fresh empty design with a sensible default size and one QR element. */
export function newDesign(id: string): LabelDesign {
	return {
		id,
		name: 'Untitled label',
		label: { w: 50, h: 25 },
		layout: structuredClone(DEFAULT_LAYOUT),
		elements: [
			{ id: `${id}-qr`, type: 'qr', x: 2, y: 2, size: 21, ec: 'H', encoding: 'scheme', logo: true },
			{
				id: `${id}-t`,
				type: 'text',
				x: 25,
				y: 3,
				w: 23,
				fontSize: 3,
				bold: true,
				align: 'left',
				color: '#000000',
				wrap: true,
				template: '**{filament.name}**\n{filament.material}\n#{spool.id}'
			}
		]
	};
}
