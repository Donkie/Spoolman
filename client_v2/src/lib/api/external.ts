import { getJson } from './http';

// SpoolmanDB (external filament database). The catalog is large (thousands of
// entries) and static-ish, so we fetch it once and filter client-side, mirroring
// the original frontend.

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

let cache: Promise<ExternalFilament[]> | null = null;

export function getExternalFilaments(): Promise<ExternalFilament[]> {
	cache ??= getJson<ExternalFilament[]>('/external/filament').catch((e) => {
		cache = null; // allow retry on failure
		throw e;
	});
	return cache;
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
