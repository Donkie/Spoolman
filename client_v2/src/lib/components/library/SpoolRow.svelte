<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import ProgressBar from '../ProgressBar.svelte';
	import type { SpoolVM } from '$lib/utils/library';
	import * as params from '$lib/library/params';
	import { page } from '$app/state';

	interface Props {
		vm: SpoolVM;
		showSwatch?: boolean;
		indent?: number;
	}

	let { vm, showSwatch = false, indent = 14 }: Props = $props();

	let selected = $derived(params.isSelected(page.url.searchParams, 'spool', String(vm.spool.id)));
</script>

<button
	class="row"
	class:selected
	style="padding-left:{indent}px"
	onclick={() => params.select('spool', String(vm.spool.id))}
>
	<span class="id mono">{vm.idLabel}</span>
	{#if showSwatch}
		<Swatch colors={vm.filament.colors} size={22} />
	{/if}
	<span class="name">
		<span class="title">{vm.name}</span>
		<span class="sub">{vm.sub}</span>
	</span>
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
		color: #b8b8b8;
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
