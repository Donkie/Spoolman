import { getJson } from '$lib/api/http';
import { parseSetting, type SettingResponse } from '$lib/api/settings';
import { paperSize } from './paper';
import {
	DEFAULT_LAYOUT,
	type LabelDesign,
	type LabelElement,
	type PaperName,
	type PrintLayout
} from './types';

// One-time transfer of the v1 client's print presets (the `print_presets` server
// setting) into v2 label designs. The v1 label was a fixed QR-left / text-right
// layout with a text template; the v2 designer is far more capable, but the
// default QR-code-plus-textbox design produced here reproduces the old look. The
// layout (paper, margins, spacing, columns, safe-zone, skip, copies, border) maps
// essentially 1-1; the template's field paths are rewritten to the v2 names.

// --- v1 shapes (subset we read) --------------------------------------------
// Mirrors client/src/pages/printing/printing.tsx.

interface V1PrintSettings {
	name?: string;
	margin?: { top: number; bottom: number; left: number; right: number };
	printerMargin?: { top: number; bottom: number; left: number; right: number };
	spacing?: { horizontal: number; vertical: number };
	columns?: number;
	rows?: number;
	skipItems?: number;
	itemCopies?: number;
	paperSize?: string;
	customPaperSize?: { width: number; height: number };
	borderShowMode?: 'none' | 'border' | 'grid';
}
interface V1LabelSettings {
	showContent?: boolean;
	showQRCodeMode?: 'no' | 'simple' | 'withIcon';
	textSize?: number;
	printSettings?: V1PrintSettings;
}
interface V1Preset {
	template?: string;
	labelSettings?: V1LabelSettings;
}

// The v1 default template (used when a preset stored no explicit template), before
// path rewriting. Kept verbatim from spoolQrCodePrintingDialog.tsx.
const V1_DEFAULT_TEMPLATE = `**{filament.vendor.name} - {filament.name}
#{id} - {filament.material}**
Spool Weight: {filament.spool_weight} g
{ET: {filament.settings_extruder_temp} °C}
{BT: {filament.settings_bed_temp} °C}
{Lot Nr: {lot_nr}}
{{comment}}
{filament.comment}
{filament.vendor.comment}`;

// v1 placeholder path → v2 resolver path (see labels/template.ts). Paths already
// identical in both (filament.name/material/price/density/diameter/weight/comment,
// filament.registered) are omitted — they pass through unchanged. Paths with no v2
// equivalent (e.g. remaining_length, archived) are left as-is and resolve to "?".
const PATH_MAP: Record<string, string> = {
	// Spool
	id: 'spool.id',
	registered: 'spool.registered',
	first_used: 'spool.firstUsed',
	last_used: 'spool.lastUsed',
	location: 'spool.location',
	lot_nr: 'spool.lot',
	comment: 'spool.comment',
	price: 'spool.price',
	remaining_weight: 'spool.remaining',
	initial_weight: 'spool.initial',
	used_weight: 'spool.used',
	// Filament
	'filament.spool_weight': 'filament.spoolWeight',
	'filament.settings_extruder_temp': 'filament.nozzleTemp',
	'filament.settings_bed_temp': 'filament.bedTemp',
	'filament.color_hex': 'filament.color',
	'filament.article_number': 'filament.articleNumber',
	'filament.external_id': 'filament.externalId',
	// Vendor (v1 nested it under filament)
	'filament.vendor.name': 'vendor.name',
	'filament.vendor.comment': 'vendor.comment',
	'filament.vendor.empty_spool_weight': 'vendor.emptyWeight',
	'filament.vendor.external_id': 'vendor.externalId',
	'filament.vendor.registered': 'vendor.registered'
};

/** Rewrite a v1 template's `{path}` tokens to the v2 field paths. */
export function migrateTemplate(template: string): string {
	let out = template;
	// Extra-field prefixes: v1 spool extras are bare `extra.*`; vendor extras are
	// nested under filament. Do the longer vendor form first.
	out = out.split('{filament.vendor.extra.').join('{vendor.extra.');
	out = out.split('{extra.').join('{spool.extra.');
	// Fixed paths. A path always sits inside its own braces (both the bare `{path}`
	// and the wrapped `{prefix{path}suffix}` forms), so replacing `{v1}` → `{v2}`
	// is unambiguous.
	for (const [v1, v2] of Object.entries(PATH_MAP)) {
		out = out.split(`{${v1}}`).join(`{${v2}}`);
	}
	return out;
}

/** Map a v1 paper name to the closest v2 paper + custom dimensions. */
function mapPaper(ps: V1PrintSettings): { paper: PaperName; custom: { w: number; h: number } } {
	const known: PaperName[] = ['A4', 'A3', 'A5', 'Letter', 'Legal'];
	const custom = {
		w: ps.customPaperSize?.width ?? DEFAULT_LAYOUT.custom.w,
		h: ps.customPaperSize?.height ?? DEFAULT_LAYOUT.custom.h
	};
	const size = ps.paperSize ?? 'A4';
	// v2 dropped Tabloid — carry it over as a custom size so the sheet stays right.
	if (size === 'Tabloid') return { paper: 'custom', custom: { w: 279, h: 432 } };
	if (size === 'custom') return { paper: 'custom', custom };
	if (known.includes(size as PaperName)) return { paper: size as PaperName, custom };
	return { paper: 'A4', custom };
}

function mapLayout(ps: V1PrintSettings): PrintLayout {
	const { paper, custom } = mapPaper(ps);
	return {
		mode: 'sheet',
		paper,
		custom,
		landscape: false,
		margin: {
			t: ps.margin?.top ?? DEFAULT_LAYOUT.margin.t,
			b: ps.margin?.bottom ?? DEFAULT_LAYOUT.margin.b,
			l: ps.margin?.left ?? DEFAULT_LAYOUT.margin.l,
			r: ps.margin?.right ?? DEFAULT_LAYOUT.margin.r
		},
		safe: {
			t: ps.printerMargin?.top ?? 0,
			b: ps.printerMargin?.bottom ?? 0,
			l: ps.printerMargin?.left ?? 0,
			r: ps.printerMargin?.right ?? 0
		},
		columns: Math.max(1, Math.round(ps.columns ?? 3)),
		spacing: { h: ps.spacing?.horizontal ?? 0, v: ps.spacing?.vertical ?? 0 },
		skip: Math.max(0, ps.skipItems ?? 0),
		copies: Math.max(1, ps.itemCopies ?? 1),
		// v2 has no separate "grid" mode; fold it into a plain border.
		border: ps.borderShowMode === 'none' ? 'none' : 'border'
	};
}

/**
 * Recreate the v1 label size, which was derived from the grid rather than stored:
 * the usable area split into columns × rows, minus the spacing. Guarded so a
 * degenerate preset can't produce a zero/negative canvas.
 */
function deriveLabelSize(ps: V1PrintSettings, layout: PrintLayout): { w: number; h: number } {
	const page = paperSize(layout);
	const cols = layout.columns;
	const rows = Math.max(1, Math.round(ps.rows ?? 8));
	const usableW = page.w - layout.margin.l - layout.margin.r;
	const usableH = page.h - layout.margin.t - layout.margin.b;
	const w = (usableW - layout.spacing.h) / cols - layout.spacing.h;
	const h = (usableH - layout.spacing.v) / rows - layout.spacing.v;
	const round = (n: number) => Math.round(n * 10) / 10;
	return { w: Math.max(10, round(w)), h: Math.max(8, round(h)) };
}

/** Build the QR-left / text-right elements that reproduce the v1 label. */
function buildElements(
	ls: V1LabelSettings,
	id: string,
	size: { w: number; h: number },
	template: string
): LabelElement[] {
	const pad = 1;
	const mode = ls.showQRCodeMode ?? 'withIcon';
	const showQr = mode !== 'no';
	const showText = ls.showContent !== false;
	const elements: LabelElement[] = [];

	let textX = pad;
	if (showQr) {
		// Square QR pinned to the left, ~half the width, vertically centered.
		const qrSize = Math.max(6, Math.min(size.h - 2 * pad, size.w * 0.45));
		elements.push({
			id: `${id}-qr`,
			type: 'qr',
			x: pad,
			y: Math.max(pad, (size.h - qrSize) / 2),
			size: qrSize,
			ec: 'H',
			encoding: 'scheme',
			logo: mode === 'withIcon'
		});
		textX = pad + qrSize + pad;
	}

	if (showText) {
		elements.push({
			id: `${id}-t`,
			type: 'text',
			x: textX,
			y: pad,
			w: Math.max(4, size.w - textX - pad),
			fontSize: ls.textSize ?? 3,
			bold: false,
			align: 'left',
			color: '#000000',
			wrap: true,
			template
		});
	}
	return elements;
}

let counter = 0;
function uid(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return `v1-${Date.now()}-${counter++}`;
}

/** Convert a single v1 preset into a v2 design. */
export function presetToDesign(preset: V1Preset): LabelDesign {
	const id = uid();
	const ls = preset.labelSettings ?? {};
	const ps = ls.printSettings ?? {};
	const layout = mapLayout(ps);
	const label = deriveLabelSize(ps, layout);
	const template = migrateTemplate(preset.template ?? V1_DEFAULT_TEMPLATE);

	return {
		id,
		name: ps.name || 'Imported label',
		label,
		elements: buildElements(ls, id, label, template),
		layout
	};
}

/**
 * Read the v1 `print_presets` setting and convert it to v2 designs. Returns an
 * empty array when v1 was never used or on any error — this runs unattended at
 * first load and must never throw.
 */
export async function importV1Presets(): Promise<LabelDesign[]> {
	try {
		const s = await getJson<SettingResponse>('/setting/print_presets');
		if (!s?.is_set) return [];
		const presets = parseSetting<V1Preset[]>(s, []);
		if (!Array.isArray(presets) || presets.length === 0) return [];
		return presets.map(presetToDesign);
	} catch (e) {
		console.error('Failed to import v1 print presets', e);
		return [];
	}
}
