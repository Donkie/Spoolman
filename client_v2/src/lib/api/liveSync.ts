import { live } from './live';
import { inventory } from '$lib/stores/inventory.svelte';

// Central live-sync: one subscription per resource that funnels remote events
// into the reactive cache. Because every detail view (inspectors, locations)
// reads the cache reactively, this single hook makes all cache-backed data
// live — no per-component wiring needed. The paginated list keeps its OWN
// subscription (it fetches server-paged data outside the cache; see FilamentList).
//
// Call once from the root layout.
export function startLiveSync(): () => void {
	const offs = (['spool', 'filament', 'vendor'] as const).map((resource) =>
		live.subscribe(resource, {}, (event) => inventory.ingest(event))
	);
	return () => offs.forEach((off) => off());
}
