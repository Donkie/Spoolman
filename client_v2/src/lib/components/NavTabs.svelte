<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';

	const tabs = [
		{ href: '/', label: m['nav.library'] },
		{ href: '/locations', label: m['locations.locations'] },
		{ href: '/labels', label: m['nav.labels'] },
		{ href: '/settings', label: m['settings.header'] }
	];

	function isActive(href: string): boolean {
		// Compare against the path with the deploy base path stripped off.
		const path = $page.url.pathname.slice(base.length) || '/';
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="tabs">
	{#each tabs as tab (tab.href)}
		<a href={base + tab.href} class="tab" class:active={isActive(tab.href)}>{tab.label()}</a>
	{/each}
</nav>

<style>
	.tabs {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.tab {
		display: flex;
		align-items: center;
		padding: 6px 12px;
		border-radius: var(--radius);
		font-weight: 400;
		font-size: 13px;
		color: var(--text-dim);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		transition:
			background 0.12s ease,
			color 0.12s ease;
	}
	.tab:hover {
		color: var(--text);
		background: var(--accent-wash-soft);
	}
	.tab.active {
		font-weight: 600;
		color: var(--accent-soft);
		background: var(--accent-wash);
	}
	.tab.active:hover {
		background: var(--accent-wash);
	}
</style>
