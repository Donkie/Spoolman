import { getSettings, setSetting, parseSetting } from '$lib/api/settings';

// The dashboard's saved layout: which cards a field's board shows, in what order, and
// the order of the spools inside each card. Both are stored per grouped-by field, so
// switching the view mode brings back that view's own arrangement.
//
// A group key is the field's value; the empty string is the "unassigned" card.

export interface DashboardLayout {
	/** field key → ordered group keys. */
	groups: Record<string, string[]>;
	/** field key → group key → ordered spool ids. */
	spoolOrders: Record<string, Record<string, number[]>>;
}

/** The field key whose layout the pre-dashboard location board's settings describe. */
const SEEDED_FIELD = 'location';

export async function loadLayout(signal?: AbortSignal): Promise<DashboardLayout> {
	const s = await getSettings(signal);
	const groups = parseSetting<Record<string, string[]>>(s.dashboard_groups, {});
	const spoolOrders = parseSetting<Record<string, Record<string, number[]>>>(s.dashboard_spoolorders, {});

	// Before the dashboard there was a location-only board, whose layout lived in
	// `locations` / `locations_spoolorders`. Those keys still belong to the old client, so
	// they are read as a one-time seed for the location view and never written back — an
	// upgrade keeps the shelves it had, and the old client keeps working unchanged.
	if (!groups[SEEDED_FIELD]) {
		const seed = parseSetting<string[]>(s.locations, []).filter((l) => l != null);
		if (seed.length) groups[SEEDED_FIELD] = seed;
	}
	if (!spoolOrders[SEEDED_FIELD]) {
		const seed = parseSetting<Record<string, number[]>>(s.locations_spoolorders, {});
		if (Object.keys(seed).length) spoolOrders[SEEDED_FIELD] = seed;
	}

	return { groups, spoolOrders };
}

export function saveGroups(groups: DashboardLayout['groups']): void {
	setSetting('dashboard_groups', groups).catch((e) => console.error('Failed to save dashboard groups', e));
}

export function saveSpoolOrders(spoolOrders: DashboardLayout['spoolOrders']): void {
	setSetting('dashboard_spoolorders', spoolOrders).catch((e) =>
		console.error('Failed to save dashboard spool order', e)
	);
}
