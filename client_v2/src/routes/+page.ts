import type { PageLoad } from './$types';
import { parseLibraryState } from '$lib/library/params';

// The URL is the single source of truth for the Library view. This load parses
// the query string into typed state that flows to the page as `data.state`;
// SvelteKit re-runs it on every navigation (links, goto, back/forward), so the
// view follows the address bar for free. Runs client-side only (ssr=false in
// +layout.ts); data fetching stays in the components.
//
// Kept a pure function of the URL. SvelteKit caches and preloads load results
// per URL, so reading the remembered view (lib/library/viewPrefs) here would
// hand back a state built from a preference that has since changed; the page
// restores it by navigating instead — see +page.svelte.
export const load: PageLoad = ({ url }) => {
	return { state: parseLibraryState(url.searchParams) };
};
