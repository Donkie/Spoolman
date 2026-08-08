import type { LabelExportFormat, RenderedLabel } from './types';
import * as m from '$lib/paraglide/messages';

// AML is the label-document format of the LPAPI printer SDK, which is what the
// companion apps of most cheap thermal label printers (Phomemo/Aimo, Niimbot,
// Detonger, Puty and friends) read and write. There is no published spec, so the
// structure below is modelled field-for-field on real .aml files written by those
// apps — see aml.test.ts, which pins the exact shape.
//
// The document is XML: a header carrying the physical label geometry in
// millimeters, then one `<WdPage>` that repeats that same header (the apps
// duplicate it — page settings can differ from document settings) and holds the
// page's objects in `<contents>`. We emit a single `<Image>` object covering the
// whole label, holding our rendered label as base64 PNG.
//
// Exporting an image rather than native Text/Barcode objects is deliberate. The
// designer's typography, wrapping and QR logo are ours, and re-expressing them as
// LPAPI primitives would render differently in every vendor app. A single image at
// the design's DPI prints exactly what the preview showed, and the app still knows
// the true physical size — so it scales to the loaded media instead of guessing at
// pixels, which is the part a bare PNG cannot express.

/** Byte-order mark. The vendor apps prefix their files with it; some readers rely on it. */
const BOM = '\uFEFF';

/** Escape a string for use as XML character data. `&` must be replaced first. */
export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Format a millimeter value the way the vendor apps do: plain decimal, trailing
 * zeros stripped, so a 50mm label writes `50` rather than `50.000`.
 */
function num(value: number): string {
	if (!Number.isFinite(value)) return '0';
	return String(Math.round(value * 1e6) / 1e6);
}

/**
 * A deterministic 32-character lowercase hex id, the shape the apps use for
 * object ids. Derived from the label name rather than randomly generated so the
 * same label always exports byte-identically, which keeps exports diffable and
 * the tests meaningful.
 */
function objectId(seed: string): string {
	let out = '';
	for (let block = 0; out.length < 32; block++) {
		let h = 0x811c9dc5 ^ block;
		for (let i = 0; i < seed.length; i++) {
			h ^= seed.charCodeAt(i);
			h = Math.imul(h, 0x01000193);
		}
		out += (h >>> 0).toString(16).padStart(8, '0');
	}
	return out.slice(0, 32);
}

/**
 * The geometry block that both the document root and its `<WdPage>` carry. The
 * apps write it twice verbatim, so we build it once and emit it in both places.
 */
function geometryFields(widthMm: number, heightMm: number): string {
	const widthIn = widthMm / 25.4;
	const heightIn = heightMm / 25.4;
	return `<isPrintHorizontal>0</isPrintHorizontal>
<labelHeight>${num(heightMm)}</labelHeight>
<labelWidth>${num(widthMm)}</labelWidth>
<paperName>Custom Label</paperName>
<validBoundsX>0</validBoundsX>
<validBoundsY>0</validBoundsY>
<validBoundsWidth>${num(widthMm)}</validBoundsWidth>
<validBoundsHeight>${num(heightMm)}</validBoundsHeight>
<paperType>0</paperType>
<paperDesc />
<paperBackground>#FFFFFFFF</paperBackground>
<paperForeground>#FF000000</paperForeground>
<DisplaySize_mm>${num(widthMm)}mm × ${num(heightMm)}mm</DisplaySize_mm>
<DisplaySize_in>${widthIn.toFixed(2)}" × ${heightIn.toFixed(2)}"</DisplaySize_in>
<isAutoHeight>0</isAutoHeight>
<isRotate180>0</isRotate180>
<leftBlank>0</leftBlank>
<rightBlank>0</rightBlank>
<isCustomSize>1</isCustomSize>
<columnCount>0</columnCount>
<rowCount>0</rowCount>
<marginLeft>0</marginLeft>
<marginTop>0</marginTop>
<marginRight>0</marginRight>
<marginBottom>0</marginBottom>
<cornerRadius>0</cornerRadius>
<paddingWidth>0</paddingWidth>
<paddingHeight>0</paddingHeight>
<isCustomTemplateSize>false</isCustomTemplateSize>
<templateHeight>0</templateHeight>
<templateWidth>0</templateWidth>`;
}

/** The single full-bleed `<Image>` object holding the rendered label. */
function imageObject(widthMm: number, heightMm: number, base64Png: string, seed: string): string {
	return `<Image>
<id>${objectId(seed)}</id>
<x>0</x>
<y>0</y>
<width>${num(widthMm)}</width>
<height>${num(heightMm)}</height>
<borderDisplay>0</borderDisplay>
<lineType>0</lineType>
<borderHeight>0.70555556</borderHeight>
<borderColor>#FF000000</borderColor>
<orientation>0</orientation>
<lockMovement>0</lockMovement>
<isTemplate>0</isTemplate>
<content>${base64Png}</content>
<categoryName />
<item />
<isFavorite>0</isFavorite>
<imageEffect>0</imageEffect>
<antiColor>0</antiColor>
</Image>`;
}

/**
 * Build the complete AML document for one label.
 *
 * The declared `version` is 1.3 — the version of the real files this generator
 * mirrors. Newer apps (1.6) add fields we deliberately do not invent; declaring
 * the version whose field set we actually emit is what keeps older and newer
 * readers both able to open the file.
 */
export function buildAmlXml(name: string, widthMm: number, heightMm: number, base64Png: string): string {
	const w = Number.isFinite(widthMm) ? widthMm : 0;
	const h = Number.isFinite(heightMm) ? heightMm : 0;
	const geometry = geometryFields(w, h);

	return `<?xml version="1.0" encoding="utf-8"?>
<LPAPI version="1.3">
${geometry}
<labelName>${escapeXml(name)}</labelName>
<Platform>win</Platform>
<contents>
<WdPage>
${geometry}
<masksToBoundsType>0</masksToBoundsType>
<borderDisplay>0</borderDisplay>
<lineType>0</lineType>
<borderWidth>0.70555556</borderWidth>
<borderHeight>0.70555556</borderHeight>
<borderColor>#FF000000</borderColor>
<isBorderTemplate>0</isBorderTemplate>
<lockMovement>0</lockMovement>
<bgImage />
<useBgImage>0</useBgImage>
<group />
<contents>
${imageObject(w, h, base64Png, name)}
</contents>
</WdPage>
</contents>
</LPAPI>
`;
}

export const amlFormat: LabelExportFormat = {
	id: 'aml',
	extension: 'aml',
	mimeType: 'application/xml',
	// XML tags around a base64 blob: both the markup and the ~33% base64 expansion
	// deflate well, so unlike PNG this is worth compressing.
	zipLevel: 6,
	label: () => m['labels.exportFormatOptions.aml'](),
	description: ({ w, h }) => m['labels.exportDescAml']({ w, h }),
	encode: (label: RenderedLabel) =>
		new TextEncoder().encode(BOM + buildAmlXml(label.name, label.widthMm, label.heightMm, label.base64))
};
