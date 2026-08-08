import { describe, it, expect } from 'vitest';
import { base64ToBytes, setPngDpi, pngFormat } from './png';
import type { RenderedLabel } from './types';

// A real 1×1 PNG, as produced by a canvas: signature, IHDR, IDAT, IEND, and no
// pHYs — which is exactly the shape our rasterizer hands us.
const PNG_1X1 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Walk a PNG's chunk stream, returning each chunk's type, payload and stored CRC. */
function chunks(bytes: Uint8Array) {
	const out: { type: string; data: Uint8Array; crc: number; raw: Uint8Array }[] = [];
	let offset = 8;
	while (offset + 12 <= bytes.length) {
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		const length = view.getUint32(offset);
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		out.push({
			type,
			data: bytes.subarray(offset + 8, offset + 8 + length),
			crc: view.getUint32(offset + 8 + length),
			raw: bytes.subarray(offset, offset + 12 + length)
		});
		offset += 12 + length;
	}
	return out;
}

/** Independent CRC-32, so the test does not trust the implementation under test. */
function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		c ^= bytes[i];
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return (c ^ 0xffffffff) >>> 0;
}

const source = base64ToBytes(PNG_1X1);

describe('the PNG fixture', () => {
	it('is a real PNG with no pHYs of its own', () => {
		const types = chunks(source).map((c) => c.type);
		expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
	});

	it('has a valid IHDR CRC, confirming the test walker and CRC agree with reality', () => {
		const ihdr = chunks(source)[0];
		expect(crc32(ihdr.raw.subarray(4, 8 + ihdr.data.length))).toBe(ihdr.crc);
	});
});

describe('setPngDpi', () => {
	it('inserts pHYs directly after IHDR, before the image data', () => {
		const types = chunks(setPngDpi(source, 300)).map((c) => c.type);
		expect(types).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
	});

	it('records the resolution in pixels per metre', () => {
		const phys = chunks(setPngDpi(source, 300)).find((c) => c.type === 'pHYs')!;
		const view = new DataView(phys.data.buffer, phys.data.byteOffset);
		// 300 dpi ÷ 0.0254 m/inch = 11811 px/m — the value every image editor
		// reads back as "300 dpi".
		expect(view.getUint32(0)).toBe(11811);
		expect(view.getUint32(4)).toBe(11811);
		expect(phys.data[8]).toBe(1); // unit specifier: metres
		expect(phys.data.length).toBe(9);
	});

	it('writes a pHYs CRC that validates', () => {
		const phys = chunks(setPngDpi(source, 300)).find((c) => c.type === 'pHYs')!;
		expect(crc32(phys.raw.subarray(4, 8 + phys.data.length))).toBe(phys.crc);
	});

	it('handles a thermal printer’s 203 dpi', () => {
		const phys = chunks(setPngDpi(source, 203)).find((c) => c.type === 'pHYs')!;
		expect(new DataView(phys.data.buffer, phys.data.byteOffset).getUint32(0)).toBe(7992);
	});

	it('replaces an existing pHYs instead of appending a second one', () => {
		const restamped = setPngDpi(setPngDpi(source, 300), 600);
		expect(chunks(restamped).map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
		const phys = chunks(restamped).find((c) => c.type === 'pHYs')!;
		expect(new DataView(phys.data.buffer, phys.data.byteOffset).getUint32(0)).toBe(23622);
	});

	it('leaves the pixels untouched', () => {
		const stamped = setPngDpi(source, 300);
		const idat = (b: Uint8Array) => chunks(b).find((c) => c.type === 'IDAT')!;
		expect([...idat(stamped).data]).toEqual([...idat(source).data]);
	});

	it.each([
		['a non-PNG', base64ToBytes('aGVsbG8gd29ybGQ='), 300],
		['an empty input', new Uint8Array(0), 300],
		['a truncated chunk stream', source.subarray(0, source.length - 4), 300],
		['a non-finite dpi', source, Number.NaN],
		['a zero dpi', source, 0]
	])('returns %s untouched rather than corrupting the download', (_label, bytes, dpi) => {
		expect(setPngDpi(bytes, dpi)).toBe(bytes);
	});
});

describe('pngFormat', () => {
	it('stamps the rendered label’s dpi as it encodes', async () => {
		const label: RenderedLabel = {
			name: 'spoolman-spool-label-7',
			dataUrl: `data:image/png;base64,${PNG_1X1}`,
			base64: PNG_1X1,
			widthMm: 50,
			heightMm: 25,
			dpi: 203
		};
		const phys = chunks(await pngFormat.encode(label)).find((c) => c.type === 'pHYs')!;
		expect(new DataView(phys.data.buffer, phys.data.byteOffset).getUint32(0)).toBe(7992);
	});

	it('is stored rather than deflated in a zip, being compressed already', () => {
		expect(pngFormat.zipLevel).toBe(0);
	});
});
