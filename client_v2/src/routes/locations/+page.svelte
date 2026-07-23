<script lang="ts">
	import Swatch from '$components/Swatch.svelte';
	import type { Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live, type LiveEvent } from '$lib/api/live';
	import { isAbortError } from '$lib/api/http';
	import { mapSpool } from '$lib/api/map';
	import { libraryHref } from '$lib/library/params';
	import { weightAuto } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';
	import { getSettings, setSetting, parseSetting } from '$lib/api/settings';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flushSync } from 'svelte';
	import { flip } from 'svelte/animate';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const NO_LOCATION = 'No location';
	const FLIP = 160;
	/** Spools fetched per request when filling (or extending) a location card. */
	const PAGE = 30;
	/** Distance from the bottom of a card's list at which the next page is fetched. */
	const SCROLL_MARGIN = 120;

	// A card's body reserves its final height up front, derived from the location's
	// spool count (known from the aggregate query before any spool row is fetched),
	// so the card does not grow — and shove every card below it down — when its first
	// page arrives. Without this each card jumps from empty (~110px) to full as it
	// loads, reflowing the whole grid in waves: the load-time "flicker". The result
	// is clamped to the same cap as the body's `max-height`, so a big location fills
	// exactly to the cap with no jump. These constants must track the `.chip` /
	// `.shelf-body` CSS below (chip border-box height, row gap, vertical padding).
	const CHIP_H = 44;
	const CHIP_GAP = 6;
	const BODY_PAD = 20; // 10px top + 10px bottom
	const BODY_MIN = 42; // floor; matches .shelf-body min-height
	function bodyReserve(total: number): number {
		if (total <= 0) return BODY_MIN;
		return Math.max(BODY_MIN, BODY_PAD + total * CHIP_H + (total - 1) * CHIP_GAP);
	}

	// A location card. `id` is what svelte-dnd-action keys on; it equals `name`,
	// the location's display name (the NO_LOCATION sentinel for the unlocated
	// bucket). `spools` is the card's own drop zone, in display order — only the
	// pages loaded so far, which is why `total` (the server's count for the whole
	// location) is what the header reports.
	type Shelf = { id: string; name: string; spools: Spool[]; total: number; loading: boolean };

	let editingLocation = $state<string | null>(null);
	let editValue = $state('');
	let renameError = $state('');

	// The page never loads the whole spool collection. One cheap aggregate query
	// (`/spool/group?group_by=location`) yields every location and its spool count;
	// each card then fetches its own spools a page at a time, starting when the card
	// scrolls into view and continuing as its list is scrolled. So the cost scales
	// with what is on screen, not with the size of the collection.
	//
	// The `locations` setting is an ordered JSON array of names that is the source
	// of truth for both the display order and any location added before it has
	// spools. An empty string marks the position of the "No location" bucket, so it
	// can be reordered like any other card. See the equivalent `useLocations` in the
	// old client (which pins it first instead).
	const EMPTY = '';
	let settingOrder = $state<string[]>([]);
	let settingsLoaded = $state(false);
	let locationsLoaded = $state(false);
	// Per-location custom spool order, keyed by the stored location name (EMPTY for
	// "No location"), each an array of spool ids. Source of truth for the order of
	// spools within a card. Shared with the old client's `locations_spoolorders`.
	let spoolOrders = $state<Record<string, number[]>>({});

	// What has been loaded for one location, keyed by the STORED location name
	// (EMPTY for "No location"). `total` is authoritative and comes from the group
	// aggregate; `spools` holds only the pages fetched so far. `started` means the
	// card has come into view at least once, `done` that every page is in hand.
	type Bucket = { spools: Spool[]; total: number; loading: boolean; done: boolean; started: boolean };
	let buckets = $state<Record<string, Bucket>>({});

	// Always read the entry back out of the state proxy after creating it — the
	// object literal itself isn't reactive, so mutating it wouldn't update the UI.
	function bucket(key: string): Bucket {
		if (!buckets[key]) buckets[key] = { spools: [], total: 0, loading: false, done: false, started: false };
		return buckets[key];
	}

	// The live drag state. `shelves` is the structure the drag zones bind to and
	// mutate directly; it is rebuilt from the data above whenever nothing is being
	// dragged. `dragging` pauses that rebuild so an in-flight drag isn't clobbered.
	// Shelf dragging is gated to the grip handle by keeping the grid zone disabled
	// until a grip press enables it (svelte-dnd-action's drag-handle pattern), so
	// it doesn't hijack pointer presses on the spool zones nested inside each card.
	let shelves = $state<Shelf[]>([]);
	let dragging = $state(false);
	let shelvesDragDisabled = $state(true);
	let displayNames = $derived(shelves.map((sh) => sh.name));
	// Nothing at all to show: no saved locations and no spools. Only decided once
	// both loads have settled, so the help text doesn't flash on the way in.
	let isEmpty = $derived(settingsLoaded && locationsLoaded && shelves.length === 0);

	// Map between the display sentinel and the stored empty-string marker.
	const toStored = (names: string[]) => names.map((n) => (n === NO_LOCATION ? EMPTY : n));
	const storedKey = (name: string) => (name === NO_LOCATION ? EMPTY : name);

	// The one query that runs up front: every location that currently holds spools,
	// with its count, aggregated in the database. No spool rows cross the wire.
	// Everything this page reads is tied to one controller, aborted when the page
	// goes away. Without it, leaving mid-load leaves a screenful of card queries
	// running for a server that no longer has anyone to answer — and bouncing in
	// and out of the page stacks a fresh set on top of each abandoned one.
	let pageAbort = new AbortController();

	async function loadLocations() {
		// Captured up front: by the time this settles, `pageAbort` may already be a
		// fresh controller for a later mount.
		const signal = pageAbort.signal;
		try {
			const page = await spoolSource.listGroups({
				field: 'location',
				filters: {},
				sort: [{ field: 'group.title', dir: 'asc' }],
				limit: 1000,
				offset: 0,
				lowThreshold: settings.lowThreshold,
				signal
			});
			// A NULL location and an empty-string one are distinct rows to the database
			// but the same "No location" card here, so counts are summed by key.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local, not reactive state
			const totals = new Map<string, number>();
			for (const g of page.items) totals.set(g.key, (totals.get(g.key) ?? 0) + g.spoolCount);

			for (const [key, total] of totals) {
				const b = bucket(key);
				b.total = total;
				// Set both ways: spools added elsewhere reopen a card that had everything.
				b.done = b.spools.length >= total;
			}
			// A location that no longer has any spools keeps its card (if it is in the
			// setting) but drops whatever it had loaded.
			for (const [key, b] of Object.entries(buckets)) {
				if (totals.has(key)) continue;
				b.total = 0;
				b.spools = [];
				b.done = true;
			}
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load locations', e);
		} finally {
			locationsLoaded = true;
		}
	}

	// A screenful can be a dozen cards, and firing that many requests at once both
	// queues behind the browser's per-host connection limit (which the live-update
	// sockets already eat into) and hammers the server. Cards are filled a few at a
	// time instead; the rest wait their turn.
	const MAX_INFLIGHT = 3;
	let inflight = 0;
	const waiting: (() => void)[] = [];

	/**
	 * Wait for a slot. Returns false if the page was abandoned while queued — the
	 * queue is where most of the waste sits when someone navigates away from a
	 * screenful of cards, so those turns must be dropped rather than sent.
	 */
	async function acquire(signal: AbortSignal): Promise<boolean> {
		if (inflight >= MAX_INFLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
		if (signal.aborted) {
			// Hand the slot straight to the next in line instead of holding it.
			waiting.shift()?.();
			return false;
		}
		inflight++;
		return true;
	}
	function release() {
		inflight--;
		waiting.shift()?.();
	}

	// Fetch one more page of a location's spools. Ordering is by id so paging is
	// stable; the card's custom order is applied to what has been loaded (see
	// `orderSpools`). Callers may fire this freely — it is a no-op while a request
	// is in flight or once everything is loaded.
	async function loadPage(name: string) {
		const key = storedKey(name);
		const b = bucket(key);
		if (b.loading || b.done) return;
		const signal = pageAbort.signal;
		b.started = true;
		b.loading = true;
		if (!(await acquire(signal))) {
			b.loading = false;
			b.started = false;
			return;
		}
		try {
			const page = await spoolSource.listSpools({
				filters: {},
				sort: [{ field: 'id', dir: 'asc' }],
				groupScope: { field: 'location', key },
				limit: PAGE,
				offset: b.spools.length,
				lowThreshold: settings.lowThreshold,
				signal
			});
			// A spool moved in by a drag or a live event may already be held here.
			const seen = new Set(b.spools.map((s) => s.id));
			const fresh = page.items.filter((s) => !seen.has(s.id));
			b.spools = [...b.spools, ...fresh];
			b.total = page.total;
			b.done = page.items.length === 0 || b.spools.length >= page.total;
		} catch (e) {
			// Leave the card unstarted so scrolling it back into view retries, rather
			// than stranding it empty for the rest of the session. A cancelled request
			// is the same story without the noise.
			if (!isAbortError(e, signal)) console.error('Failed to load spools for location', name, e);
			b.started = false;
		} finally {
			release();
			b.loading = false;
		}
	}

	/** First page for a card that just scrolled into view. */
	function ensureLoaded(name: string) {
		if (!bucket(storedKey(name)).started) loadPage(name);
	}

	function onBodyScroll(name: string, e: Event) {
		const el = e.currentTarget as HTMLElement;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_MARGIN) loadPage(name);
	}

	// Load a card's first page once it is (nearly) on screen, so a collection with
	// hundreds of locations only queries the ones actually being looked at.
	function inView(node: HTMLElement, onEnter: () => void) {
		let enter = onEnter;
		const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && enter(), {
			rootMargin: '250px'
		});
		io.observe(node);
		return {
			update(next: () => void) {
				enter = next;
			},
			destroy() {
				io.disconnect();
			}
		};
	}

	async function loadLocationsSetting() {
		const signal = pageAbort.signal;
		try {
			const s = await getSettings(signal);
			settingOrder = parseSetting<string[]>(s.locations, []).filter((l) => l != null);
			spoolOrders = parseSetting<Record<string, number[]>>(s.locations_spoolorders, {});
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load locations setting', e);
		} finally {
			settingsLoaded = true;
		}
	}

	function saveOrder(order: string[]) {
		settingOrder = order;
		setSetting('locations', order).catch((e) => console.error('Failed to save location order', e));
	}

	// A remote spool change is applied to the loaded cards directly — reloading them
	// all would undo the point of paging. Counts (and any location that just came
	// into or out of existence) come from a single debounced aggregate refresh,
	// which is also what repairs the count of a card whose spools aren't loaded and
	// whose previous location we therefore can't know.
	let countsTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleCountRefresh() {
		if (countsTimer) clearTimeout(countsTimer);
		countsTimer = setTimeout(() => {
			countsTimer = null;
			loadLocations();
		}, 400);
	}

	function applyLiveEvent(event: LiveEvent) {
		// Keep the shared cache fresh first: the chips read their filament from it.
		inventory.ingest(event);

		const id = Number(event.id);
		const spool = event.type !== 'deleted' && event.payload ? mapSpool(event.payload) : null;
		// Archived spools are not shown here, so they leave their card like a deletion.
		const newKey = spool && !spool.archived ? spool.location || EMPTY : null;

		for (const [key, b] of Object.entries(buckets)) {
			const i = b.spools.findIndex((s) => s.id === id);
			if (i === -1) continue;
			if (key === newKey) b.spools[i] = spool!;
			else b.spools = b.spools.filter((s) => s.id !== id);
		}
		if (newKey !== null) {
			const b = buckets[newKey];
			// Pages are fetched in id order, so a card holds every spool up to the
			// highest id it has loaded: anything at or below that watermark (and
			// everything at all, once the card is complete) belongs on screen now and
			// is spliced into its id position. A higher id sits in a page that hasn't
			// been fetched, and arrives with it.
			const watermark = b?.spools.length ? b.spools[b.spools.length - 1].id : -1;
			if (b && (b.done || id <= watermark) && !b.spools.some((s) => s.id === id)) {
				const at = b.spools.findIndex((s) => s.id > id);
				b.spools = at === -1 ? [...b.spools, spool!] : b.spools.toSpliced(at, 0, spool!);
			}
		}
		scheduleCountRefresh();
	}

	$effect(() => {
		pageAbort = new AbortController();
		loadLocations();
		loadLocationsSetting();
		const off = live.subscribe('spool', {}, applyLiveEvent);
		return () => {
			off();
			if (countsTimer) clearTimeout(countsTimer);
			// Drops both the requests already on the wire and the ones still queued
			// behind MAX_INFLIGHT.
			pageAbort.abort();
		};
	});

	// The full display order: the saved setting order (empty string → the
	// "No location" bucket), then any location discovered from spools that isn't
	// in the setting yet. The "No location" bucket only shows when unlocated
	// spools exist, and defaults to the front when the setting doesn't place it.
	function computeOrderedNames(present: Set<string>): string[] {
		const all: string[] = [];
		for (const l of settingOrder) {
			const name = l === EMPTY ? NO_LOCATION : l;
			if (!all.includes(name)) all.push(name);
		}
		if (present.has(NO_LOCATION) && !all.includes(NO_LOCATION)) all.unshift(NO_LOCATION);
		for (const name of present) if (name !== NO_LOCATION && !all.includes(name)) all.push(name);
		return all.filter((n) => n !== NO_LOCATION || present.has(NO_LOCATION));
	}

	// Sort a location's LOADED spools by its saved custom order; any spool not in the
	// order keeps its incoming (id-sorted) position at the end. Array.sort is
	// stable, so ties preserve that order.
	function orderSpools(name: string, list: Spool[]): Spool[] {
		const order = spoolOrders[storedKey(name)];
		if (!order?.length) return list;
		const rank = new Map(order.map((id, i) => [id, i]));
		const at = (id: number) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
		return [...list].sort((a, b) => at(a.id) - at(b.id));
	}

	// Which locations currently hold spools, by display name.
	function presentNames(): Set<string> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local, not reactive state
		const names = new Set<string>();
		for (const [key, b] of Object.entries(buckets)) {
			if (b.total > 0) names.add(key === EMPTY ? NO_LOCATION : key);
		}
		return names;
	}

	function buildShelves(): Shelf[] {
		return computeOrderedNames(presentNames()).map((name) => {
			const b = buckets[storedKey(name)];
			return {
				id: name,
				name,
				spools: orderSpools(name, b?.spools ?? []),
				total: b?.total ?? 0,
				loading: b?.loading ?? false
			};
		});
	}

	// Rebuild the displayed cards from the data whenever it changes, except while a
	// drag is in progress (the drag handlers own `shelves` then). Also keeps the
	// `locations` setting reflecting the displayed order so locations discovered
	// from spools are persisted; it settles once the setting matches.
	$effect(() => {
		// Both loads have to have settled: rebuilding before the locations are known
		// would drop the "No location" marker out of the order and then save that.
		if (!settingsLoaded || !locationsLoaded || dragging) return;
		const desired = buildShelves();
		shelves = desired;
		const stored = toStored(desired.map((sh) => sh.name));
		if (JSON.stringify(stored) !== JSON.stringify(settingOrder)) saveOrder(stored);
	});

	// Arming the grid's drag zone from the grip has to happen BEFORE the press
	// reaches the card: svelte-dnd-action only attaches its mousedown/touchstart
	// listeners to an item while the zone's `dragDisabled` is false, and it does so
	// when the action updates. Svelte 5 flushes state changes asynchronously, so
	// setting the flag in a plain handler arrives too late and the press is simply
	// never seen — flushSync applies it (and re-runs the action) synchronously.
	// `pointerdown` is the hook because it precedes both mousedown and touchstart,
	// so mouse and touch are armed the same way.
	function enableShelfDrag() {
		flushSync(() => (shelvesDragDisabled = false));
	}

	function shelfConsider(e: CustomEvent<DndEvent<Shelf>>) {
		dragging = true;
		shelves = e.detail.items;
	}

	function shelfFinalize(e: CustomEvent<DndEvent<Shelf>>) {
		shelves = e.detail.items;
		dragging = false;
		shelvesDragDisabled = true;
		saveOrder(toStored(shelves.map((sh) => sh.name)));
	}

	function spoolConsider(idx: number, e: CustomEvent<DndEvent<Spool>>) {
		dragging = true;
		shelves[idx].spools = e.detail.items;
	}

	function spoolFinalize(idx: number, e: CustomEvent<DndEvent<Spool>>) {
		shelves[idx].spools = e.detail.items;
		dragging = false;
		commitSpoolLayout();
	}

	// Persist the outcome of a spool drag from the current card layout: move any
	// spool that now sits in a different card to that location, then save every
	// card's spool order. Diff-based, so the duplicate finalize fired on the other
	// zone of a cross-card move is a harmless no-op.
	function commitSpoolLayout() {
		const changed: { id: number; location: string }[] = [];
		for (const sh of shelves) {
			const key = storedKey(sh.name);
			const b = bucket(key);
			const before = b.spools.length;
			b.spools = sh.spools.map((sp) => {
				if ((sp.location || '') === key) return sp;
				changed.push({ id: sp.id, location: key });
				return { ...sp, location: key };
			});
			// Cards hold a page, not the location, so the count has to be adjusted by
			// what moved rather than recomputed from the list.
			b.total += b.spools.length - before;
		}
		for (const c of changed) {
			inventory.patchSpool(c.id, { location: c.location });
			spoolSource.saveSpool(c.id, { location: c.location }).catch((e) => console.error('Move failed', e));
		}

		// A card's saved order can only speak for the spools it has loaded. Ids from
		// the previous order that aren't loaded (and haven't moved to another card)
		// are kept, after the loaded ones, so a drag in a partially loaded card
		// doesn't discard the order of the pages below it.
		const moved = new Set(changed.map((c) => c.id));
		const nextOrders: Record<string, number[]> = { ...spoolOrders };
		for (const sh of shelves) {
			const key = storedKey(sh.name);
			const loaded = sh.spools.map((s) => s.id);
			const inCard = new Set(loaded);
			const carried = (spoolOrders[key] ?? []).filter((id) => !inCard.has(id) && !moved.has(id));
			nextOrders[key] = [...loaded, ...carried];
		}
		if (JSON.stringify(nextOrders) !== JSON.stringify(spoolOrders)) {
			spoolOrders = nextOrders;
			setSetting('locations_spoolorders', nextOrders).catch((e) =>
				console.error('Failed to save spool order', e)
			);
		}
	}

	function addLocation() {
		const existing = new Set(displayNames);
		let n = 1;
		let name = m['locations.newShelf']({ n });
		while (existing.has(name)) name = m['locations.newShelf']({ n: ++n });
		saveOrder([...settingOrder, name]);
	}

	function focusAndSelect(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

	function startEdit(loc: string) {
		if (loc === NO_LOCATION) return;
		editingLocation = loc;
		editValue = loc;
		renameError = '';
	}

	// Only empty, non-default locations can be removed (matches the old client).
	function deleteLocation(name: string) {
		saveOrder(settingOrder.filter((l) => l !== name));
	}

	function cancelEdit() {
		editingLocation = null;
		renameError = '';
	}

	async function commitEdit() {
		if (editingLocation === null) return;
		const oldName = editingLocation;
		const newName = editValue.trim();

		if (newName === oldName) {
			editingLocation = null;
			renameError = '';
			return;
		}
		if (!newName) {
			renameError = m['locations.errorEmpty']();
			return;
		}
		if (displayNames.includes(newName)) {
			renameError = m['locations.errorExists']();
			return;
		}

		const old = buckets[oldName];
		try {
			if (old && old.total > 0) {
				await spoolSource.renameLocation(oldName, newName);
				// Carry the loaded page over so the card doesn't have to refetch.
				buckets[newName] = {
					...old,
					spools: old.spools.map((s) => ({ ...s, location: newName }))
				};
				delete buckets[oldName];
			}
			// Carry the card's custom spool order over to the new name.
			if (spoolOrders[oldName]) {
				const { [oldName]: moved, ...rest } = spoolOrders;
				spoolOrders = { ...rest, [newName]: moved };
				setSetting('locations_spoolorders', spoolOrders).catch((e) =>
					console.error('Failed to save spool order', e)
				);
			}
			// Rename in place in the setting so the card keeps its position.
			saveOrder(settingOrder.map((l) => (l === oldName ? newName : l)));
			editingLocation = null;
			renameError = '';
		} catch (e) {
			renameError = e instanceof Error ? e.message : m['locations.errorRename']();
		}
	}
</script>

<svelte:window
	onpointerup={() => {
		if (!dragging) shelvesDragDisabled = true;
	}}
/>

<svelte:head>
	<title>{m['documentTitle.locations.list']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="head">
		<span class="title">{m['locations.locations']()}</span>
		{#if !isEmpty}<span class="hint">{m['locations.dragHint']()}</span>{/if}
		<button class="add" onclick={addLocation}><Plus size={14} /> {m['locations.newLocation']()}</button>
	</div>

	<div
		class="grid"
		use:dndzone={{
			items: shelves,
			type: 'shelf',
			flipDurationMs: FLIP,
			dragDisabled: shelvesDragDisabled,
			dropTargetStyle: {}
		}}
		onconsider={(e) => shelfConsider(e as CustomEvent<DndEvent<Shelf>>)}
		onfinalize={(e) => shelfFinalize(e as CustomEvent<DndEvent<Shelf>>)}
	>
		{#each shelves as shelf, idx (shelf.id)}
			<div
				class="shelf"
				role="list"
				animate:flip={{ duration: FLIP }}
				use:inView={() => ensureLoaded(shelf.name)}
			>
				<div class="shelf-head">
					<span
						class="grip"
						role="button"
						tabindex="-1"
						aria-label={m['locations.reorderLocation']()}
						onpointerdown={enableShelfDrag}><GripVertical size={16} /></span
					>
					{#if editingLocation === shelf.name}
						<input
							class="shelf-name-input"
							value={editValue}
							use:focusAndSelect
							oninput={(e) => (editValue = (e.target as HTMLInputElement).value)}
							onblur={commitEdit}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									(e.target as HTMLInputElement).blur();
								} else if (e.key === 'Escape') {
									e.preventDefault();
									cancelEdit();
								}
							}}
						/>
					{:else}
						<span
							class="shelf-name"
							class:editable={shelf.name !== NO_LOCATION}
							role="button"
							tabindex="0"
							onclick={() => startEdit(shelf.name)}
							onkeydown={(e) => e.key === 'Enter' && startEdit(shelf.name)}
						>
							{shelf.name === NO_LOCATION ? m['locations.noLocation']() : shelf.name}
						</span>
					{/if}
					<span class="shelf-meta">{m['locations.spoolCount']({ count: shelf.total })}</span>
					{#if shelf.name !== NO_LOCATION && shelf.total === 0 && editingLocation !== shelf.name}
						<button
							class="shelf-delete"
							aria-label={m['locations.deleteLocation']()}
							title={m['locations.deleteLocation']()}
							onclick={() => deleteLocation(shelf.name)}
						>
							<Trash2 size={14} />
						</button>
					{/if}
				</div>
				{#if editingLocation === shelf.name && renameError}
					<div class="rename-error">{renameError}</div>
				{/if}
				<div class="shelf-body-wrap">
					<div
						class="shelf-body"
						style="min-height: min({bodyReserve(shelf.total)}px, var(--shelf-body-cap))"
						onscroll={(e) => onBodyScroll(shelf.name, e)}
						use:dndzone={{ items: shelf.spools, type: 'spool', flipDurationMs: FLIP, dropTargetStyle: {} }}
						onconsider={(e) => spoolConsider(idx, e as CustomEvent<DndEvent<Spool>>)}
						onfinalize={(e) => spoolFinalize(idx, e as CustomEvent<DndEvent<Spool>>)}
					>
						{#each shelf.spools as s (s.id)}
							{@const f = inventory.filamentById(s.filamentId)!}
							{@const v = inventory.vendorOf(f)}
							<!-- A real link to the spool's inspector (open-in-new-tab, copy-link),
							     but also a svelte-dnd-action drag item. `draggable=false` keeps the
							     browser's native link drag from fighting the pointer-based dnd; a
							     genuine drag never fires a click, so it won't also navigate. -->
							<a
								class="chip"
								href={libraryHref('spool', String(s.id))}
								draggable="false"
								animate:flip={{ duration: FLIP }}
							>
								<Swatch colors={f.colors} direction={f.multiColorDirection} size={22} radius={5} />
								<div class="chip-info">
									<div class="chip-title">
										<span class="chip-id mono">#{s.id}</span>
										{#if v.name !== '?'}{v.name} -
										{/if}{f.name}
									</div>
									<div class="chip-subtitle">
										{f.material} -
										<span class:low={settings.isLow(s.remaining, s.unused)}>{weightAuto(s.remaining)}</span>
										/ {weightAuto(f.weight)}{#if s.lastUsedLabel}
											- {m['locations.lastUsed']({
												time: s.lastUsedLabel
											})}{/if}
									</div>
								</div>
							</a>
						{/each}
					</div>
					{#if shelf.spools.length === 0 && !shelf.loading}
						<span class="empty">{m['locations.dropHere']()}</span>
					{/if}
				</div>
				{#if shelf.loading}
					<div class="shelf-loading" aria-hidden="true"></div>
				{/if}
			</div>
		{/each}
	</div>

	{#if isEmpty}
		<p class="no-locations">{m['locations.noLocationsHelp']()}</p>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 20px 22px 40px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 16px;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.hint {
		font-size: 12px;
		color: var(--text-dim);
	}
	.add {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		border: 1px dashed var(--accent-border);
		color: var(--accent-link);
		border-radius: var(--radius);
		padding: 6px 12px;
		font-size: 12.5px;
		cursor: pointer;
		background: none;
		font-family: inherit;
	}
	.add:hover {
		border-color: var(--accent);
	}
	/* Centered when there are only a few shelves; wraps and fills the full width
	 * once enough shelves are present to need it. */
	.grid {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 14px;
		align-items: flex-start;
	}
	.shelf {
		flex: 1 1 300px;
		max-width: 380px;
		/* Without this a flex item's min-width is `auto` (its min-content width), which
		 * grows once the card's spool chips load. That can push the card past the point
		 * where N of them still fit on a row, so the grid drops a column and re-wraps —
		 * cards jumping sideways as each location's query lands (the width-wise
		 * "flicker"). Pinning min-width to 0 makes the column count depend only on the
		 * flex-basis and available width, so it stays put as cards fill. */
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		min-height: 110px;
	}
	.shelf-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--border-soft);
	}
	.grip {
		color: var(--text-faint);
		font-size: 13px;
		cursor: grab;
		display: inline-flex;
		align-items: center;
		touch-action: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.shelf-name {
		flex: 1;
		font-weight: 600;
		font-size: 13px;
	}
	.shelf-name.editable {
		cursor: text;
		border-radius: 4px;
	}
	.shelf-name.editable:hover {
		background: var(--bg);
	}
	.shelf-name-input {
		flex: 1;
		font-weight: 600;
		font-size: 13px;
		font-family: inherit;
		color: inherit;
		background: var(--bg);
		border: 1px solid var(--accent-border);
		border-radius: 4px;
		padding: 1px 5px;
		min-width: 0;
	}
	.shelf-name-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.rename-error {
		font-size: 11px;
		color: var(--danger-soft);
		padding: 0 12px 8px;
	}
	.shelf-meta {
		font-size: 11px;
		color: var(--text-dim);
	}
	.shelf-delete {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		border: none;
		background: none;
		color: var(--text-faint);
		cursor: pointer;
		border-radius: 4px;
	}
	.shelf-delete:hover {
		color: var(--danger-soft);
		background: var(--bg);
	}
	/* Wraps the drop zone so the "drop here" hint can overlay an empty card
	 * without being a child of the zone (which maps its children 1:1 to items). */
	.shelf-body-wrap {
		position: relative;
		display: flex;
		flex: 1;
	}
	/* Capped so a location with hundreds of spools stays a card rather than an
	 * endless column; scrolling it to the bottom fetches the next page. */
	.shelf-body {
		/* Single source of truth for the height cap: the reserved min-height (set
		 * inline from the spool count) is clamped to this too, so it never exceeds
		 * max-height. */
		--shelf-body-cap: min(52vh, 420px);
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		flex: 1;
		min-height: 42px;
		max-height: var(--shelf-body-cap);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* Indeterminate bar along the bottom of a card while a page is in flight. */
	.shelf-loading {
		height: 2px;
		margin: 0 12px 6px;
		border-radius: 2px;
		overflow: hidden;
		background: var(--border-soft);
	}
	.shelf-loading::after {
		content: '';
		display: block;
		height: 100%;
		width: 35%;
		border-radius: 2px;
		background: var(--accent);
		animation: shelf-load 1s ease-in-out infinite;
	}
	@keyframes shelf-load {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(320%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.shelf-loading::after {
			animation: none;
			width: 100%;
			opacity: 0.4;
		}
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 9px;
		background: var(--bg);
		border: 1px solid var(--border-input);
		border-radius: 7px;
		padding: 6px 9px;
		cursor: grab;
		user-select: none;
		touch-action: none;
		color: inherit;
		text-decoration: none;
	}
	.chip:hover {
		border-color: var(--accent);
	}
	.chip:active {
		cursor: grabbing;
	}
	.chip-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.chip-title {
		font-size: 12px;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip-id {
		font-size: 11px;
		color: var(--text-muted);
		margin-right: 2px;
	}
	.chip-subtitle {
		font-size: 10.5px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip-subtitle .low {
		color: var(--danger-soft);
	}
	.no-locations {
		margin: 18vh auto 0;
		max-width: 420px;
		text-align: center;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-dim);
	}
	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		padding: 6px 14px;
		font-size: 11.5px;
		color: var(--text-faint);
		pointer-events: none;
	}
</style>
