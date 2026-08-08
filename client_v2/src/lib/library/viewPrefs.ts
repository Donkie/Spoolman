// The grouping and sort order the Library was last laid out with, remembered
// per browser.
//
// Everything about a Library view lives in the URL (see library/params), which
// makes a view linkable and survives a reload — but only for as long as the
// address bar carries it. Every other route links back to a bare `/`, so a trip
// to Settings, the nav tab, or a bookmark used to hand back the factory view and
// a user who works grouped by location had to re-pick it several times a day
// (#1036). Arriving on a URL that says nothing about the view now means "however
// I had it last"; one that does say something still wins outright, so a link
// shows its recipient what its sender saw.
//
// The preference is applied by NAVIGATING to the URL that spells it out (see
// params.rememberedViewHref), never by parsing it into the state behind the
// URL's back. Everything downstream — linkability, SvelteKit's per-URL load
// cache, one URL per distinct view — depends on the address bar being the whole
// truth about what's on screen.
//
// Only grouping and sort are remembered. Filters, search and archived-visibility
// hide spools, and a hidden filter silently restored days later reads as missing
// data rather than as a preference.

const KEY = 'spoolman-v2-library-view';

/**
 * A remembered view. `group` is whatever was stored rather than a GroupMode:
 * this module only guarantees the shape, and params.rememberedViewHref has the
 * final say on whether the string names a grouping that still exists.
 */
export interface StoredView {
	group: string;
	sortKey: string;
	sortAsc: boolean;
}

/** Rebuild a stored view from its JSON, or null if there isn't a usable one. */
export function parseStoredView(raw: string | null): StoredView | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const { group, sort, asc } = parsed as Record<string, unknown>;
		if (typeof group !== 'string' || typeof sort !== 'string' || typeof asc !== 'boolean') {
			return null;
		}
		return { group, sortKey: sort, sortAsc: asc };
	} catch {
		// Corrupt entry: the shipped view is no worse than what a first-time
		// visitor gets.
		return null;
	}
}

// Read once and kept here: parseLibraryState runs for every row's href, and a
// getItem + JSON.parse per link would be paid on every render. `undefined` means
// "not looked at yet", `null` means "nothing worth restoring".
let cached: StoredView | null | undefined;

/** The remembered view, or null when this browser has no usable one. */
export function rememberedView(): StoredView | null {
	if (cached === undefined) {
		cached = parseStoredView(read());
	}
	return cached;
}

/** Record the view the user just navigated to, so the next bare URL restores it. */
export function rememberView(view: StoredView): void {
	const prev = rememberedView();
	if (prev && prev.group === view.group && prev.sortKey === view.sortKey && prev.sortAsc === view.sortAsc) {
		// Selecting a spool or turning a page navigates too; only the changes that
		// actually move the view are worth a synchronous localStorage write.
		return;
	}
	cached = view;
	write(view);
}

function read(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(KEY);
	} catch {
		// Storage disabled (private mode, blocked third-party context).
		return null;
	}
}

function write(view: StoredView): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ group: view.group, sort: view.sortKey, asc: view.sortAsc }));
	} catch {
		/* nothing to do — remembering the view is a convenience, not a requirement */
	}
}
