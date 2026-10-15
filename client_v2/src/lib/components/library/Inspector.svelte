<script lang="ts">
	import { untrack } from 'svelte';
	import { asset } from '$app/paths';
	import SpoolInspector from './SpoolInspector.svelte';
	import FilamentInspector from './FilamentInspector.svelte';
	import VendorInspector from './VendorInspector.svelte';
	import type { Selection } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import * as m from '$lib/paraglide/messages';

	let { selection }: { selection: Selection | null } = $props();

	let sel = $derived(selection);
	let spool = $derived(sel?.kind === 'spool' ? inventory.spoolById(Number(sel.id)) : undefined);
	let filament = $derived(sel?.kind === 'filament' ? inventory.filamentById(sel.id) : undefined);
	let vendor = $derived(sel?.kind === 'vendor' ? inventory.vendorById(sel.id) : undefined);
	let found = $derived(spool ?? filament ?? vendor);

	// Deep-link resolution: the cache is only filled by the list, search and live
	// events, so a selection reached by bookmark/QR/shared link (e.g. ?sel=spool:2)
	// may not be present. When it isn't, fetch that one entity by id and upsert it
	// so the inspector renders instead of the empty state. `attempted` guards
	// against re-fetching the same missing id on every reactive tick (and against a
	// 404 looping forever). A later live/list event that fills the cache supersedes
	// this — `found` becomes truthy and the effect no longer fires a fetch.
	// Plain, non-reactive guard: it must NOT be `$state`, or writing it below would
	// re-trigger this effect and the re-run's cleanup would abort the fetch we just
	// started (leaving the pane stuck on "Loading…"). It only needs to survive
	// across runs to stop a genuine miss / 404 from re-fetching every tick.
	let attempted = '';
	let loading = $state(false);
	// The effect follows the selection by value, not by object. Arriving on the
	// Library rewrites the URL to restore the remembered view (see +page.svelte),
	// which parses the same selection into a new object; following the object
	// re-ran the effect mid-fetch and its cleanup aborted the request (#1243).
	let key = $derived(sel ? `${sel.kind}:${sel.id}` : '');
	$effect(() => {
		const k = key;
		if (!k || found) return;
		if (attempted === k) return;
		attempted = k;
		loading = true;

		const s = untrack(() => sel)!;
		const ctrl = new AbortController();
		let pending = true;
		const done = (err?: unknown) => {
			if (ctrl.signal.aborted) return; // superseded; the run that aborted it owns `loading`
			pending = false;
			if (err) console.warn('deep-link fetch failed', err);
			loading = false;
		};
		const p =
			s.kind === 'spool'
				? spoolSource.fetchSpool(Number(s.id), ctrl.signal)
				: s.kind === 'filament'
					? spoolSource.fetchFilament(s.id, ctrl.signal)
					: spoolSource.fetchVendor(s.id, ctrl.signal);
		p.then(() => done()).catch(done);

		return () => {
			// Cancelled before it answered: forget the attempt, so whichever run
			// comes next asks again instead of waiting on a request that is gone.
			if (pending) attempted = '';
			ctrl.abort();
		};
	});
</script>

{#if spool}
	<SpoolInspector {spool} />
{:else if filament}
	<FilamentInspector {filament} />
{:else if vendor}
	<VendorInspector {vendor} />
{:else if sel && loading}
	<div class="empty">
		<p>{m['inspector.loading']()}</p>
	</div>
{:else if sel}
	<div class="empty">
		<img class="mark" src={asset('/spoolman.svg')} alt="" width="56" height="56" />
		<p>{m['inspector.notFound']()}</p>
	</div>
{:else}
	<div class="empty">
		<img class="mark" src={asset('/spoolman.svg')} alt="" width="56" height="56" />
		<p>{m['inspector.empty']()}</p>
	</div>
{/if}

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		height: 100%;
		padding: 40px;
		text-align: center;
		color: var(--text-dim);
		font-size: 13px;
	}
	.mark {
		opacity: 0.45;
	}
	.empty p {
		max-width: 280px;
	}
</style>
