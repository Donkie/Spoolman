<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import MaterialBadge from '../MaterialBadge.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { GroupHeaderInfo } from '$lib/utils/library';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		group: GroupHeaderInfo;
		/** When the group maps to an entity (filament/vendor) this is the link to
		 *  its inspector, so the header is a real `<a>`. Absent for groupings with
		 *  no entity to open (material/location) — then it's inert. */
		href?: string;
		sticky?: boolean;
		/** Whether the group's spools are folded away behind this header. */
		collapsed?: boolean;
		ontoggle?: () => void;
	}

	let { group, href, sticky = false, collapsed = false, ontoggle }: Props = $props();
</script>

<!-- The row is two controls, not one: the body opens the group's entity (where it
     has one), and the disclosure at the trailing edge folds its spools away. They
     are siblings rather than nested so both are real, keyboard-reachable controls.
     Living in the header — which is sticky — is what keeps the fold reachable while
     you are scrolled deep inside a long group, which is exactly when you want it. -->
<div class="header" class:sticky class:link={href}>
	<svelte:element
		this={href ? 'a' : 'div'}
		class="main"
		{href}
		data-sveltekit-keepfocus={href ? '' : undefined}
		data-sveltekit-noscroll={href ? '' : undefined}
	>
		{#if group.colors.length}
			<Swatch colors={group.colors} direction={group.direction} size={24} radius={6} />
		{/if}
		<div class="body">
			<div class="line">
				<span class="title">{group.title}</span>
				{#if group.badge}<MaterialBadge label={group.badge} />{/if}
			</div>
			{#if group.subtitle}<div class="sub">{group.subtitle}</div>{/if}
		</div>
		<!-- The group's two aggregates, stacked to mirror the title/subtitle opposite
		     them: what it holds, and how much of it. The count is also what says the
		     rows below are ALL of this group's spools, not the first few. -->
		<div class="meta">
			<span class="weight">{group.meta}</span>
			<span class="count">{group.count}</span>
		</div>
	</svelte:element>
	<button
		class="disc"
		type="button"
		aria-expanded={!collapsed}
		aria-label={collapsed ? m['library.expandGroup']() : m['library.collapseGroup']()}
		onclick={ontoggle}
	>
		<!-- The glyph turns, not the button: rotating the control itself would swing
		     its box (and hit area) out past the edge of the row. -->
		<span class="chev" class:open={!collapsed}><ChevronRight size={15} /></span>
	</button>
</div>

<style>
	.header {
		display: flex;
		align-items: stretch;
		width: 100%;
		border-top: 1px solid var(--border-soft);
		border-left: 2px solid transparent;
		background: none;
		box-sizing: border-box;
	}
	/* Only entity-backed headers (filament/vendor) lead anywhere, so only they take
	   the row-wide hover; the disclosure keeps its own, quieter one either way. */
	.header.link:hover {
		background: var(--surface-2);
	}
	.header.sticky {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface-sunken);
	}
	.main {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding: 9px 0 9px 14px;
		color: inherit;
		text-align: left;
		text-decoration: none;
		font: inherit;
	}
	.header.link .main {
		cursor: pointer;
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
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		flex: none;
		white-space: nowrap;
	}
	.weight {
		font-size: 11px;
		color: var(--text-muted);
	}
	.count {
		font-size: 10.5px;
		color: var(--text-faint);
	}
	/* Full-height so the hit target is the whole right edge of the header — far
	   easier to hit on a phone than the glyph, without drawing a heavier control. */
	.disc {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 34px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-faint);
		cursor: pointer;
	}
	.disc:hover {
		color: var(--text-2);
	}
	.chev {
		display: flex;
		transition: transform 0.12s ease;
	}
	.chev.open {
		transform: rotate(90deg);
	}
</style>
