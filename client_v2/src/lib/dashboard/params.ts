import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// The dashboard's view mode — which field its cards group by — lives in the URL, so a
// particular board can be bookmarked and shared. It is also mirrored to localStorage, so
// arriving at a bare /dashboard brings back the view you last looked at.
//
// The URL always wins when it says something: a bookmark has to mean what it says, even
// when this browser was last left on a different view. The parameter is written even for
// the default field rather than being omitted, so "no parameter" unambiguously means
// "nothing asked for" and the remembered view can take over.

export const FIELD_PARAM = 'by';

const LAST_VIEW_KEY = 'spoolman-v2-dashboard-field';

/** The field key the URL asks for, or null when it doesn't say. */
export function fieldKeyFromUrl(params: URLSearchParams): string | null {
	return params.get(FIELD_PARAM);
}

/** The view this browser was last left on, if any. */
export function rememberedFieldKey(): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(LAST_VIEW_KEY);
	} catch {
		// Private-mode / storage-disabled browsers: the URL and the default still work.
		return null;
	}
}

export function rememberFieldKey(key: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(LAST_VIEW_KEY, key);
	} catch {
		/* nothing to do — remembering the view is a convenience, not a requirement */
	}
}

/**
 * Point the address bar at `key`'s board.
 *
 * `replace` swaps the current history entry, used when canonicalising a URL that didn't
 * name a view; picking a view from the menu pushes, so Back returns to the previous board.
 */
export function gotoField(key: string, replace = false): void {
	// A bare `?query` resolves against the current URL, so this is base-path-independent.
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	goto(`?${FIELD_PARAM}=${encodeURIComponent(key)}`, {
		replaceState: replace,
		keepFocus: true,
		noScroll: true
	});
}
