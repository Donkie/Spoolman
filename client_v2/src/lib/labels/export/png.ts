import type { LabelExportFormat, RenderedLabel } from './types';
import * as m from '$lib/paraglide/messages';

/** Decode a base64 string to its raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * The label raster itself, saved as-is. This is the format to feed to an image
 * editor or a printer driver that takes plain bitmaps.
 */
export const pngFormat: LabelExportFormat = {
	id: 'png',
	extension: 'png',
	mimeType: 'image/png',
	// Already deflated by the PNG encoder — store it and skip a pointless pass.
	zipLevel: 0,
	label: () => m['labels.exportFormatOptions.png'](),
	description: ({ w, h }) => m['labels.exportDescPng']({ w, h }),
	encode: (label: RenderedLabel) => base64ToBytes(label.base64)
};
