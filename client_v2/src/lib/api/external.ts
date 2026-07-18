import { getJson } from './http';

// SpoolmanDB (external filament database). The filament catalog is large (thousands of
// entries), so we never download it whole — filament searches go through the backend
// `/external/filament/search` endpoint (see spoolSource.searchExternalFilaments). The
// materials list below is tiny and still fetched in full for the new-filament presets.

export interface ExternalFilament {
	id: string;
	manufacturer: string;
	name: string;
	material: string;
	density: number;
	weight: number;
	spool_weight?: number;
	diameter: number;
	color_hex?: string;
	color_hexes?: string[];
	extruder_temp?: number;
	bed_temp?: number;
	multi_color_direction?: string;
}

export interface ExternalMaterial {
	material: string;
	density: number;
	extruder_temp: number | null;
	bed_temp: number | null;
}

let matCache: Promise<ExternalMaterial[]> | null = null;

/** SpoolmanDB material presets (density + temps), used to auto-fill new filaments. */
export function getExternalMaterials(): Promise<ExternalMaterial[]> {
	matCache ??= getJson<ExternalMaterial[]>('/external/material').catch((e) => {
		matCache = null;
		throw e;
	});
	return matCache;
}

/** Colors for an external filament (multi- or single-color). */
export function externalColors(ext: ExternalFilament): string[] {
	if (ext.color_hexes && ext.color_hexes.length) return ext.color_hexes.map((h) => '#' + h.replace(/^#/, ''));
	if (ext.color_hex) return ['#' + ext.color_hex.replace(/^#/, '')];
	return [];
}
