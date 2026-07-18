<script lang="ts">
	import { asset } from '$app/paths';
	import SpoolInspector from './SpoolInspector.svelte';
	import FilamentInspector from './FilamentInspector.svelte';
	import VendorInspector from './VendorInspector.svelte';
	import type { Selection } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import * as m from '$lib/paraglide/messages';

	let { selection }: { selection: Selection | null } = $props();

	let sel = $derived(selection);
	let spool = $derived(sel?.kind === 'spool' ? inventory.spoolById(Number(sel.id)) : undefined);
	let filament = $derived(sel?.kind === 'filament' ? inventory.filamentById(sel.id) : undefined);
	let vendor = $derived(sel?.kind === 'vendor' ? inventory.vendorById(sel.id) : undefined);
</script>

{#if spool}
	<SpoolInspector {spool} />
{:else if filament}
	<FilamentInspector {filament} />
{:else if vendor}
	<VendorInspector {vendor} />
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
