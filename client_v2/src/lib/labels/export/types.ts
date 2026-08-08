// The contract between the label rasterizer and the file formats it can be
// saved as. `print.ts` renders each selected spool/filament to a PNG raster once,
// wraps it in a {@link RenderedLabel}, and hands it to the {@link LabelExportFormat}
// chosen in the print panel — so adding a new output format means adding one
// module here and registering it, with no changes to the render or download path.

/**
 * One rasterized label, ready to be encoded into an export file. The raster is
 * always a PNG (that's what Konva gives us); formats that embed an image reuse
 * `base64` directly rather than re-encoding the pixels.
 */
export interface RenderedLabel {
	/** Filename without extension — the format appends its own. */
	name: string;
	/** `data:image/png;base64,…` for the rendered label. */
	dataUrl: string;
	/** Just the base64 payload of {@link dataUrl}, without the `data:` prefix. */
	base64: string;
	/** Physical label size in mm, as designed. */
	widthMm: number;
	heightMm: number;
	/** Resolution the raster was produced at, in dots per inch. */
	dpi: number;
}

/** A file produced from a {@link RenderedLabel}. */
export interface ExportedFile {
	/** Filename including extension. */
	name: string;
	bytes: Uint8Array;
	mimeType: string;
}

/** Ids of the formats the label designer can export to. */
export type ExportFormatId = 'png' | 'aml';

export interface LabelExportFormat {
	id: ExportFormatId;
	/** Filename extension, without the dot. */
	extension: string;
	mimeType: string;
	/**
	 * Deflate level to use when this format is bundled into a zip. PNG payloads
	 * are already deflated, so re-compressing them only burns time (0 = store);
	 * text-based wrappers around them still compress well at the tag level.
	 */
	zipLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
	/** Name shown in the format picker. */
	label: () => string;
	/** One-line explanation of what the exported file is, shown under the picker. */
	description: (size: { w: number; h: number }) => string;
	/** Encode one rendered label into this format's file bytes. */
	encode: (label: RenderedLabel) => Uint8Array | Promise<Uint8Array>;
}
