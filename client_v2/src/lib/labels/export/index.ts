import type { ExportFormatId, LabelExportFormat } from './types';
import { pngFormat } from './png';
import { amlFormat } from './aml';

export type { ExportFormatId, ExportedFile, LabelExportFormat, RenderedLabel } from './types';

/**
 * Every format the label designer can export to, in the order the picker shows
 * them. Registering a module here is the only wiring a new format needs.
 */
export const EXPORT_FORMATS: LabelExportFormat[] = [pngFormat, amlFormat];

/** The format used when a design has none saved, or an unrecognized one. */
export const DEFAULT_EXPORT_FORMAT: ExportFormatId = 'png';

/**
 * Look up a format by id, falling back to PNG. Designs persist their chosen
 * format by id, so this also guards against ids written by a newer client (or
 * hand-edited into the setting) that this build doesn't know about.
 */
export function resolveExportFormat(id: string | undefined): LabelExportFormat {
	return EXPORT_FORMATS.find((f) => f.id === id) ?? pngFormat;
}
