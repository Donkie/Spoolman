import type { LabelExportFormat, RenderedLabel } from './types';
import * as m from '$lib/paraglide/messages';

// The label raster saved as-is, plus the one piece of metadata the canvas cannot
// give us: physical resolution.
//
// A label design is authored in millimeters and rasterized at the layout's DPI, but
// `canvas.toDataURL()` writes no `pHYs` chunk, so readers fall back to 96 dpi. A
// 50×25mm label exported at 300 dpi then opens as a ~156×78mm image, and printing it
// "at 100%" produces a label three times too big. Stamping `pHYs` with the real
// density makes the pixels resolve back to the millimeters they were designed in.
//
// (AML has no such problem — it carries the label size in mm in its own header.)

/** Decode a base64 string to its raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Length of a chunk's non-payload bytes: 4 length + 4 type + 4 CRC. */
const CHUNK_OVERHEAD = 12;
/** `pHYs` unit specifier 1 = pixels per metre (0 would mean "aspect ratio only"). */
const UNIT_METRE = 1;
const METRES_PER_INCH = 0.0254;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32 over `bytes`, as PNG computes it across a chunk's type and data. */
function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
	);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = (value >>> 24) & 0xff;
	bytes[offset + 1] = (value >>> 16) & 0xff;
	bytes[offset + 2] = (value >>> 8) & 0xff;
	bytes[offset + 3] = value & 0xff;
}

function chunkType(bytes: Uint8Array, offset: number): string {
	return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function isPng(bytes: Uint8Array): boolean {
	return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Build a complete `pHYs` chunk (length, type, data, CRC) at `ppm` pixels per metre. */
function physChunk(ppm: number): Uint8Array {
	const chunk = new Uint8Array(9 + CHUNK_OVERHEAD);
	writeUint32(chunk, 0, 9);
	chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
	writeUint32(chunk, 8, ppm); // pixels per unit, X axis
	writeUint32(chunk, 12, ppm); // pixels per unit, Y axis
	chunk[16] = UNIT_METRE;
	writeUint32(chunk, 17, crc32(chunk.subarray(4, 17)));
	return chunk;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/**
 * Return `bytes` with a `pHYs` chunk declaring `dpi`, replacing any existing one.
 *
 * The chunk is inserted directly after `IHDR`, which satisfies PNG's requirement
 * that `pHYs` precede the first `IDAT`. Anything that doesn't parse cleanly as a
 * chunk stream is returned untouched — a slightly wrong DPI is a far better failure
 * than a corrupted download.
 */
export function setPngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
	if (!isPng(bytes) || !Number.isFinite(dpi) || dpi <= 0) return bytes;
	const ppm = Math.round(dpi / METRES_PER_INCH);
	if (ppm <= 0 || ppm > 0xffffffff) return bytes;

	const parts: Uint8Array[] = [bytes.subarray(0, 8)];
	let offset = 8;
	let inserted = false;

	while (offset + CHUNK_OVERHEAD <= bytes.length) {
		const length = readUint32(bytes, offset);
		const end = offset + CHUNK_OVERHEAD + length;
		if (end > bytes.length) return bytes; // truncated stream — leave it alone
		const type = chunkType(bytes, offset + 4);

		// Drop any existing pHYs; ours replaces it.
		if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
		if (!inserted && type === 'IHDR') {
			parts.push(physChunk(ppm));
			inserted = true;
		}

		offset = end;
		if (type === 'IEND') break;
	}

	// No IHDR, or trailing bytes we don't understand: don't rewrite what we can't parse.
	if (!inserted || offset !== bytes.length) return bytes;
	return concat(parts);
}

/**
 * The label raster itself. This is the format to feed to an image editor or a
 * printer driver that takes plain bitmaps.
 */
export const pngFormat: LabelExportFormat = {
	id: 'png',
	extension: 'png',
	mimeType: 'image/png',
	// Already deflated by the PNG encoder — store it and skip a pointless pass.
	zipLevel: 0,
	label: () => m['labels.exportFormatOptions.png'](),
	description: ({ w, h }) => m['labels.exportDescPng']({ w, h }),
	encode: (label: RenderedLabel) => setPngDpi(base64ToBytes(label.base64), label.dpi)
};
