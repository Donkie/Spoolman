// How wide the Library's list column is, remembered per browser.
//
// Like the collapsed-group set (see stores/collapsedGroups) this is a reading
// preference, not part of what a Library URL means — a link is worth sharing for
// its search/filters/sort, not for how the sharer sized their panes — so it lives
// in localStorage rather than in the address bar.
//
// A stored width wider than the current window is kept as-is and only clamped for
// display: someone who sized the list on a big monitor gets that width back there
// after working in a narrow window, instead of having it quietly whittled down.

const KEY = 'spoolman-v2-list-width';

/** Narrowest the list may get. Below this the row's fixed columns (id, fill,
 *  remaining, location) leave the filament name almost nothing, and the toolbar's
 *  Group/Sort cluster — which can't shrink — starts crowding the Filter chip even
 *  with its labels dropped. */
export const LIST_MIN = 340;

/** Default width — must match --list-w in app.css, which styles the pane until
 *  this store's value is applied. */
export const LIST_DEFAULT = 470;

/** Width the inspector keeps no matter how far the splitter is dragged; its
 *  field grid stops being readable much below this. */
export const DETAIL_MIN = 360;

/**
 * The list width to actually render: the preference, held within [LIST_MIN, max]
 * where max leaves the inspector DETAIL_MIN. Pass the width available to both
 * panes; omit it (or pass 0, as on the first paint before the container has been
 * measured) to clamp against the minimum only.
 */
export function clampListWidth(px: number, available = 0): number {
	if (!Number.isFinite(px)) return LIST_DEFAULT;
	const max = available > 0 ? Math.max(LIST_MIN, available - DETAIL_MIN) : Infinity;
	return Math.round(Math.min(Math.max(px, LIST_MIN), max));
}

class ListWidth {
	#px = $state(LIST_DEFAULT);

	constructor() {
		this.#px = read();
	}

	/** The remembered width, before clamping to the current window. */
	get px(): number {
		return this.#px;
	}

	/** Follow a drag in progress. Deliberately not persisted — a drag is one
	 *  decision, not sixty, and localStorage writes are synchronous. */
	set(px: number) {
		this.#px = clampListWidth(px);
	}

	/** Remember the width the user settled on (end of a drag, an arrow key, a
	 *  double-click reset). */
	commit(px: number) {
		this.set(px);
		write(this.#px);
	}
}

function read(): number {
	if (typeof localStorage === 'undefined') return LIST_DEFAULT;
	try {
		const raw = localStorage.getItem(KEY);
		return raw === null ? LIST_DEFAULT : clampListWidth(Number(raw));
	} catch {
		// Corrupt entry or storage disabled: the default width is no worse than
		// what every first-time visitor gets.
		return LIST_DEFAULT;
	}
}

function write(px: number) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, String(px));
	} catch {
		/* nothing to do — remembering the width is a convenience, not a requirement */
	}
}

export const listWidth = new ListWidth();
