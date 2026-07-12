<script lang="ts">
	import { page } from '$app/stores';

	const tabs = [
		{ href: '/', label: 'Library' },
		{ href: '/locations', label: 'Locations' },
		{ href: '/settings', label: 'Settings' }
	];

	function isActive(href: string): boolean {
		const path = $page.url.pathname;
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="tabs">
	{#each tabs as tab (tab.href)}
		<a href={tab.href} class="tab" class:active={isActive(tab.href)}>{tab.label}</a>
	{/each}
</nav>

<style>
	.tabs {
		display: flex;
		gap: 2px;
		align-self: stretch;
		align-items: stretch;
	}
	.tab {
		display: flex;
		align-items: center;
		padding: 0 14px;
		font-weight: 400;
		font-size: 13px;
		color: var(--text-dim);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
	}
	.tab:hover {
		color: var(--text);
	}
	.tab.active {
		font-weight: 600;
		color: var(--text);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
</style>
