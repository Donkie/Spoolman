import { getExternalMaterials } from '$lib/api/external';
import { spoolSource } from '$lib/api/spoolSource';

/** Density + optional print temps for a known material, keyed by lowercased name. */
export interface MaterialSpec {
	density: number;
	nozzle: number | null;
	bed: number | null;
}

// Common 3D-printing materials with their typical densities (g/cm³). These are
// always offered for selection and map to a density, even when SpoolmanDB is
// unreachable; SpoolmanDB presets (with temps) merge on top where available.
// Densities are kept in sync with SpoolmanDB's materials.json
// (https://github.com/Donkie/SpoolmanDB/blob/main/materials.json) — note the
// merge only overrides on exact (lowercased) name match, so SpoolmanDB's
// longer names (e.g. "Flexible (TPU)", "Polycarbonate (PC)") won't refine
// these short keys at runtime; the values below must match on their own.
export const COMMON_MATERIALS: { name: string; density: number }[] = [
	{ name: 'PLA', density: 1.24 },
	{ name: 'PETG', density: 1.27 },
	{ name: 'ABS', density: 1.04 },
	{ name: 'ASA', density: 1.05 },
	{ name: 'TPU', density: 1.21 },
	{ name: 'Nylon', density: 1.52 },
	{ name: 'PC', density: 1.3 },
	{ name: 'PVA', density: 1.23 },
	{ name: 'HIPS', density: 1.03 },
	{ name: 'PP', density: 0.9 }
];

export interface MaterialList {
	names: string[];
	specs: Record<string, MaterialSpec>;
}

// Memoized for the app session: the suggestion list is fetched once and shared by
// every caller (each open of AddSpoolModal, each FilamentInspector mount). The
// tradeoff is a newly-added material won't appear in the autocomplete until a
// reload — fine for a suggestion list. A failed load isn't cached (see below).
let cache: Promise<MaterialList> | null = null;

/**
 * Build the material suggestion list. Merges the built-in {@link COMMON_MATERIALS},
 * the materials already used in the local catalog, and SpoolmanDB's presets — each
 * source failing independently (all default to empty). Returns the sorted, unique
 * list of names plus a lookup of specs (density/temps) keyed by lowercased name.
 *
 * The result is cached for the session; the underlying fetches never run more than
 * once (barring a failure, which clears the cache so the next call retries).
 */
export function loadMaterials(): Promise<MaterialList> {
	cache ??= buildMaterials().catch((e) => {
		cache = null;
		throw e;
	});
	return cache;
}

async function buildMaterials(): Promise<MaterialList> {
	const [localMats, extMats] = await Promise.all([
		spoolSource.materials().catch(() => [] as string[]),
		getExternalMaterials().catch(() => [])
	]);
	const specs: Record<string, MaterialSpec> = {};
	const names = new Set<string>(localMats);
	// Seed with the built-in common materials first…
	for (const mat of COMMON_MATERIALS) {
		specs[mat.name.toLowerCase()] = { density: mat.density, nozzle: null, bed: null };
		names.add(mat.name);
	}
	// …then let SpoolmanDB presets (with temps) refine/extend them.
	for (const mat of extMats) {
		specs[mat.material.toLowerCase()] = {
			density: mat.density,
			nozzle: mat.extruder_temp,
			bed: mat.bed_temp
		};
		names.add(mat.material);
	}
	return { names: [...names].sort(), specs };
}
