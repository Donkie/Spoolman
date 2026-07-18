import { getInfo } from '$lib/api/info';

// Runtime info served once at startup from GET /info. Kept in a tiny store so
// components can read operator-configured values (like the external library's
// display name) without each re-fetching /info.

class ServerInfo {
	// Display name for the external filament library (EXTERNAL_DB_NAME on the
	// backend, "SpoolmanDB" by default). Used as the label/badge for external
	// results and interpolated into localized strings via the {name} parameter.
	externalDbName = $state('SpoolmanDB');
	loaded = $state(false);

	async load() {
		try {
			const info = await getInfo();
			if (info.external_db_name) this.externalDbName = info.external_db_name;
		} catch (e) {
			console.error('Failed to load server info', e);
		} finally {
			this.loaded = true;
		}
	}
}

export const serverInfo = new ServerInfo();
