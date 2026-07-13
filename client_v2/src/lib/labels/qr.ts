import QRCode from 'qrcode';
import type { Spool } from '$lib/types';
import type { QrElement } from './types';

// QR content + geometry. The QR encodes a link back to the spool. Two forms,
// both understood by Spoolman's scanner (client/src/components/qrCodeScanner.tsx):
//   scheme → WEB+SPOOLMAN:S-<id>            (compact custom URI)
//   url    → <base_url>/spool/show/<id>     (opens in a browser)

export interface QrContext {
	baseUrl: string;
}

/** Build the string encoded in a QR element for a given spool. */
export function qrContent(el: QrElement, spool: Spool, ctx: QrContext): string {
	if (el.encoding === 'url') {
		const root = ctx.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
		return `${root.replace(/\/$/, '')}/spool/show/${spool.id}`;
	}
	return `WEB+SPOOLMAN:S-${spool.id}`;
}

/** A square boolean module grid for the given text. */
export function qrModules(
	text: string,
	ec: QrElement['ec']
): { count: number; dark: (r: number, c: number) => boolean } {
	const qr = QRCode.create(text || ' ', { errorCorrectionLevel: ec });
	const count = qr.modules.size;
	const data = qr.modules.data;
	return {
		count,
		dark: (r, c) => data[r * count + c] === 1
	};
}

/**
 * SVG path `data` (in mm) for the dark modules of a QR code that fits in a
 * `sizeMm × sizeMm` box. Rendered as a single Konva.Path so it stays crisp at
 * any export DPI. Returns an empty string if the text can't be encoded.
 */
export function qrPathData(text: string, ec: QrElement['ec'], sizeMm: number): string {
	let grid: { count: number; dark: (r: number, c: number) => boolean };
	try {
		grid = qrModules(text, ec);
	} catch {
		return '';
	}
	const m = sizeMm / grid.count;
	let d = '';
	for (let r = 0; r < grid.count; r++) {
		for (let c = 0; c < grid.count; c++) {
			if (grid.dark(r, c)) {
				const x = c * m;
				const y = r * m;
				d += `M${x} ${y}h${m}v${m}h${-m}z`;
			}
		}
	}
	return d;
}
