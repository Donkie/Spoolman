<script lang="ts">
	import Logo from './Logo.svelte';
	import NavTabs from './NavTabs.svelte';
	import SearchBox from './library/SearchBox.svelte';
	import Button from './Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import Plus from '@lucide/svelte/icons/plus';
	import ScanLine from '@lucide/svelte/icons/scan-line';

	interface Props {
		onadd?: () => void;
		onscan?: () => void;
	}

	let { onadd, onscan }: Props = $props();
</script>

<header class="topbar">
	<div class="row primary">
		<Logo />
		<div class="nav-desktop"><NavTabs /></div>
		<div class="spacer"></div>
		<button class="scan-btn" onclick={onscan} aria-label={m['topbar.scan']()} title={m['topbar.scan']()}>
			<ScanLine size={18} />
		</button>
		<div class="search-desktop">
			<SearchBox />
		</div>
		<div class="add-desktop">
			<Button onclick={onadd}><Plus size={15} /> {m['topbar.addSpools']()}</Button>
		</div>
	</div>

	<!-- Mobile: search + nav collapse onto their own rows -->
	<div class="row mobile-search">
		<SearchBox fullWidth />
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
