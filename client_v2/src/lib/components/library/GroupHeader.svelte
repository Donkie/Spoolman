<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import MaterialBadge from '../MaterialBadge.svelte';
	import type { GroupHeaderInfo } from '$lib/utils/library';

	interface Props {
		group: GroupHeaderInfo;
		onclick?: () => void;
		sticky?: boolean;
	}

	let { group, onclick, sticky = false }: Props = $props();
</script>

<button class="header" class:sticky {onclick}>
	<Swatch colors={group.colors} direction={group.direction} size={24} radius={6} />
	<div class="body">
		<div class="line">
			<span class="title">{group.title}</span>
			{#if group.badge}<MaterialBadge label={group.badge} />{/if}
		</div>
		{#if group.subtitle}<div class="sub">{group.subtitle}</div>{/if}
	</div>
	<div class="meta">{group.meta}</div>
</button>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		border: none;
		border-top: 1px solid var(--border-soft);
		border-left: 2px solid transparent;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.header:hover {
		background: var(--surface-2);
	}
	.header.sticky {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface-sunken);
	}
	.body {
		min-width: 0;
		flex: 1;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 7px;
		white-space: nowrap;
		overflow: hidden;
	}
	.title {
		font-weight: 600;
		font-size: 13px;
	}
	.sub {
		font-size: 11px;
		color: var(--text-dim);
		margin-top: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		font-size: 11px;
		color: var(--text-muted);
		flex: none;
		text-align: right;
	}
</style>
