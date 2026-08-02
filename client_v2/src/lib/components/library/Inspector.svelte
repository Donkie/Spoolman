<script lang="ts">
	import { asset } from '$app/paths';
	import SpoolInspector from './SpoolInspector.svelte';
	import FilamentInspector from './FilamentInspector.svelte';
	import VendorInspector from './VendorInspector.svelte';
	import type { Selection } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { isAbortError } from '$lib/api/http';
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
	$effect(() => {
		const s = sel;
		if (!s || found) return;
		const key = `${s.kind}:${s.id}`;
		if (attempted === key) return;
		attempted = key;
		loading = true;

		const ctrl = new AbortController();
		const done = (err?: unknown) => {
			if (isAbortError(err, ctrl.signal)) return; // superseded selection; leave loading for the next run
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

		return () => ctrl.abort();
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
