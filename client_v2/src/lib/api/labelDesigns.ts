import { getJson } from './http';
import { setSetting, parseSetting, type SettingResponse } from './settings';
import type { LabelDesign } from '$lib/labels/types';

// Label designs are stored as a JSON array in the `label_designs` server setting
// (registered in spoolman/settings.py), mirroring how v1 stored `print_presets`.

export async function getDesigns(): Promise<LabelDesign[]> {
	const s = await getJson<SettingResponse>('/setting/label_designs');
	return parseSetting<LabelDesign[]>(s, []);
}

export async function saveDesigns(designs: LabelDesign[]): Promise<void> {
	await setSetting('label_designs', designs);
}
