<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   The menu hrefs come from resolve() / catalogHref(), which already apply the deploy base path. */
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import { catalogHref, parseLibraryState } from '$lib/library/params';
	import * as m from '$lib/paraglide/messages';

	const tabs = [
		{ href: '/', label: m['nav.library'] },
		{ href: '/dashboard', label: m['dashboard.dashboard'] },
		{ href: '/labels', label: m['nav.labels'] },
		{ href: '/settings', label: m['settings.header'] }
	] satisfies { href: Pathname; label: () => string }[];

	// The deploy base path, without its trailing slash (resolve('/') === `${base}/`).
	const basePath = resolve('/').replace(/\/$/, '');

	function isActive(href: string): boolean {
		// Compare against the path with the deploy base path stripped off.
		const path = $page.url.pathname.slice(basePath.length) || '/';
		return href === '/' ? path === '/' : path.startsWith(href);
	}

	// The Library tab's chevron menu switches between the Library's three views.
	// They all live at '/', so the tab itself stays active for each of them.
	let libraryView = $derived(parseLibraryState($page.url.searchParams).view);
	let onLibrary = $derived(isActive('/'));
	const views = [
		{
			href: resolve('/'),
			view: 'spools',
			label: m['search.section.spools'],
			sub: m['library.viewMenu.spoolsSub']
		},
		{
			href: catalogHref('filaments'),
			view: 'filaments',
			label: m['filament.filament'],
			sub: m['library.viewMenu.filamentsSub']
		},
		{
			href: catalogHref('manufacturers'),
			view: 'manufacturers',
			label: m['search.section.vendors'],
			sub: m['library.viewMenu.manufacturersSub']
		}
	] as const;

	let menuOpen = $state(false);
	let split = $state<HTMLElement>();
	let chevron = $state<HTMLButtonElement>();
	let menuEl = $state<HTMLElement>();

	function items(): HTMLElement[] {
		return menuEl ? [...menuEl.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : [];
	}
	// Fixed rather than absolute: the phone nav row scrolls horizontally, which
	// would clip an absolutely-positioned menu. Placed from the tab when it opens.
	let menuPos = $state({ top: 0, left: 0 });
	async function openMenu(focusFirst: boolean) {
		if (split) {
			const r = split.getBoundingClientRect();
			const width = Math.min(300, window.innerWidth - 36);
			menuPos = { top: r.bottom + 6, left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)) };
		}
		menuOpen = true;
		if (!focusFirst) return;
		await tick();
		items()[0]?.focus();
	}
	function closeMenu(refocus = false) {
		menuOpen = false;
		if (refocus) chevron?.focus();
	}

	// detail === 0 means the click came from Enter/Space, not a pointer.
	function onChevronClick(e: MouseEvent) {
		if (menuOpen) closeMenu();
		else openMenu(e.detail === 0);
	}
	function onChevronKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			openMenu(true);
		} else if (e.key === 'Escape' && menuOpen) {
			// Opened by a click, focus is still here rather than in the menu.
			e.preventDefault();
			e.stopPropagation();
			closeMenu();
		}
	}
	function onMenuKeydown(e: KeyboardEvent) {
		const list = items();
		const i = list.indexOf(document.activeElement as HTMLElement);
		let next: number | undefined;
		if (e.key === 'ArrowDown') next = (i + 1) % list.length;
		else if (e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = list.length - 1;
		if (next !== undefined) {
			e.preventDefault();
			list[next].focus();
		} else if (e.key === 'Escape') {
			// Don't let it also close a surrounding dialog or panel.
			e.preventDefault();
			e.stopPropagation();
			closeMenu(true);
		} else if (e.key === 'Tab') {
			closeMenu();
		}
	}

	// Capture phase, like Combobox, so a click that something else swallows still closes the menu.
	$effect(() => {
		if (!menuOpen) return;
		const onDown = (e: PointerEvent) => {
			if (split && !split.contains(e.target as Node)) closeMenu();
		};
		window.addEventListener('pointerdown', onDown, true);
		return () => window.removeEventListener('pointerdown', onDown, true);
	});
</script>

<nav class="tabs">
	{#each tabs as tab (tab.href)}
		{#if tab.href === '/'}
			<span class="split" class:active={isActive('/')} class:open={menuOpen} bind:this={split}>
				<a href={resolve('/')} class="tab" aria-current={isActive('/') ? 'page' : undefined}>{tab.label()}</a>
				<button
					type="button"
					class="chevron"
					bind:this={chevron}
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label={m['library.views']()}
					onclick={onChevronClick}
					onkeydown={onChevronKeydown}
				>
					<ChevronDown size={13} />
				</button>
				{#if menuOpen}
					<div
						class="menu"
						role="menu"
						tabindex="-1"
						aria-label={m['library.views']()}
						bind:this={menuEl}
						style:top="{menuPos.top}px"
						style:left="{menuPos.left}px"
						onkeydown={onMenuKeydown}
					>
						{#snippet row(v: (typeof views)[number])}
							{@const checked = onLibrary && libraryView === v.view}
							<a
								class="mi"
								class:sel={checked}
								href={v.href}
								role="menuitemradio"
								aria-checked={checked}
								onclick={() => closeMenu()}
							>
								<span class="mi-check" aria-hidden="true"
									>{#if checked}<Check size={15} />{/if}</span
								>
								<span class="mi-text">
									<span class="mi-label">{v.label()}</span>
									<span class="mi-sub">{v.sub()}</span>
								</span>
							</a>
						{/snippet}
						{@render row(views[0])}
						<div class="menu-sep" role="separator"></div>
						<div class="menu-title" role="presentation">{m['library.viewMenu.browse']()}</div>
						{@render row(views[1])}
						{@render row(views[2])}
					</div>
				{/if}
			</span>
		{:else}
			<a href={resolve(tab.href)} class="tab" class:active={isActive(tab.href)}>{tab.label()}</a>
		{/if}
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

	/* Library tab: label + chevron read as one pill. The wash sits on the wrapper,
	   so the label drops its own background and the chevron only tints on hover/open. */
	.split {
		position: relative;
		display: inline-flex;
		align-items: stretch;
		border-radius: var(--radius);
	}
	.split .tab {
		padding-right: 4px;
		border-radius: var(--radius) 0 0 var(--radius);
		background: none;
	}
	.split.active {
		background: var(--accent-wash);
	}
	.split.active .tab {
		font-weight: 600;
		color: var(--accent-soft);
	}
	.chevron {
		width: 26px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 0 var(--radius) var(--radius) 0;
		background: none;
		color: var(--text-dim);
		cursor: pointer;
	}
	.split.active .chevron {
		color: var(--accent-soft);
	}
	.chevron:hover,
	.split.open .chevron {
		color: var(--text);
		background: var(--accent-wash);
	}
	.split.active .chevron:hover,
	.split.active.open .chevron {
		color: var(--accent-soft);
		background: color-mix(in srgb, var(--accent) 22%, transparent);
	}
	.split .tab:focus-visible,
	.chevron:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.menu {
		position: fixed;
		z-index: 50;
		width: 300px;
		max-width: calc(100vw - 36px);
		padding: 4px 0;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}
	.menu-title {
		padding: 7px 14px 3px;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
	}
	.menu-sep {
		height: 1px;
		background: var(--border-soft);
		margin: 4px 0;
	}
	.mi {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-height: 36px;
		padding: 8px 14px;
		color: var(--text-2);
		text-decoration: none;
	}
	.mi:hover,
	.mi:focus-visible {
		background: var(--surface-raised);
		color: var(--text);
		outline: none;
	}
	.mi:focus-visible {
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.mi-check {
		flex: none;
		width: 15px;
		height: 18px;
		display: flex;
		align-items: center;
		color: var(--accent-soft);
	}
	.mi-text {
		min-width: 0;
		flex: 1;
	}
	.mi-label {
		display: block;
		font-size: 12.5px;
	}
	.mi-sub {
		display: block;
		margin-top: 1px;
		font-size: 11px;
		color: var(--text-dim);
	}
	.mi.sel .mi-label {
		color: var(--accent-soft);
		font-weight: 600;
	}

	/* Phone nav row: 36px+ tap targets, matching the row's own height. */
	@media (max-width: 860px) {
		.chevron {
			width: 36px;
			min-height: 38px;
		}
		.mi {
			min-height: 44px;
			align-items: center;
		}
		.mi-check {
			align-items: center;
		}
	}
</style>
