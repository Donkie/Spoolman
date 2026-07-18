import { getJson } from './http';
import { setSetting, parseSetting, type SettingResponse } from './settings';
import { DEFAULT_LAYOUT, type LabelDesign } from '$lib/labels/types';

// Label designs are stored as a JSON array in the `label_designs` server setting
// (registered in spoolman/settings.py), mirroring how v1 stored `print_presets`.

// Designs created before the print layout became per-design lack a `layout`;
// backfill it (and any newly-added layout fields) from the defaults on load.
function normalize(design: LabelDesign): LabelDesign {
	return { ...design, layout: { ...DEFAULT_LAYOUT, ...design.layout } };
}

/**
 * Load the designs and report whether the setting has ever been written.
 * `isSet === false` means a fresh install (or a user who never opened the v1
 * designer), which is the signal to attempt a one-time import of v1 presets.
 */
export async function getDesignsSetting(): Promise<{ designs: LabelDesign[]; isSet: boolean }> {
	const s = await getJson<SettingResponse>('/setting/label_designs');
	return { designs: parseSetting<LabelDesign[]>(s, []).map(normalize), isSet: s?.is_set ?? false };
}

export async function saveDesigns(designs: LabelDesign[]): Promise<void> {
	await setSetting('label_designs', designs);
}
