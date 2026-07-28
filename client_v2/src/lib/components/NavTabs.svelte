<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { auth } from '$lib/stores/auth.svelte';

	// `show` decides whether a tab appears at all. Absent means always. The auth tabs
	// are hidden rather than disabled: with auth off there is no account for /account
	// to describe and no users for /users to list, so the pages would be empty rather
	// than merely restricted. This is cosmetic — the server gates the endpoints.
	interface Tab {
		href: Pathname;
		label: () => string;
		show?: () => boolean;
	}

	const tabs: Tab[] = [
		{ href: '/', label: m['nav.library'] },
		{ href: '/locations', label: m['locations.locations'] },
		{ href: '/labels', label: m['nav.labels'] },
		{ href: '/settings', label: m['settings.header'] },
		{ href: '/account', label: m['nav.account'], show: () => auth.enabled && auth.authenticated },
		{ href: '/users', label: m['nav.users'], show: () => auth.enabled && auth.isAdmin },
		{ href: '/audit', label: m['nav.audit'], show: () => auth.enabled && auth.isAdmin }
	];

	let visible = $derived(tabs.filter((tab) => tab.show?.() ?? true));

	// The deploy base path, without its trailing slash (resolve('/') === `${base}/`).
	const basePath = resolve('/').replace(/\/$/, '');

	function isActive(href: string): boolean {
		// Compare against the path with the deploy base path stripped off.
		const path = $page.url.pathname.slice(basePath.length) || '/';
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="tabs">
	{#each visible as tab (tab.href)}
		<a href={resolve(tab.href)} class="tab" class:active={isActive(tab.href)}>{tab.label()}</a>
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
