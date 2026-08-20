// Which Library groups the user has collapsed, remembered per browser.
//
// This is a reading preference, not part of what a Library URL means: a link is
// worth sharing because of its search/filters/sort, and stapling "…and these
// nine groups are shut" onto it would say nothing about the data. So it lives in
// localStorage next to the other per-browser preferences (theme, low-stock
// threshold) rather than in the address bar.
//
// Only the COLLAPSED groups are stored, so expanded stays the default: a library
// that grows a new filament shows it, and a key that no longer matches anything
// (a renamed location, a deleted filament) is simply never asked about again.

const KEY = 'spoolman-v2-collapsed-groups';

/** Storage identity of a group row — the same pair the list keys its rows on. */
export function groupId(field: string, key: string): string {
	return `${field}:${key}`;
}

class CollapsedGroups {
	// Reassigned, never mutated in place, so Svelte sees each change. A handful of
	// keys at most, so a plain array's membership test is cheaper than a Set's
	// reactivity wrapper.
	#ids = $state<string[]>([]);

	constructor() {
		this.#ids = read();
	}

	has(id: string): boolean {
		return this.#ids.includes(id);
	}

	toggle(id: string) {
		this.#ids = this.has(id) ? this.#ids.filter((x) => x !== id) : [...this.#ids, id];
		write(this.#ids);
	}
}

function read(): string[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		// Corrupt entry or storage disabled: everything just starts expanded.
		return [];
	}
}

function write(ids: string[]) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, JSON.stringify(ids));
	} catch {
		/* nothing to do — remembering the collapse is a convenience, not a requirement */
	}
}

export const collapsedGroups = new CollapsedGroups();
