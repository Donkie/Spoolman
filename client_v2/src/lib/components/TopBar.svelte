<script lang="ts">
	import Logo from './Logo.svelte';
	import NavTabs from './NavTabs.svelte';
	import SearchInput from './SearchInput.svelte';
	import Button from './Button.svelte';
	import { setQuery } from '$lib/library/params';
	import { page } from '$app/state';

	interface Props {
		onadd?: () => void;
	}

	let { onadd }: Props = $props();

	// The search box lives in the layout (above the routed page), so it reads the
	// query straight from the URL and writes it back through the params helper.
	let query = $derived(page.url.searchParams.get('q') ?? '');
</script>

<header class="topbar">
	<div class="row primary">
		<Logo />
		<div class="nav-desktop"><NavTabs /></div>
		<div class="spacer"></div>
		<div class="search-desktop">
			<SearchInput value={query} placeholder={'⌕ Search — try "red" or "pla"'} oninput={(v) => setQuery(v)} />
		</div>
		<div class="add-desktop">
			<Button onclick={onadd}>＋ Add spools</Button>
		</div>
	</div>

	<!-- Mobile: search + nav collapse onto their own rows -->
	<div class="row mobile-search">
		<SearchInput
			value={query}
			placeholder={'Search — try "red" or "pla"'}
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
