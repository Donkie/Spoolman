<script lang="ts">
	import Logo from './Logo.svelte';
	import NavTabs from './NavTabs.svelte';
	import SearchBox from './library/SearchBox.svelte';
	import Button from './Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import { auth } from '$lib/stores/auth.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ScanLine from '@lucide/svelte/icons/scan-line';
	import Search from '@lucide/svelte/icons/search';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { afterNavigate } from '$app/navigation';

	interface Props {
		onadd?: () => void;
		onscan?: () => void;
	}

	let { onadd, onscan }: Props = $props();

	// On mobile the search field would otherwise need its own row. Instead it
	// collapses to a single icon in the top row and, when tapped, expands into a
	// full-width overlay covering the logo/scan/add controls — so what you type
	// stays fully visible while the top bar keeps to two rows (controls + nav).
	let searchOpen = $state(false);
	let overlayEl = $state<HTMLDivElement>();

	function openSearch() {
		searchOpen = true;
		// Focus the field once the overlay has painted.
		requestAnimationFrame(() => overlayEl?.querySelector('input')?.focus());
	}
	function closeSearch() {
		searchOpen = false;
	}
	// Collapse once a result (or any nav) has been followed.
	afterNavigate(() => (searchOpen = false));
</script>

<header class="topbar">
	<div class="row primary" class:searching={searchOpen}>
		<Logo />
		<div class="nav-desktop"><NavTabs /></div>
		<div class="spacer"></div>
		<button
			class="search-toggle"
			onclick={openSearch}
			aria-label={m['common.search']()}
			title={m['common.search']()}
		>
			<Search size={18} />
		</button>
		<button class="scan-btn" onclick={onscan} aria-label={m['scanner.title']()} title={m['scanner.title']()}>
			<ScanLine size={18} />
		</button>
		{#if auth.canManage}
			<button
				class="add-mobile"
				onclick={onadd}
				aria-label={m['topbar.addSpools']()}
				title={m['topbar.addSpools']()}
			>
				<Plus size={18} />
			</button>
		{/if}
		<div class="search-desktop">
			<SearchBox />
		</div>
		{#if auth.canManage}
			<div class="add-desktop">
				<Button onclick={onadd}><Plus size={15} /> {m['topbar.addSpools']()}</Button>
			</div>
		{/if}

		<!-- Only rendered when the server actually enforces auth, so the default
		     configuration keeps the bar exactly as it was. -->
		{#if auth.enabled && auth.authenticated}
			<div class="account">
				<span class="who" title={m['auth.signedInAs']({ name: auth.displayName })}>
					{auth.displayName}
				</span>
				<button
					class="signout"
					onclick={() => auth.signOut()}
					aria-label={m['auth.signOut']()}
					title={m['auth.signOut']()}
				>
					<LogOut size={16} />
				</button>
			</div>
		{:else if auth.enabled && auth.anonymous}
			<span class="badge">{m['auth.anonymousBadge']()}</span>
		{/if}

		<!-- Mobile: the expanded search overlays the row so the typed query is visible. -->
		<div class="search-overlay" bind:this={overlayEl}>
			<button class="search-back" onclick={closeSearch} aria-label={m['buttons.close']()}>
				<ArrowLeft size={20} />
			</button>
			<SearchBox fullWidth />
		</div>
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

	/* Collapsed mobile search trigger and its expanded overlay: hidden until the
	   mobile breakpoint (desktop uses the always-visible .search-desktop field). */
	.add-mobile,
	.search-toggle,
	.search-overlay {
		display: none;
	}

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
			/* Anchor the absolutely-positioned search overlay. */
			position: relative;
		}
		.spacer {
			flex: 1;
		}

		/* Search and scan are peer secondary actions, so they share the outlined
		   icon-button look; the filled + button stays the primary action. */
		.search-toggle {
			flex: none;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			border-radius: var(--radius-md);
			border: 1px solid var(--border-strong);
			background: none;
			color: var(--text-2);
			cursor: pointer;
		}
		.search-toggle:hover {
			color: var(--text);
			border-color: var(--accent);
		}
		.scan-btn {
			width: 44px;
			height: 44px;
		}
		.add-mobile {
			flex: none;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			border-radius: var(--radius-md);
			border: none;
			background: var(--accent);
			color: #fff;
			cursor: pointer;
		}

		.search-overlay {
			position: absolute;
			inset: 0;
			align-items: center;
			gap: 6px;
			padding: 0 12px;
			background: var(--surface);
			z-index: 5;
		}
		.row.primary.searching .search-overlay {
			display: flex;
		}
		.search-overlay :global(.search-box) {
			flex: 1;
			min-width: 0;
		}
		.search-back {
			flex: none;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			border: none;
			background: none;
			color: var(--text-2);
			cursor: pointer;
		}
		.search-back:hover {
			color: var(--text);
		}

		.mobile-nav {
			display: flex;
			padding: 0 6px 8px;
			overflow-x: auto;
		}
	}

	.account {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: 8px;
	}

	.who {
		max-width: 12ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-2);
		font-size: 0.82rem;
	}

	.signout {
		display: grid;
		place-items: center;
		/* 44px keeps the mobile a11y audit's tap-target check green. */
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.signout:hover {
		background: var(--surface-raised);
		color: var(--text);
	}

	.badge {
		margin-left: 8px;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	@media (max-width: 860px) {
		.who {
			display: none;
		}
	}
</style>
