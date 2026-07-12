<script lang="ts">
	import SpoolInspector from './SpoolInspector.svelte';
	import FilamentInspector from './FilamentInspector.svelte';
	import VendorInspector from './VendorInspector.svelte';
	import type { Selection } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';

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
		<div class="ring"></div>
		<p>Select a spool, filament or vendor from the list to see its details here.</p>
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
	.ring {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 8px solid var(--accent);
		opacity: 0.4;
	}
	.empty p {
		max-width: 280px;
	}
</style>
