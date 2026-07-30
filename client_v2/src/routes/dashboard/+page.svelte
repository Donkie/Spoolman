<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Every href below comes from a src/lib/library/params.ts helper, which already
	   resolves against the deploy base path; resolving again would double-apply it. */
	import Swatch from '$components/Swatch.svelte';
	import type { Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { fields } from '$lib/stores/fields.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live, type LiveEvent } from '$lib/api/live';
	import { isAbortError } from '$lib/api/http';
	import { mapSpool } from '$lib/api/map';
	import { libraryHref } from '$lib/library/params';
	import { extraFieldsHref } from '$lib/settings/params';
	import { weightAuto } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';
	import { dashboardFields, DEFAULT_FIELD_KEY, type DashboardField } from '$lib/dashboard/fields';
	import { loadLayout, saveGroups, saveSpoolOrders, type DashboardLayout } from '$lib/dashboard/layout';
	import { fieldKeyFromUrl, gotoField, rememberFieldKey, rememberedFieldKey } from '$lib/dashboard/params';
	import { page } from '$app/state';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flushSync } from 'svelte';
	import { flip } from 'svelte/animate';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	// The board groups spools into cards by one field and writes that field when a spool is
	// dragged between them. Which field is a view mode (see $lib/dashboard/fields); the page
	// itself only ever talks in group KEYS — a field's value, the empty string meaning unset.

	const FLIP = 160;
	/** Spools fetched per request when filling (or extending) a card. */
	const PAGE = 30;
	/** Distance from the bottom of a card's list at which the next page is fetched. */
	const SCROLL_MARGIN = 120;
	/** The unassigned card's key: no value for the grouped-by field. */
	const UNASSIGNED = '';

	// A card's body reserves its final height up front, derived from the group's spool count
	// (known from the aggregate query before any spool row is fetched), so the card does not
	// grow — and shove every card below it down — when its first page arrives. Without this
	// each card jumps from empty (~110px) to full as it loads, reflowing the whole grid in
	// waves: the load-time "flicker". The result is clamped to the same cap as the body's
	// `max-height`, so a big group fills exactly to the cap with no jump. These constants must
	// track the `.chip` / `.card-body` CSS below (chip border-box height, row gap, padding).
	const CHIP_H = 44;
	const CHIP_GAP = 6;
	const BODY_PAD = 20; // 10px top + 10px bottom
	const BODY_MIN = 42; // floor; matches .card-body min-height
	function bodyReserve(total: number): number {
		if (total <= 0) return BODY_MIN;
		return Math.max(BODY_MIN, BODY_PAD + total * CHIP_H + (total - 1) * CHIP_GAP);
	}

	// One card. `id` is what svelte-dnd-action keys on; it is the group key with a prefix, so
	// that the unassigned card's empty key is still a usable id. `spools` is the card's own
	// drop zone, in display order — only the pages loaded so far, which is why `total` (the
	// server's count for the whole group) is what the header reports.
	type Card = { id: string; key: string; spools: Spool[]; total: number; loading: boolean };
	const cardId = (key: string) => `g:${key}`;

	// --- view mode ----------------------------------------------------------
	// Which field the board groups by comes from the URL, falling back to the view this
	// browser was last left on and then to the default (see $lib/dashboard/params).
	let menuOpen = $state(false);
	// Read once, at init: it is only the fallback for a URL that names no view, and re-reading
	// it later would fight the address bar.
	const remembered = rememberedFieldKey();

	$effect(() => {
		fields.ensure('spool');
	});

	let fieldsReady = $derived(fields.isLoaded('spool'));
	let available = $derived(dashboardFields(fields.get('spool')));
	let urlKey = $derived(fieldKeyFromUrl(page.url.searchParams));
	let selectedKey = $derived(urlKey ?? remembered ?? DEFAULT_FIELD_KEY);
	// Falls back to the default when the requested field doesn't exist (a stale bookmark, or a
	// custom field that has since been deleted).
	let field = $derived<DashboardField>(available.find((f) => f.key === selectedKey) ?? available[0]);

	// Put the resolved view in the address bar so every board is bookmarkable, including one
	// arrived at from the remembered view or from a bookmark naming a field that's gone. Only
	// once the field list is complete — resolving against a half-loaded list would canonicalise
	// to the wrong board and lose the remembered one.
	$effect(() => {
		if (!fieldsReady) return;
		if (urlKey !== field.key) gotoField(field.key, true);
	});

	// Remember whatever board is actually on screen, however it was reached.
	$effect(() => {
		if (fieldsReady) rememberFieldKey(field.key);
	});

	function selectField(next: DashboardField) {
		menuOpen = false;
		if (next.key === field.key) return;
		gotoField(next.key);
	}

	// --- saved layout -------------------------------------------------------
	// Card order and per-card spool order, both stored per field so each view keeps its own
	// arrangement. `groupOrder`/`spoolOrders` are the current field's slice of that.
	//
	// Loaded once for the whole page, not per view: it holds every field's layout anyway, and
	// re-reading it on each switch would race with an order this page had only just saved.
	let layout = $state<DashboardLayout>({ groups: {}, spoolOrders: {} });
	let layoutLoaded = $state(false);
	let groupOrder = $derived(layout.groups[field.key] ?? []);
	let spoolOrders = $derived(layout.spoolOrders[field.key] ?? {});

	function saveOrder(order: string[]) {
		layout.groups = { ...layout.groups, [field.key]: order };
		saveGroups(layout.groups);
	}

	// --- loaded data --------------------------------------------------------
	// What has been loaded for one group, keyed by group key. `total` is authoritative and
	// comes from the group aggregate; `spools` holds only the pages fetched so far. `started`
	// means the card has come into view at least once, `done` that every page is in hand.
	type Bucket = { spools: Spool[]; total: number; loading: boolean; done: boolean; started: boolean };
	let buckets = $state<Record<string, Bucket>>({});
	let groupsLoaded = $state(false);

	// Always read the entry back out of the state proxy after creating it — the object literal
	// itself isn't reactive, so mutating it wouldn't update the UI.
	function bucket(key: string): Bucket {
		if (!buckets[key]) buckets[key] = { spools: [], total: 0, loading: false, done: false, started: false };
		return buckets[key];
	}

	let editingKey = $state<string | null>(null);
	let editValue = $state('');
	let renameError = $state('');

	// The live drag state. `cards` is the structure the drag zones bind to and mutate
	// directly; it is rebuilt from the data above whenever nothing is being dragged.
	// `dragging` pauses that rebuild so an in-flight drag isn't clobbered. Card dragging is
	// gated to the grip handle by keeping the grid zone disabled until a grip press enables it
	// (svelte-dnd-action's drag-handle pattern), so it doesn't hijack pointer presses on the
	// spool zones nested inside each card.
	let cards = $state<Card[]>([]);
	let dragging = $state(false);
	let cardsDragDisabled = $state(true);
	let displayKeys = $derived(cards.map((c) => c.key));
	// Nothing at all to show: no saved cards and no spools. Only decided once both loads have
	// settled, so the help text doesn't flash on the way in.
	let isEmpty = $derived(layoutLoaded && groupsLoaded && cards.length === 0);

	// The page never loads the whole spool collection. One cheap aggregate query
	// (`/spool/group?group_by=<field>`) yields every group and its spool count; each card then
	// fetches its own spools a page at a time, starting when the card scrolls into view and
	// continuing as its list is scrolled. So the cost scales with what is on screen, not with
	// the size of the collection.
	//
	// Everything this page reads is tied to one controller, aborted when the page goes away or
	// the view mode changes. Without it, leaving mid-load leaves a screenful of card queries
	// running for a server that no longer has anyone to answer — and bouncing in and out of
	// the page stacks a fresh set on top of each abandoned one.
	let pageAbort = new AbortController();

	async function loadGroups(fieldKey: DashboardField['key']) {
		// Captured up front: by the time this settles, `pageAbort` may already be a fresh
		// controller for a later view.
		const signal = pageAbort.signal;
		try {
			const page = await spoolSource.listGroups({
				field: fieldKey,
				filters: {},
				sort: [{ field: 'group.title', dir: 'asc' }],
				limit: 1000,
				offset: 0,
				lowThreshold: settings.lowThreshold,
				signal
			});
			// A NULL value and an empty-string one are distinct rows to the database but the
			// same "unassigned" card here, so counts are summed by key.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local, not reactive state
			const totals = new Map<string, number>();
			for (const g of page.items) totals.set(g.key, (totals.get(g.key) ?? 0) + g.spoolCount);

			for (const [key, total] of totals) {
				const b = bucket(key);
				b.total = total;
				// Set both ways: spools added elsewhere reopen a card that had everything.
				b.done = b.spools.length >= total;
			}
			// A group that no longer has any spools keeps its card (if it is in the saved
			// order) but drops whatever it had loaded.
			for (const [key, b] of Object.entries(buckets)) {
				if (totals.has(key)) continue;
				b.total = 0;
				b.spools = [];
				b.done = true;
			}
		} catch (e) {
			if (isAbortError(e, signal)) return;
			console.error('Failed to load dashboard groups', e);
		} finally {
			groupsLoaded = true;
		}
	}

	// A screenful can be a dozen cards, and firing that many requests at once both queues
	// behind the browser's per-host connection limit (which the live-update sockets already
	// eat into) and hammers the server. Cards are filled a few at a time instead; the rest
	// wait their turn.
	const MAX_INFLIGHT = 3;
	let inflight = 0;
	const waiting: (() => void)[] = [];

	/**
	 * Wait for a slot. Returns false if the view was abandoned while queued — the queue is
	 * where most of the waste sits when someone navigates away from (or re-groups) a
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

	// Fetch one more page of a group's spools. Ordering is by id so paging is stable; the
	// card's custom order is applied to what has been loaded (see `orderSpools`). Callers may
	// fire this freely — it is a no-op while a request is in flight or once everything is
	// loaded.
	async function loadPage(key: string) {
		const b = bucket(key);
		if (b.loading || b.done) return;
		const signal = pageAbort.signal;
		const scope = { field: field.key, key };
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
				groupScope: scope,
				limit: PAGE,
				offset: b.spools.length,
				lowThreshold: settings.lowThreshold,
				signal
			});
			// A spool moved in by a drag or a live event may already be held here.
			const seen = new Set(page.items.map((s) => s.id));
			const kept = b.spools.filter((s) => !seen.has(s.id));
			b.spools = [...kept, ...page.items];
			b.total = page.total;
			b.done = page.items.length === 0 || b.spools.length >= page.total;
		} catch (e) {
			// Leave the card unstarted so scrolling it back into view retries, rather than
			// stranding it empty for the rest of the session. A cancelled request is the same
			// story without the noise.
			if (!isAbortError(e, signal)) console.error('Failed to load spools for group', key, e);
			b.started = false;
		} finally {
			release();
			b.loading = false;
		}
	}

	/** First page for a card that just scrolled into view. */
	function ensureLoaded(key: string) {
		if (!bucket(key).started) loadPage(key);
	}

	function onBodyScroll(key: string, e: Event) {
		const el = e.currentTarget as HTMLElement;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_MARGIN) loadPage(key);
	}

	// Load a card's first page once it is (nearly) on screen, so a collection with hundreds of
	// groups only queries the ones actually being looked at.
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

	// Loaded once for the page, on its own controller — it outlives any single view mode.
	$effect(() => {
		const abort = new AbortController();
		(async () => {
			try {
				layout = await loadLayout(abort.signal);
			} catch (e) {
				if (isAbortError(e, abort.signal)) return;
				console.error('Failed to load dashboard layout', e);
			} finally {
				layoutLoaded = true;
			}
		})();
		return () => abort.abort();
	});

	// A remote spool change is applied to the loaded cards directly — reloading them all would
	// undo the point of paging. Counts (and any group that just came into or out of existence)
	// come from a single debounced aggregate refresh, which is also what repairs the count of
	// a card whose spools aren't loaded and whose previous group we therefore can't know.
	let countsTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleCountRefresh(fieldKey: DashboardField['key']) {
		if (countsTimer) clearTimeout(countsTimer);
		countsTimer = setTimeout(() => {
			countsTimer = null;
			loadGroups(fieldKey);
		}, 400);
	}

	function applySpoolEvent(event: LiveEvent) {
		// Keep the shared cache fresh first: the chips read their filament from it.
		inventory.ingest(event);

		const id = Number(event.id);
		const spool = event.type !== 'deleted' && event.payload ? mapSpool(event.payload) : null;
		// Archived spools are not shown here, so they leave their card like a deletion.
		const newKey = spool && !spool.archived ? field.valueOf(spool) : null;

		for (const [key, b] of Object.entries(buckets)) {
			const i = b.spools.findIndex((s) => s.id === id);
			if (i === -1) continue;
			if (key === newKey) b.spools[i] = spool!;
			else b.spools = b.spools.filter((s) => s.id !== id);
		}
		if (newKey !== null) {
			const b = buckets[newKey];
			// Pages are fetched in id order, so a card holds every spool up to the highest id
			// it has loaded: anything at or below that watermark (and everything at all, once
			// the card is complete) belongs on screen now and is spliced into its id position.
			// A higher id sits in a page that hasn't been fetched, and arrives with it.
			const watermark = b?.spools.length ? b.spools[b.spools.length - 1].id : -1;
			if (b && (b.done || id <= watermark) && !b.spools.some((s) => s.id === id)) {
				const at = b.spools.findIndex((s) => s.id > id);
				b.spools = at === -1 ? [...b.spools, spool!] : b.spools.toSpliced(at, 0, spool!);
			}
		}
		scheduleCountRefresh(field.key);
	}

	// Everything below is scoped to one view mode: switching fields throws the loaded pages
	// away (they are grouped by the old field) and starts over.
	//
	// Only spool events matter. Every groupable field is owned by the spool, so a spool event
	// is the complete signal for anything that could move a card's contents.
	$effect(() => {
		const fieldKey = field.key;
		if (!fieldsReady) return;

		buckets = {};
		groupsLoaded = false;
		cards = [];
		editingKey = null;
		pageAbort = new AbortController();

		loadGroups(fieldKey);
		const offSpool = live.subscribe('spool', {}, applySpoolEvent);
		return () => {
			offSpool();
			if (countsTimer) clearTimeout(countsTimer);
			// Drops both the requests already on the wire and the ones still queued behind
			// MAX_INFLIGHT.
			pageAbort.abort();
		};
	});

	// The full display order: the saved order, then the field's own fixed values (a choice
	// field always shows a card per choice, even an empty one), then any group discovered from
	// spools that isn't saved yet. The unassigned card only shows when something is actually
	// unassigned, and defaults to the front when the saved order doesn't place it.
	function computeOrderedKeys(present: Set<string>): string[] {
		const all: string[] = [];
		for (const key of groupOrder) if (!all.includes(key)) all.push(key);
		for (const choice of field.choices ?? []) if (!all.includes(choice)) all.push(choice);
		if (present.has(UNASSIGNED) && !all.includes(UNASSIGNED)) all.unshift(UNASSIGNED);
		for (const key of present) if (key !== UNASSIGNED && !all.includes(key)) all.push(key);
		return all.filter((key) => key !== UNASSIGNED || present.has(UNASSIGNED));
	}

	// Sort a group's LOADED spools by its saved custom order; any spool not in the order keeps
	// its incoming (id-sorted) position at the end. Array.sort is stable, so ties preserve
	// that order.
	function orderSpools(key: string, list: Spool[]): Spool[] {
		const order = spoolOrders[key];
		if (!order?.length) return list;
		const rank = new Map(order.map((id, i) => [id, i]));
		const at = (id: number) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
		return [...list].sort((a, b) => at(a.id) - at(b.id));
	}

	/** Which groups currently hold spools. */
	function presentKeys(): Set<string> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local, not reactive state
		const keys = new Set<string>();
		for (const [key, b] of Object.entries(buckets)) if (b.total > 0) keys.add(key);
		return keys;
	}

	function buildCards(): Card[] {
		return computeOrderedKeys(presentKeys()).map((key) => {
			const b = buckets[key];
			return {
				id: cardId(key),
				key,
				spools: orderSpools(key, b?.spools ?? []),
				total: b?.total ?? 0,
				loading: b?.loading ?? false
			};
		});
	}

	// Rebuild the displayed cards from the data whenever it changes, except while a drag is in
	// progress (the drag handlers own `cards` then). Also keeps the saved order reflecting the
	// displayed order so groups discovered from spools are persisted; it settles once the
	// setting matches.
	$effect(() => {
		// Both loads have to have settled: rebuilding before the groups are known would drop
		// the unassigned card out of the order and then save that.
		if (!layoutLoaded || !groupsLoaded || dragging) return;
		const desired = buildCards();
		cards = desired;
		const keys = desired.map((c) => c.key);
		if (JSON.stringify(keys) !== JSON.stringify(groupOrder)) saveOrder(keys);
	});

	// Arming the grid's drag zone from the grip has to happen BEFORE the press reaches the
	// card: svelte-dnd-action only attaches its mousedown/touchstart listeners to an item
	// while the zone's `dragDisabled` is false, and it does so when the action updates.
	// Svelte 5 flushes state changes asynchronously, so setting the flag in a plain handler
	// arrives too late and the press is simply never seen — flushSync applies it (and re-runs
	// the action) synchronously. `pointerdown` is the hook because it precedes both mousedown
	// and touchstart, so mouse and touch are armed the same way.
	function enableCardDrag() {
		flushSync(() => (cardsDragDisabled = false));
	}

	function cardConsider(e: CustomEvent<DndEvent<Card>>) {
		dragging = true;
		cards = e.detail.items;
	}

	function cardFinalize(e: CustomEvent<DndEvent<Card>>) {
		cards = e.detail.items;
		dragging = false;
		cardsDragDisabled = true;
		saveOrder(cards.map((c) => c.key));
	}

	function spoolConsider(idx: number, e: CustomEvent<DndEvent<Spool>>) {
		dragging = true;
		cards[idx].spools = e.detail.items;
	}

	function spoolFinalize(idx: number, e: CustomEvent<DndEvent<Spool>>) {
		cards[idx].spools = e.detail.items;
		dragging = false;
		commitSpoolLayout();
	}

	// Persist the outcome of a spool drag from the current card layout: assign the grouped-by
	// field to any spool that now sits in a different card, then save every card's spool
	// order. Diff-based, so the duplicate finalize fired on the other zone of a cross-card
	// move is a harmless no-op.
	function commitSpoolLayout() {
		const changed: { spool: Spool; key: string }[] = [];
		for (const card of cards) {
			const b = bucket(card.key);
			const before = b.spools.length;
			b.spools = card.spools.map((sp) => {
				if (field.valueOf(sp) === card.key) return sp;
				changed.push({ spool: sp, key: card.key });
				return field.withValue(sp, card.key);
			});
			// Cards hold a page, not the whole group, so the count has to be adjusted by what
			// moved rather than recomputed from the list.
			b.total += b.spools.length - before;
		}
		for (const { spool, key } of changed) {
			field.assign(spool, key).catch((e) => console.error('Move failed', e));
		}

		// A card's saved order can only speak for the spools it has loaded. Ids from the
		// previous order that aren't loaded (and haven't moved to another card) are kept,
		// after the loaded ones, so a drag in a partially loaded card doesn't discard the
		// order of the pages below it.
		const movedIds = new Set(changed.map((c) => c.spool.id));
		const next: Record<string, number[]> = { ...spoolOrders };
		for (const card of cards) {
			const loaded = (buckets[card.key]?.spools ?? []).map((s) => s.id);
			const inCard = new Set(loaded);
			const carried = (spoolOrders[card.key] ?? []).filter((id) => !inCard.has(id) && !movedIds.has(id));
			next[card.key] = [...loaded, ...carried];
		}
		if (JSON.stringify(next) !== JSON.stringify(spoolOrders)) {
			layout.spoolOrders = { ...layout.spoolOrders, [field.key]: next };
			saveSpoolOrders(layout.spoolOrders);
		}
	}

	function addGroup() {
		const existing = new Set(displayKeys);
		let n = 1;
		let name = m['dashboard.newGroupName']({ n });
		while (existing.has(name)) name = m['dashboard.newGroupName']({ n: ++n });
		saveOrder([...groupOrder, name]);
	}

	function focusAndSelect(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

	/**
	 * Whether this card's name can be edited here. "Unassigned" isn't a value, so there is
	 * nothing to rename; a fixed choice belongs to the field's definition and has to be renamed
	 * there. Everything else is fair game — the backend moves a whole group in one request.
	 */
	function canRename(card: Card): boolean {
		return card.key !== UNASSIGNED && !field.choices?.includes(card.key);
	}

	function startEdit(card: Card) {
		if (!canRename(card)) return;
		editingKey = card.key;
		editValue = card.key;
		renameError = '';
	}

	/** Only empty groups can be removed; a group with spools in it must be emptied first. */
	function deleteGroup(key: string) {
		saveOrder(groupOrder.filter((k) => k !== key));
	}

	function cancelEdit() {
		editingKey = null;
		renameError = '';
	}

	async function commitEdit() {
		if (editingKey === null) return;
		const oldKey = editingKey;
		const newKey = editValue.trim();

		if (newKey === oldKey) {
			editingKey = null;
			renameError = '';
			return;
		}
		if (!newKey) {
			renameError = m['dashboard.errorEmptyName']();
			return;
		}
		if (displayKeys.includes(newKey)) {
			renameError = m['dashboard.errorExists']();
			return;
		}

		const old = buckets[oldKey];
		try {
			if (old && old.total > 0) {
				// One request moves the whole group, including the pages this card never loaded.
				await field.rename(oldKey, newKey);
				// Carry the loaded page over so the card doesn't have to refetch, and keep the
				// shared cache in step so an inspector opened next shows the new value.
				const moved = old.spools.map((s) => field.withValue(s, newKey));
				for (const spool of moved) inventory.upsertSpool(spool);
				buckets[newKey] = { ...old, spools: moved };
				delete buckets[oldKey];
			}
			// Carry the card's custom spool order over to the new key.
			if (spoolOrders[oldKey]) {
				const { [oldKey]: carried, ...rest } = spoolOrders;
				layout.spoolOrders = { ...layout.spoolOrders, [field.key]: { ...rest, [newKey]: carried } };
				saveSpoolOrders(layout.spoolOrders);
			}
			// Rename in place in the saved order so the card keeps its position.
			saveOrder(groupOrder.map((k) => (k === oldKey ? newKey : k)));
			editingKey = null;
			renameError = '';
		} catch (e) {
			renameError = e instanceof Error ? e.message : m['dashboard.errorRename']();
		}
	}
</script>

<svelte:window
	onpointerup={() => {
		if (!dragging) cardsDragDisabled = true;
	}}
	onclick={() => (menuOpen = false)}
/>

<svelte:head>
	<title>{m['documentTitle.dashboard.list']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="head">
		<span class="title">{m['dashboard.dashboard']()}</span>

		<div class="group-by" onclick={(e) => e.stopPropagation()} role="none">
			<button class="group-btn" onclick={() => (menuOpen = !menuOpen)}>
				<span class="ctrl-label">{m['library.groupBy']()}: </span>{field.label}
				<ChevronDown size={13} />
			</button>
			{#if menuOpen}
				<div class="menu">
					{#each available as option (option.key)}
						<button
							class="menu-item"
							class:sel={option.key === field.key}
							onclick={() => selectField(option)}
						>
							{option.label}
						</button>
					{/each}
					<!-- Location is the only built-in field a spool owns, so with no custom spool
					     fields defined this menu has a single entry and the view mode looks broken
					     rather than unused. Say where the other views come from — and link straight
					     to the manager that defines them, since that is the next step.
					     extraFieldsHref() already resolves against the deploy base path. -->
					{#if available.length === 1}
						<a class="menu-note" href={extraFieldsHref('spool')}>
							{m['dashboard.addFieldHint']()}
							<ArrowRight size={12} />
						</a>
					{/if}
				</div>
			{/if}
		</div>

		{#if !isEmpty}
			<span class="hint">{m['dashboard.dragHint']({ field: field.label })}</span>
		{/if}
		{#if !field.choices}
			<button class="add" onclick={addGroup}><Plus size={14} /> {m['dashboard.newGroup']()}</button>
		{/if}
	</div>

	<div
		class="grid"
		use:dndzone={{
			items: cards,
			type: 'card',
			flipDurationMs: FLIP,
			dragDisabled: cardsDragDisabled,
			dropTargetStyle: {}
		}}
		onconsider={(e) => cardConsider(e as CustomEvent<DndEvent<Card>>)}
		onfinalize={(e) => cardFinalize(e as CustomEvent<DndEvent<Card>>)}
	>
		{#each cards as card, idx (card.id)}
			<div
				class="card"
				role="list"
				animate:flip={{ duration: FLIP }}
				use:inView={() => ensureLoaded(card.key)}
			>
				<div class="card-head">
					<span
						class="grip"
						role="button"
						tabindex="-1"
						aria-label={m['dashboard.reorderGroup']()}
						onpointerdown={enableCardDrag}><GripVertical size={16} /></span
					>
					{#if editingKey === card.key}
						<input
							class="card-name-input"
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
							class="card-name"
							class:editable={canRename(card)}
							role="button"
							tabindex="0"
							onclick={() => startEdit(card)}
							onkeydown={(e) => e.key === 'Enter' && startEdit(card)}
						>
							{card.key === UNASSIGNED ? m['dashboard.unassigned']() : card.key}
						</span>
					{/if}
					<span class="card-meta">{m['dashboard.spoolCount']({ count: card.total })}</span>
					{#if card.key !== UNASSIGNED && card.total === 0 && !field.choices && editingKey !== card.key}
						<button
							class="card-delete"
							aria-label={m['dashboard.deleteGroup']()}
							title={m['dashboard.deleteGroup']()}
							onclick={() => deleteGroup(card.key)}
						>
							<Trash2 size={14} />
						</button>
					{/if}
				</div>
				{#if editingKey === card.key && renameError}
					<div class="rename-error">{renameError}</div>
				{/if}
				<div class="card-body-wrap">
					<div
						class="card-body"
						style="min-height: min({bodyReserve(card.total)}px, var(--card-body-cap))"
						onscroll={(e) => onBodyScroll(card.key, e)}
						use:dndzone={{ items: card.spools, type: 'spool', flipDurationMs: FLIP, dropTargetStyle: {} }}
						onconsider={(e) => spoolConsider(idx, e as CustomEvent<DndEvent<Spool>>)}
						onfinalize={(e) => spoolFinalize(idx, e as CustomEvent<DndEvent<Spool>>)}
					>
						{#each card.spools as s (s.id)}
							{@const f = inventory.filamentById(s.filamentId)!}
							{@const v = inventory.vendorOf(f)}
							<!-- A real link to the spool's inspector (open-in-new-tab, copy-link), but also
							     a svelte-dnd-action drag item. `draggable=false` keeps the browser's native
							     link drag from fighting the pointer-based dnd; a genuine drag never fires a
							     click, so it won't also navigate. -->
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
											- {m['dashboard.lastUsed']({
												time: s.lastUsedLabel
											})}{/if}
									</div>
								</div>
							</a>
						{/each}
					</div>
					{#if card.spools.length === 0 && !card.loading}
						<span class="empty">{m['dashboard.dropHere']()}</span>
					{/if}
				</div>
				{#if card.loading}
					<div class="card-loading" aria-hidden="true"></div>
				{/if}
			</div>
		{/each}
	</div>

	{#if isEmpty}
		<p class="no-groups">{m['dashboard.emptyHelp']()}</p>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 20px 22px 40px;
	}
	/* Wraps rather than squeezing: on a phone the row is only wide enough for the title,
	   the group-by button and "New group", so the drag hint drops onto its own line
	   instead of being crushed into a one-word-per-line column. */
	.head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
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
	.group-by {
		position: relative;
	}
	.group-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--accent-soft);
		cursor: pointer;
		white-space: nowrap;
		padding: 4px 8px;
		border: 1px solid var(--accent-border);
		border-radius: var(--radius);
		background: var(--accent-wash);
		font-family: inherit;
	}
	.menu {
		position: absolute;
		top: 30px;
		left: 0;
		z-index: 30;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		overflow: hidden auto;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		min-width: 170px;
		max-height: 60vh;
	}
	.menu-item {
		display: block;
		padding: 8px 14px;
		font-size: 12.5px;
		cursor: pointer;
		color: var(--text-2);
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		font-family: inherit;
		white-space: nowrap;
	}
	.menu-item:hover {
		background: var(--surface-raised);
	}
	.menu-item.sel {
		color: var(--accent-soft);
		font-weight: 600;
	}
	.menu-note {
		display: block;
		border-top: 1px solid var(--border-soft);
		padding: 8px 14px;
		max-width: 210px;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--accent-link);
		text-decoration: none;
	}
	.menu-note:hover {
		background: var(--surface-raised);
		text-decoration: underline;
	}
	/* The arrow ends the sentence, so it rides the text baseline rather than being a
	   flex item (which would stop the note from wrapping as a paragraph). */
	.menu-note :global(svg) {
		vertical-align: -2px;
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
	/* Centered when there are only a few cards; wraps and fills the full width once enough
	 * cards are present to need it. */
	.grid {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 14px;
		align-items: flex-start;
	}
	.card {
		flex: 1 1 300px;
		max-width: 380px;
		/* Without this a flex item's min-width is `auto` (its min-content width), which grows
		 * once the card's spool chips load. That can push the card past the point where N of
		 * them still fit on a row, so the grid drops a column and re-wraps — cards jumping
		 * sideways as each group's query lands (the width-wise "flicker"). Pinning min-width to
		 * 0 makes the column count depend only on the flex-basis and available width, so it
		 * stays put as cards fill. */
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		min-height: 110px;
	}
	.card-head {
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
	.card-name {
		flex: 1;
		font-weight: 600;
		font-size: 13px;
	}
	.card-name.editable {
		cursor: text;
		border-radius: 4px;
	}
	.card-name.editable:hover {
		background: var(--bg);
	}
	.card-name-input {
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
	.card-name-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.rename-error {
		font-size: 11px;
		color: var(--danger-soft);
		padding: 0 12px 8px;
	}
	.card-meta {
		font-size: 11px;
		color: var(--text-dim);
	}
	.card-delete {
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
	.card-delete:hover {
		color: var(--danger-soft);
		background: var(--bg);
	}
	/* Wraps the drop zone so the "drop here" hint can overlay an empty card without being a
	 * child of the zone (which maps its children 1:1 to items). */
	.card-body-wrap {
		position: relative;
		display: flex;
		flex: 1;
	}
	/* Capped so a group with hundreds of spools stays a card rather than an endless column;
	 * scrolling it to the bottom fetches the next page. */
	.card-body {
		/* Single source of truth for the height cap: the reserved min-height (set inline from
		 * the spool count) is clamped to this too, so it never exceeds max-height. */
		--card-body-cap: min(52vh, 420px);
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		flex: 1;
		min-height: 42px;
		max-height: var(--card-body-cap);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* Indeterminate bar along the bottom of a card while a page is in flight. */
	.card-loading {
		height: 2px;
		margin: 0 12px 6px;
		border-radius: 2px;
		overflow: hidden;
		background: var(--border-soft);
	}
	.card-loading::after {
		content: '';
		display: block;
		height: 100%;
		width: 35%;
		border-radius: 2px;
		background: var(--accent);
		animation: card-load 1s ease-in-out infinite;
	}
	@keyframes card-load {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(320%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card-loading::after {
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
	.no-groups {
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

	@media (max-width: 860px) {
		.ctrl-label {
			display: none;
		}
	}
	/* Phone: keep the controls together on the first row (title · group-by · new group)
	   and give the hint the full width of the row below them. */
	@media (max-width: 640px) {
		.add {
			order: 2;
		}
		.hint {
			order: 3;
			flex-basis: 100%;
		}
	}
</style>
