<script lang="ts">
	import Logo from './Logo.svelte';
	import NavTabs from './NavTabs.svelte';
	import SearchInput from './SearchInput.svelte';
	import Button from './Button.svelte';
	import { setQuery } from '$lib/library/params';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';

	interface Props {
		onadd?: () => void;
		onscan?: () => void;
	}

	let { onadd, onscan }: Props = $props();

	// The search box lives in the layout (above the routed page), so it reads the
	// query straight from the URL and writes it back through the params helper.
	let query = $derived(page.url.searchParams.get('q') ?? '');
</script>

<header class="topbar">
	<div class="row primary">
		<Logo />
		<div class="nav-desktop"><NavTabs /></div>
		<div class="spacer"></div>
		<button class="scan-btn" onclick={onscan} aria-label={$_('topbar.scan')} title={$_('topbar.scan')}>
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 8V5a2 2 0 0 1 2-2h3" />
				<path d="M21 8V5a2 2 0 0 0-2-2h-3" />
				<path d="M3 16v3a2 2 0 0 0 2 2h3" />
				<path d="M21 16v3a2 2 0 0 1-2 2h-3" />
				<path d="M3 12h18" />
			</svg>
		</button>
		<div class="search-desktop">
			<SearchInput
				value={query}
				placeholder={'⌕ ' + $_('topbar.search_placeholder')}
				oninput={(v) => setQuery(v)}
			/>
		</div>
		<div class="add-desktop">
			<Button onclick={onadd}>＋ {$_('topbar.add_spools')}</Button>
		</div>
	</div>

	<!-- Mobile: search + nav collapse onto their own rows -->
	<div class="row mobile-search">
		<SearchInput
			value={query}
			placeholder={$_('topbar.search_placeholder')}
			oninput={(v) => setQuery(v)}
			fullWidth
		/>
	</div>
	<div class="row mobile-nav">
		<NavTabs />
	</div>
</header>

<style>
	.topbar {
		flex: none;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 0 18px;
	}
	.row.primary {
		height: var(--topbar-h);
	}
	.spacer {
		flex: 1;
	}
	.scan-btn {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		background: none;
		color: var(--text-2);
		cursor: pointer;
	}
	.scan-btn:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.mobile-search,
	.mobile-nav {
		display: none;
	}

	@media (max-width: 860px) {
		.nav-desktop,
		.search-desktop,
		.add-desktop {
			display: none;
		}
		.row.primary {
			gap: 12px;
		}
		.spacer {
			flex: 1;
		}
		.mobile-search {
			display: flex;
			padding: 0 14px 10px;
		}
		.mobile-nav {
			display: flex;
			padding: 0 6px 8px;
			overflow-x: auto;
		}
	}
</style>
