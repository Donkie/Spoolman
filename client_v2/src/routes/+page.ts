import type { PageLoad } from './$types';
import { parseLibraryState } from '$lib/library/params';

// The URL is the single source of truth for the Library view. This load parses
// the query string into typed state that flows to the page as `data.state`;
// SvelteKit re-runs it on every navigation (links, goto, back/forward), so the
// view follows the address bar for free. Runs client-side only (ssr=false in
// +layout.ts); data fetching stays in the components.
export const load: PageLoad = ({ url }) => {
	return { state: parseLibraryState(url.searchParams) };
};
