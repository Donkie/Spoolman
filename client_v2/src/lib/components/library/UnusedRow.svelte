<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import SpoolRow from './SpoolRow.svelte';
	import type { RowContext, SpoolVM } from '$lib/utils/library';
	import { isSelected } from '$lib/library/params';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		unused: SpoolVM[];
		showSwatch?: boolean;
		indent?: number;
		/** Listing context, forwarded to the expanded per-instance rows. */
		context?: RowContext;
	}

	let { unused, showSwatch = false, indent = 14, context = 'flat' }: Props = $props();

	// Unused spools (never drawn from — used_weight 0) of one filament are
	// collapsed into a single summary row. Clicking can't know *which* instance
	// the user wants, so instead of selecting one it expands to reveal the
	// individual spools, each selectable and distinguishable by its #id.
	let expanded = $state(false);

	let first = $derived(unused[0]);
	let sub = $derived(
		m['library.unusedSub']({
			weight: first.spool.initial,
			location: first.spool.location || m['library.unassigned']()
		})
	);

	// Auto-open when one of these spools becomes the active selection, while
	// still allowing the header to collapse it again afterwards.
	let hasSelected = $derived(
		unused.some((vm) => isSelected(page.url.searchParams, 'spool', String(vm.spool.id)))
	);
	$effect(() => {
		if (hasSelected) expanded = true;
	});
</script>

<button
	class="row"
	class:expanded
	style="padding-left:{indent}px"
	aria-expanded={expanded}
	onclick={() => (expanded = !expanded)}
>
	<span class="spacer"></span>
	{#if showSwatch}
		<Swatch colors={first.filament.colors} size={22} opacity={0.75} />
	{/if}
	<span class="label">
		<span class="fname">{first.filament.name}</span>
		<span class="badge mono">{m['library.nUnused']({ count: unused.length })}</span>
	</span>
	<span class="sub">{sub}</span>
	<span class="chev" class:open={expanded}>›</span>
</button>

{#if expanded}
	<div class="instances">
		{#each unused as vm (vm.spool.id)}
			<SpoolRow {vm} {showSwatch} indent={indent + 14} {context} />
		{/each}
	</div>
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 8px 14px;
		border: none;
		border-top: 1px solid var(--hairline);
		background: rgba(255, 255, 255, 0.015);
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.row:hover {
		background: var(--surface-2);
	}
	.spacer {
		width: 36px;
		flex: none;
	}
	.label {
		min-width: 0;
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.fname {
		font-weight: 600;
		font-size: 12.5px;
		color: var(--text-2);
	}
	.badge {
		font-size: 10.5px;
		font-weight: 600;
		padding: 0 6px;
		border-radius: 8px;
		background: var(--unused-bg);
		border: 1px solid var(--unused-border);
		color: var(--unused-text);
		margin-left: 6px;
	}
	.sub {
		font-size: 11px;
		color: var(--text-dim);
		flex: none;
	}
	.chev {
		color: #555;
		flex: none;
		transition: transform 0.12s ease;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.instances {
		background: rgba(255, 255, 255, 0.01);
	}
	@media (max-width: 860px) {
		.sub {
			display: none;
		}
	}
</style>
