<script lang="ts">
	import { page } from '$app/stores';

	const tabs = [
		{ href: '/', label: 'Library' },
		{ href: '/locations', label: 'Locations' },
		{ href: '/labels', label: 'Labels' },
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
