<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import ProgressBar from '../ProgressBar.svelte';
	import { rowIdentity, type RowContext, type SpoolVM } from '$lib/utils/library';
	import * as params from '$lib/library/params';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		vm: SpoolVM;
		showSwatch?: boolean;
		indent?: number;
		/** Listing context — drops whatever the enclosing group already implies. */
		context?: RowContext;
	}

	let { vm, showSwatch = false, indent = 14, context = 'flat' }: Props = $props();

	let identity = $derived(rowIdentity(vm, context));
	let selected = $derived(params.isSelected(page.url.searchParams, 'spool', String(vm.spool.id)));
</script>

<button
	class="row"
	class:selected
	class:archived={vm.spool.archived}
	style="padding-left:{indent}px"
	onclick={() => params.select('spool', String(vm.spool.id))}
>
	<span class="id mono">{vm.idLabel}</span>
	{#if showSwatch}
		<Swatch colors={vm.filament.colors} direction={vm.filament.multiColorDirection} size={22} />
	{/if}
	<span class="name">
		{#if identity.title}<span class="title">{identity.title}</span>{/if}
		{#if identity.sub}<span class="sub">{identity.sub}</span>{/if}
	</span>
	{#if vm.spool.archived}
		<span class="tag">{m['spool.fields.archived']()}</span>
	{/if}
	<ProgressBar value={vm.pctValue} danger={vm.low} width="56px" />
	<span class="rem mono" class:low={vm.low}>{vm.remLabel}</span>
	<span class="right">{vm.location}</span>
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 8px 14px;
		border: none;
		border-top: 1px solid var(--hairline);
		border-left: 2px solid transparent;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row.selected {
		background: var(--accent-wash);
		border-left-color: var(--accent);
	}
	.row.archived .id,
	.row.archived .name {
		opacity: 0.55;
	}
	.tag {
		flex: none;
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
	}
	.id {
		font-size: 11px;
		color: var(--text-muted);
		width: 36px;
		flex: none;
	}
	.name {
		min-width: 0;
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title {
		font-weight: 600;
		font-size: 12.5px;
	}
	.sub {
		font-size: 11px;
		color: var(--text-dim);
	}
	.rem {
		font-size: 11px;
		color: var(--text-2);
		width: 44px;
		text-align: right;
		flex: none;
	}
	.rem.low {
		color: var(--danger-soft);
	}
	.right {
		font-size: 11px;
		color: var(--text-dim);
		width: 96px;
		text-align: right;
		flex: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	@media (max-width: 860px) {
		.right {
			display: none;
		}
		.name {
			flex: 1;
		}
	}
</style>
