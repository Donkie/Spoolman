import { describe, it, expect } from 'vitest';
import { buildAmlXml, escapeXml, amlFormat } from './aml';
import type { RenderedLabel } from './types';

// AML has no published spec, so these tests pin our output against the field sets
// of real .aml files written by the vendor apps. The reference used throughout is
// a Phomemo PM-241-BT template shipped in
// star65806841/OpenBook, at
// cmake/pkg_common_resource/Config/AimoDetails/en-US/TemplateDetailsDir/PM-241-BT/2/
//   2375_eb5e9ae24b774c5736f429aafe792c73.aml
// (LPAPI version 1.3). If a future change alters the shape, it should be because a
// newer real-world sample says so — not because it looked tidier.

/** Field names of the reference file's document header, in order. */
const REFERENCE_HEADER_FIELDS = [
	'isPrintHorizontal',
	'labelHeight',
	'labelWidth',
	'paperName',
	'validBoundsX',
	'validBoundsY',
	'validBoundsWidth',
	'validBoundsHeight',
	'paperType',
	'paperDesc',
	'paperBackground',
	'paperForeground',
	'DisplaySize_mm',
	'DisplaySize_in',
	'isAutoHeight',
	'isRotate180',
	'leftBlank',
	'rightBlank',
	'isCustomSize',
	'columnCount',
	'rowCount',
	'marginLeft',
	'marginTop',
	'marginRight',
	'marginBottom',
	'cornerRadius',
	'paddingWidth',
	'paddingHeight',
	'isCustomTemplateSize',
	'templateHeight',
	'templateWidth'
];

/** Field names of the reference file's `<Image>` object, in order. */
const REFERENCE_IMAGE_FIELDS = [
	'id',
	'x',
	'y',
	'width',
	'height',
	'borderDisplay',
	'lineType',
	'borderHeight',
	'borderColor',
	'orientation',
	'lockMovement',
	'isTemplate',
	'content',
	'categoryName',
	'item',
	'isFavorite',
	'imageEffect',
	'antiColor'
];

/** Tag names appearing at one nesting level of `xml`, in document order. */
function tagNames(xml: string): string[] {
	return [...xml.matchAll(/<([A-Za-z_][\w.-]*)(?:\s*\/>|>)/g)].map((m) => m[1]);
}

/** Text content of the first `<tag>` in `xml`. */
function tagText(xml: string, tag: string): string | undefined {
	return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1];
}

const BASE64 = 'aVZCT1J3MEtHZ28=';
const label = (over: Partial<RenderedLabel> = {}): RenderedLabel => ({
	name: 'spoolman-spool-label-7',
	dataUrl: `data:image/png;base64,${BASE64}`,
	base64: BASE64,
	widthMm: 50,
	heightMm: 25,
	dpi: 300,
	...over
});

describe('buildAmlXml', () => {
	const xml = buildAmlXml('spoolman-spool-label-7', 50, 25, BASE64);

	it('declares the LPAPI version whose field set it emits', () => {
		expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
		expect(xml).toContain('<LPAPI version="1.3">');
		expect(xml.trimEnd().endsWith('</LPAPI>')).toBe(true);
	});

	it('emits the reference header fields, in order, at the document root', () => {
		// `<LPAPI version=…>` carries an attribute, so tagNames skips it and the
		// header fields are all that is left.
		const header = xml.slice(xml.indexOf('<LPAPI'), xml.indexOf('<labelName>'));
		expect(tagNames(header)).toEqual(REFERENCE_HEADER_FIELDS);
	});

	it('repeats the same geometry inside the WdPage, as the vendor apps do', () => {
		const page = xml.slice(xml.indexOf('<WdPage>'));
		expect(tagNames(page).slice(1, 1 + REFERENCE_HEADER_FIELDS.length)).toEqual(REFERENCE_HEADER_FIELDS);
	});

	it('carries the physical size in mm and inches', () => {
		expect(tagText(xml, 'labelWidth')).toBe('50');
		expect(tagText(xml, 'labelHeight')).toBe('25');
		expect(tagText(xml, 'DisplaySize_mm')).toBe('50mm × 25mm');
		// 50mm = 1.97", 25mm = 0.98"
		expect(tagText(xml, 'DisplaySize_in')).toBe('1.97" × 0.98"');
	});

	it('strips trailing zeros from millimeter values, as the reference does', () => {
		const fractional = buildAmlXml('x', 54.5, 25.4, BASE64);
		expect(tagText(fractional, 'labelWidth')).toBe('54.5');
		expect(tagText(fractional, 'labelHeight')).toBe('25.4');
		expect(tagText(fractional, 'DisplaySize_mm')).toBe('54.5mm × 25.4mm');
	});

	it('holds the raster in one full-bleed Image with the reference fields', () => {
		const image = xml.slice(xml.indexOf('<Image>'), xml.indexOf('</Image>'));
		expect(tagNames(image).slice(1)).toEqual(REFERENCE_IMAGE_FIELDS);
		expect(tagText(image, 'x')).toBe('0');
		expect(tagText(image, 'y')).toBe('0');
		expect(tagText(image, 'width')).toBe('50');
		expect(tagText(image, 'height')).toBe('25');
		expect(tagText(image, 'content')).toBe(BASE64);
	});

	it('gives the image a 32-character hex id, as the apps do', () => {
		const id = tagText(xml, 'id');
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('is deterministic — the same label always exports identically', () => {
		expect(buildAmlXml('spoolman-spool-label-7', 50, 25, BASE64)).toBe(xml);
		// …but distinct labels get distinct object ids.
		expect(tagText(buildAmlXml('other', 50, 25, BASE64), 'id')).not.toBe(tagText(xml, 'id'));
	});

	it('escapes the label name', () => {
		const named = buildAmlXml('PLA & <PETG>', 50, 25, BASE64);
		expect(tagText(named, 'labelName')).toBe('PLA &amp; &lt;PETG&gt;');
	});

	it('survives a non-finite label size rather than emitting NaN', () => {
		const broken = buildAmlXml('x', Number.NaN, 25, BASE64);
		expect(broken).not.toContain('NaN');
		expect(tagText(broken, 'labelWidth')).toBe('0');
	});
});

describe('escapeXml', () => {
	it('escapes the ampersand first, so entities are not double-escaped', () => {
		expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
	});
});

describe('amlFormat', () => {
	it('encodes to UTF-8 bytes behind a BOM, as the vendor apps write them', async () => {
		const bytes = await amlFormat.encode(label());
		expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
		// TextDecoder consumes the BOM itself, so what is left is exactly the document.
		expect(new TextDecoder().decode(bytes)).toBe(buildAmlXml('spoolman-spool-label-7', 50, 25, BASE64));
	});

	it('is registered as a compressible .aml file', () => {
		expect(amlFormat.id).toBe('aml');
		expect(amlFormat.extension).toBe('aml');
		// Unlike PNG, the XML + base64 payload is worth deflating in a zip.
		expect(amlFormat.zipLevel).toBeGreaterThan(0);
	});
});
