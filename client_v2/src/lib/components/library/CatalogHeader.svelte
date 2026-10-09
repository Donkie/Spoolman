<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Every href below comes from resolve() or params.catalogHref(), which already
	   resolves against the deploy base path; resolving again would double-apply it. */
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { catalogHref, type CatalogView } from '$lib/library/params';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		view: CatalogView;
		/** Rows in the whole list (not the page); absent until the first load. */
		count?: number;
	}
	let { view, count }: Props = $props();

	const lists = [
		{ view: 'filaments', label: m['library.catalog.allFilaments'] },
		{ view: 'manufacturers', label: m['library.catalog.allManufacturers'] }
	] as const;
	let title = $derived(lists.find((l) => l.view === view)!.label());

	// The menu follows the Library tab's (NavTabs): arrow keys walk the items,
	// Escape hands focus back to the button, a click anywhere else closes it.
	let open = $state(false);
	let wrap = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();
	let menuEl = $state<HTMLElement>();

	function items(): HTMLElement[] {
		return menuEl ? [...menuEl.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : [];
	}
	async function openMenu(focusFirst: boolean) {
		open = true;
		if (!focusFirst) return;
		await tick();
		items()[0]?.focus();
	}
	function closeMenu(refocus = false) {
		open = false;
		if (refocus) button?.focus();
	}

	// detail === 0 means the click came from Enter/Space, not a pointer.
	function onButtonClick(e: MouseEvent) {
		if (open) closeMenu();
		else openMenu(e.detail === 0);
	}
	function onButtonKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			openMenu(true);
		} else if (e.key === 'Escape' && open) {
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
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (wrap && !wrap.contains(e.target as Node)) closeMenu();
		};
		window.addEventListener('pointerdown', onDown, true);
		return () => window.removeEventListener('pointerdown', onDown, true);
	});
</script>

<!-- Where you are and the way back: the catalogs are side trips from the spool
     list, so the spools stay one click away and the title says which list this is. -->
<div class="head">
	<a class="back" href={resolve('/')} title={m['library.catalog.backToSpools']()}
		><ChevronLeft size={16} />{m['search.section.spools']()}</a
	>
	<span class="slash" aria-hidden="true">/</span>
	<div class="title-wrap" bind:this={wrap}>
		<button
			type="button"
			class="title"
			class:open
			bind:this={button}
			aria-haspopup="menu"
			aria-expanded={open}
			title={m['library.catalog.switchList']()}
			onclick={onButtonClick}
			onkeydown={onButtonKeydown}
		>
			<span class="label">{title}</span>
			{#if count !== undefined}<span class="count mono">{count}</span>{/if}
			<ChevronDown size={14} />
		</button>
		{#if open}
			<!-- eslint-disable-next-line svelte/no-static-element-interactions -- arrow keys bubble up from the focused item -->
			<div
				class="menu"
				role="menu"
				tabindex="-1"
				aria-label={m['library.catalog.switchList']()}
				bind:this={menuEl}
				onkeydown={onMenuKeydown}
			>
				{#each lists as l (l.view)}
					{@const checked = l.view === view}
					<a
						class="mi"
						class:sel={checked}
						href={catalogHref(l.view)}
						role="menuitemradio"
						aria-checked={checked}
						onclick={() => closeMenu()}
					>
						<span class="mi-check" aria-hidden="true"
							>{#if checked}<Check size={15} />{/if}</span
						>
						<span class="mi-label">{l.label()}</span>
					</a>
				{/each}
				<div class="menu-sep" role="separator"></div>
				<a class="mi" href={resolve('/')} role="menuitem" onclick={() => closeMenu()}>
					<span class="mi-check" aria-hidden="true"></span>
					<span class="mi-label">{m['library.catalog.backToSpools']()}</span>
				</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		min-height: 34px;
		padding: 8px 14px 0;
		flex: none;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		flex: none;
		height: 32px;
		padding: 0 8px 0 4px;
		margin-left: -6px;
		border-radius: var(--radius);
		color: var(--text-dim);
		font-size: 12.5px;
		text-decoration: none;
	}
	.back:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.slash {
		flex: none;
		padding: 0 2px;
		color: var(--text-faint);
		font-size: 14px;
	}
	.title-wrap {
		position: relative;
		min-width: 0;
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		max-width: 100%;
		height: 32px;
		padding: 0 8px;
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--text);
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}
	.title:hover,
	.title.open {
		background: var(--surface-2);
	}
	/* A long translation gives way before the count and the chevron do. */
	.label {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.count {
		flex: none;
		font-size: 11px;
		font-weight: 400;
		color: var(--text-faint);
	}
	.back:focus-visible,
	.title:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 30;
		min-width: 220px;
		padding: 4px 0;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}
	.menu-sep {
		height: 1px;
		background: var(--border-soft);
		margin: 4px 0;
	}
	.mi {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 8px 14px;
		color: var(--text-2);
		font-size: 12.5px;
		text-decoration: none;
		white-space: nowrap;
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
	.mi.sel {
		color: var(--accent-soft);
		font-weight: 600;
	}
	.mi-check {
		flex: none;
		width: 15px;
		display: flex;
		color: var(--accent-soft);
	}

	/* Phone: the same 44px tap targets as the rest of the mobile chrome. */
	@media (max-width: 860px) {
		.head {
			padding-top: 6px;
		}
		.back,
		.title {
			height: 44px;
		}
		.title {
			font-size: 16px;
		}
		.mi {
			min-height: 44px;
		}
	}
</style>
