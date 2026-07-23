<script lang="ts">
	import SearchInput from '../SearchInput.svelte';
	import Swatch from '../Swatch.svelte';
	import MaterialBadge from '../MaterialBadge.svelte';
	import Factory from '@lucide/svelte/icons/factory';
	import { searchAll } from '$lib/api/search';
	import type { SearchResults } from '$lib/api/types';
	import { openSearchResult, searchResultHref } from '$lib/library/params';
	import { page } from '$app/state';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { fields } from '$lib/stores/fields.svelte';
	import type { EntityKind } from '$lib/types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		fullWidth?: boolean;
	}

	let { fullWidth = false }: Props = $props();

	// The colour-similarity threshold is per-browser view state (like the old
	// client's table view state), so it lives in localStorage — not a server
	// setting. Only meaningful for colour queries; the slider shows then.
	const THRESHOLD_KEY = 'spoolman-search-threshold';
	const DEFAULT_THRESHOLD = 20;

	function loadThreshold(): number {
		if (typeof localStorage === 'undefined') return DEFAULT_THRESHOLD;
		const n = Number(localStorage.getItem(THRESHOLD_KEY));
		return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD;
	}

	let query = $state('');
	let threshold = $state(loadThreshold());
	let results = $state<SearchResults | null>(null);
	let loading = $state(false);
	let errored = $state(false);
	let open = $state(false);
	let activeIndex = $state(-1);
	let wrapper = $state<HTMLElement>();

	// Extra-field definitions power the "matched: <field name>" badge for extra fields.
	$effect(() => {
		fields.ensure('spool');
		fields.ensure('filament');
		fields.ensure('vendor');
	});

	// Debounced, abortable search. Re-runs on query or threshold change (moving the
	// slider re-queries so colour results update live).
	let reqId = 0;
	let controller: AbortController | undefined;
	$effect(() => {
		const q = query.trim();
		const thr = threshold;
		if (!q) {
			results = null;
			loading = false;
			errored = false;
			activeIndex = -1;
			return;
		}
		loading = true;
		const mine = ++reqId;
		const timer = setTimeout(() => {
			controller?.abort();
			controller = new AbortController();
			searchAll(q, thr, controller.signal)
				.then((r) => {
					if (mine !== reqId) return;
					results = r;
					loading = false;
					errored = false;
					activeIndex = -1;
				})
				.catch((e: unknown) => {
					if (e instanceof DOMException && e.name === 'AbortError') return;
					if (mine !== reqId) return;
					console.error('Search failed', e);
					errored = true;
					loading = false;
				});
		}, 200);
		return () => clearTimeout(timer);
	});

	// Close the panel when a click lands outside the box.
	$effect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (wrapper && !wrapper.contains(e.target as Node)) open = false;
		};
		window.addEventListener('pointerdown', onDown);
		return () => window.removeEventListener('pointerdown', onDown);
	});

	interface FlatItem {
		kind: EntityKind;
		id: string;
	}

	let flat = $derived<FlatItem[]>(
		results
			? [
					...results.spools.map((m) => ({ kind: 'spool' as const, id: String(m.entity.id) })),
					...results.filaments.map((m) => ({ kind: 'filament' as const, id: m.entity.id })),
					...results.vendors.map((m) => ({ kind: 'vendor' as const, id: m.entity.id }))
				]
			: []
	);

	let hasResults = $derived(flat.length > 0);
	let showPanel = $derived(open && query.trim().length > 0);

	// Each result is a real `<a href>` (see searchResultHref) so it opens in a new
	// tab / copies its address like any link. Close and clear the panel afterwards.
	function dismiss() {
		open = false;
		query = '';
		results = null;
	}

	// Keyboard selection has no anchor to click, so it navigates imperatively.
	function chooseByKey(kind: EntityKind, id: string) {
		openSearchResult(kind, id);
		dismiss();
	}

	// A plain click follows the result's href; just tidy the panel. Modified
	// clicks (new tab/window) are left untouched so several results can be opened.
	function onResultClick(e: MouseEvent) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		dismiss();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			if (flat.length) activeIndex = Math.min(activeIndex + 1, flat.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, -1);
		} else if (e.key === 'Enter') {
			if (activeIndex >= 0 && activeIndex < flat.length) {
				e.preventDefault();
				const item = flat[activeIndex];
				chooseByKey(item.kind, item.id);
			}
		}
	}

	function persistThreshold() {
		if (typeof localStorage !== 'undefined') localStorage.setItem(THRESHOLD_KEY, String(threshold));
	}

	// "matched: <field>" label. Extra fields resolve to the field's display name;
	// native fields get a translated label (falling back to the raw name).
	const NATIVE_MATCH = new Set([
		'name',
		'material',
		'article_number',
		'comment',
		'location',
		'lot_nr',
		'id',
		'color'
	]);
	const MATCH_LABEL: Record<EntityKind, Record<string, () => string>> = {
		filament: {
			name: m['filament.fields.name'],
			material: m['filament.fields.material'],
			article_number: m['filament.fields.articleNumber'],
			comment: m['filament.fields.comment'],
			id: m['filament.fields.id'],
			color: m['filament.fields.colorHex'],
			'vendor.name': m['filament.fields.vendor']
		},
		spool: {
			material: m['spool.fields.material'],
			comment: m['spool.fields.comment'],
			id: m['spool.fields.id'],
			location: m['spool.fields.location'],
			lot_nr: m['spool.fields.lotNr']
		},
		vendor: {
			name: m['vendor.fields.name'],
			comment: m['vendor.fields.comment'],
			id: m['vendor.fields.id']
		}
	};
	function matchLabel(kind: EntityKind, matchField: string): string {
		if (matchField.startsWith('extra.')) {
			const key = matchField.slice(6);
			return fields.get(kind).find((f) => f.key === key)?.name ?? key;
		}
		return matchField in MATCH_LABEL[kind] ? MATCH_LABEL[kind][matchField]() : matchField;
	}

	// The flat index of an item, so hover/selection highlight lines up with keyboard nav.
	function indexOf(kind: EntityKind, id: string): number {
		return flat.findIndex((f) => f.kind === kind && f.id === id);
	}
</script>

<div class="search-box" class:full={fullWidth} bind:this={wrapper}>
	<SearchInput
		value={query}
		placeholder={m['topbar.searchPlaceholder']()}
		oninput={(v) => {
			query = v;
			open = true;
		}}
		onfocus={() => (open = true)}
		onkeydown={onKeydown}
		{fullWidth}
	/>

	{#if showPanel}
		<div class="panel" role="listbox" aria-label={m['common.search']()}>
			{#if results?.isColorQuery}
				<div class="color-controls">
					<label class="slider">
						<span>{m['search.threshold']()}</span>
						<input type="range" min="0" max="60" step="1" bind:value={threshold} oninput={persistThreshold} />
						<span class="val mono">{threshold}</span>
					</label>
					<p class="hint">{m['search.colorHint']()}</p>
				</div>
			{/if}

			{#if loading && !results}
				<div class="msg">{m['search.searching']()}</div>
			{:else if errored}
				<div class="msg">{m['library.apiError']()}</div>
			{:else if !hasResults}
				<div class="msg">{m['search.noResults']()}</div>
			{:else}
				{#if results && results.spools.length}
					<div class="section-label">{m['search.section.spools']()}</div>
					{#each results.spools as spool (spool.entity.id)}
						{@const filament = inventory.filamentById(spool.entity.filamentId)}
						<a
							class="result"
							class:active={activeIndex === indexOf('spool', String(spool.entity.id))}
							href={searchResultHref(
								page.url.searchParams,
								page.url.pathname,
								'spool',
								String(spool.entity.id)
							)}
							data-sveltekit-noscroll
							onclick={onResultClick}
						>
							<span class="id mono">#{spool.entity.id}</span>
							<Swatch
							colors={filament?.colors ?? []}
							direction={filament?.multiColorDirection}
							size={20}
						/>
							<span class="text">
								<span class="title">{filament?.name || m['search.unknownFilament']()}</span>
								{#if spool.entity.location}<span class="sub">{spool.entity.location}</span>{/if}
							</span>
							<span class="match">{matchLabel('spool', spool.matchField)}</span>
						</a>
					{/each}
				{/if}

				{#if results && results.filaments.length}
					<div class="section-label">{m['search.section.filaments']()}</div>
					{#each results.filaments as filament (filament.entity.id)}
						{@const vendor = inventory.vendorById(filament.entity.vendorId)}
						<a
							class="result"
							class:active={activeIndex === indexOf('filament', filament.entity.id)}
							href={searchResultHref(
								page.url.searchParams,
								page.url.pathname,
								'filament',
								filament.entity.id
							)}
							data-sveltekit-noscroll
							onclick={onResultClick}
						>
							<Swatch
								colors={filament.entity.colors}
								direction={filament.entity.multiColorDirection}
								size={20}
							/>
							<span class="text">
								<span class="title">{filament.entity.name}</span>
								{#if vendor?.name}<span class="sub">{vendor.name}</span>{/if}
							</span>
							{#if filament.entity.material}<MaterialBadge label={filament.entity.material} />{/if}
							<span class="match">{matchLabel('filament', filament.matchField)}</span>
						</a>
					{/each}
				{/if}

				{#if results && results.vendors.length}
					<div class="section-label">{m['search.section.vendors']()}</div>
					{#each results.vendors as vendor (vendor.entity.id)}
						<a
							class="result"
							class:active={activeIndex === indexOf('vendor', vendor.entity.id)}
							href={searchResultHref(
								page.url.searchParams,
								page.url.pathname,
								'vendor',
								vendor.entity.id
							)}
							data-sveltekit-noscroll
							onclick={onResultClick}
						>
							<span class="vendor-icon" aria-hidden="true"><Factory size={14} /></span>
							<span class="text">
								<span class="title">{vendor.entity.name}</span>
							</span>
							<span class="match">{matchLabel('vendor', vendor.matchField)}</span>
						</a>
					{/each}
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-box {
		position: relative;
	}
	.search-box.full {
		width: 100%;
	}
	.panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 420px;
		max-width: min(420px, calc(100vw - 28px));
		max-height: min(70vh, 560px);
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
		z-index: 40;
		padding: 6px 0;
	}
	.search-box.full .panel {
		width: 100%;
		max-width: 100%;
		left: 0;
		right: 0;
	}
	.color-controls {
		padding: 8px 12px 10px;
		border-bottom: 1px solid var(--hairline);
	}
	.slider {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.slider input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.slider .val {
		width: 22px;
		text-align: right;
		color: var(--text);
	}
	.hint {
		margin: 6px 0 0;
		font-size: 10.5px;
		color: var(--text-muted);
	}
	.section-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		padding: 8px 12px 4px;
	}
	.msg {
		padding: 18px 12px;
		text-align: center;
		font-size: 12px;
		color: var(--text-dim);
	}
	.result {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 7px 12px;
		border: none;
		background: none;
		color: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		font: inherit;
	}
	.result:hover,
	.result.active {
		background: var(--surface-2);
	}
	.id {
		font-size: 11px;
		color: var(--text-muted);
		min-width: 30px;
		flex: none;
	}
	.text {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.title {
		font-size: 12.5px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.match {
		flex: none;
		font-size: 10px;
		color: var(--text-muted);
		background: var(--surface-raised);
		border-radius: 4px;
		padding: 1px 6px;
		white-space: nowrap;
	}
	.vendor-icon {
		font-size: 15px;
		width: 20px;
		text-align: center;
		flex: none;
	}
</style>
