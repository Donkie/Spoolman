<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import MaterialBadge from '../MaterialBadge.svelte';
	import type { GroupHeaderInfo } from '$lib/utils/library';

	interface Props {
		group: GroupHeaderInfo;
		/** When the group maps to an entity (filament/vendor) this is the link to
		 *  its inspector, so the header is a real `<a>`. Absent for groupings with
		 *  no entity to open (material/location) — then it's inert. */
		href?: string;
		sticky?: boolean;
	}

	let { group, href, sticky = false }: Props = $props();
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	class="header"
	class:sticky
	class:link={href}
	{href}
	data-sveltekit-keepfocus={href ? '' : undefined}
	data-sveltekit-noscroll={href ? '' : undefined}
>
	<Swatch colors={group.colors} direction={group.direction} size={24} radius={6} />
	<div class="body">
		<div class="line">
			<span class="title">{group.title}</span>
			{#if group.badge}<MaterialBadge label={group.badge} />{/if}
		</div>
		{#if group.subtitle}<div class="sub">{group.subtitle}</div>{/if}
	</div>
	<div class="meta">{group.meta}</div>
</svelte:element>

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
		text-decoration: none;
		font: inherit;
		box-sizing: border-box;
	}
	/* Only entity-backed headers (filament/vendor) are links; the rest are inert. */
	.header.link {
		cursor: pointer;
	}
	.header.link:hover {
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
