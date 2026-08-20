<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Both hrefs come from a src/lib/library/params.ts helper, which already resolves
	   against the deploy base path; resolving again would double-apply it. */
	import Swatch from '../Swatch.svelte';
	import MaterialBadge from '../MaterialBadge.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Factory from '@lucide/svelte/icons/factory';
	import type { GroupHeaderInfo } from '$lib/utils/library';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		group: GroupHeaderInfo;
		/** When the group maps to an entity (filament/vendor) this is the link to
		 *  its inspector, so the header is a real `<a>`. Absent for groupings with
		 *  no entity to open (material/location) — then it's inert. */
		href?: string;
		/** Filament groups: link to the manufacturer's inspector. Absent when the
		 *  filament has no manufacturer (the name then renders as a muted note). */
		vendorHref?: string;
		sticky?: boolean;
		/** Whether the group's spools are folded away behind this header. */
		collapsed?: boolean;
		ontoggle?: () => void;
	}

	let { group, href, vendorHref, sticky = false, collapsed = false, ontoggle }: Props = $props();
</script>

<!-- The row is three controls, not one: the body opens the group's entity (where it
     has one), the manufacturer opens ITS entity, and the disclosure at the trailing
     edge folds the spools away. They are siblings rather than nested — anchors can't
     nest, and all three should be real, keyboard-reachable controls.
     Living in the header — which is sticky — is what keeps the fold reachable while
     you are scrolled deep inside a long group, which is exactly when you want it.

     The entity link is only the title, but its stretched ::after (see the styles)
     extends its hit area over the whole row, so the row-wide click target survives
     the two links being siblings. That is also what makes `.main:hover` mean
     "anywhere on the row except the other two controls", which is the precision the
     hover affordance below needs. -->
<div class="header" class:sticky class:link={href}>
	{#if href}
		<!-- The entity link is an overlay covering the whole row, not a box around the
		     title: it has to be a sibling of the manufacturer link (anchors can't
		     nest), and covering the row keeps the generous click target the header
		     always had. It comes first so `~` can reach the title it labels. -->
		<a
			class="main"
			{href}
			aria-label={m['library.openGroup']({ name: group.title })}
			data-sveltekit-keepfocus
			data-sveltekit-noscroll
		></a>
	{/if}
	{#if group.colors.length}
		<Swatch colors={group.colors} direction={group.direction} size={24} radius={6} />
	{/if}
	<div class="body">
		<div class="line">
			<!-- A group header reads as a heading, and headings don't normally lead
			     anywhere — so the link has to say so itself, by taking the underline
			     and colour every link gets on hover. -->
			<span class="title">{group.title}</span>
			{#if group.badge}<MaterialBadge label={group.badge} />{/if}
		</div>
		{#if group.vendorName || group.subtitle}
			<div class="sub">
				<!-- The manufacturer is already printed on every filament group, so this
				     is the shortest possible route to one: no menu, no search, no detour
				     through a filament. Its own pill-shaped hover is what separates it
				     from the row-wide link it sits inside. -->
				{#if group.vendorName && vendorHref}
					<a
						class="vendor"
						href={vendorHref}
						title={m['library.openManufacturer']({ name: group.vendorName })}
						data-sveltekit-keepfocus
						data-sveltekit-noscroll
					>
						<Factory size={11} />
						<span class="vname">{group.vendorName}</span>
					</a>
				{:else if group.vendorName}
					<span class="vendor-none">{group.vendorName}</span>
				{/if}
				{#if group.vendorName && group.subtitle}<span class="dot" aria-hidden="true">·</span>{/if}
				{#if group.subtitle}<span class="stext">{group.subtitle}</span>{/if}
			</div>
		{/if}
	</div>
	<!-- The group's two aggregates, stacked to mirror the title/subtitle opposite
	     them: what it holds, and how much of it. The count is also what says the
	     rows below are ALL of this group's spools, not the first few. -->
	<div class="meta">
		<span class="weight">{group.meta}</span>
		<span class="count">{group.count}</span>
	</div>
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
		/* Positioned so the entity link's stretched ::after resolves against the row.
		   Nothing in here may clip overflow, or that hit area would be cut down to
		   whichever box does the clipping (hence the per-span truncation below). */
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 0 9px 14px;
		border-top: 1px solid var(--border-soft);
		border-left: 2px solid transparent;
		background: none;
		box-sizing: border-box;
	}
	/* Only entity-backed headers (filament/vendor) lead anywhere, so only they take
	   the row-wide hover; the other two controls keep their own on top of it. */
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
		min-width: 0;
	}
	/* The row-sized hit area itself: transparent and unpainted, it only takes clicks
	   and hovers. Sized by the row rather than by the title so assistive tooling and
	   tap-target audits measure the target people actually press. The manufacturer
	   link and the disclosure lift themselves above it. */
	.main {
		position: absolute;
		inset: 0;
		cursor: pointer;
	}
	/* The swatch is positioned (it layers its colour bands), so it would otherwise
	   paint above the overlay and swallow clicks on that corner of the row. It is
	   decorative here — the row's link is what it belongs to. */
	.header :global(.swatch) {
		pointer-events: none;
	}
	.title {
		font-weight: 600;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* Driven from the overlay, so the title reacts to the row being hovered anywhere
	   — but NOT to the two controls stacked above it, which lead somewhere else. */
	.main:hover ~ .body .title {
		color: var(--accent-link);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		font-size: 11px;
		color: var(--text-dim);
		margin-top: 2px;
	}
	.vname,
	.stext {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dot {
		flex: none;
	}
	/* Above the stretched link, or it would never be clickable. The padding makes it
	   a ~28px tap target (over the 24px WCAG 2.2 floor) while the matching negative
	   margin keeps it laid out as if it had none — so the header stays as tight as
	   it was and the name still lines up under the title. */
	.vendor {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		padding: 7px;
		margin: -7px;
		border-radius: var(--radius-sm);
		/* --accent-link is tuned for the lighter surfaces links normally sit on; on
		   the sunken header it only reaches 4.2:1 in the light theme. --accent-soft
		   is the same hue and clears AA on this surface in both themes (4.9 / 7.3). */
		color: var(--accent-soft);
		text-decoration: none;
		cursor: pointer;
	}
	.vendor:hover {
		background: var(--surface-raised);
		color: var(--accent-link-hover);
	}
	.vendor-none {
		font-style: italic;
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
	   easier to hit on a phone than the glyph, without drawing a heavier control.
	   Above the stretched link for the same reason the manufacturer is. */
	.disc {
		position: relative;
		z-index: 1;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 34px;
		margin: -9px 0;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-faint);
		cursor: pointer;
	}
	/* Its own hover, distinct from the row's, so the fold reads as a separate
	   control rather than as part of the link it sits next to. */
	.disc:hover {
		background: var(--surface-raised);
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
