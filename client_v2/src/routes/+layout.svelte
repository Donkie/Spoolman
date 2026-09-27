<script lang="ts">
	import '../app.css';
	import TopBar from '$components/TopBar.svelte';
	import Footer from '$components/Footer.svelte';
	import AddSpoolModal from '$components/AddSpoolModal.svelte';
	import QrScannerModal from '$components/QrScannerModal.svelte';
	import Toaster from '$components/Toaster.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { serverInfo } from '$lib/stores/serverInfo.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { startLiveSync } from '$lib/api/liveSync';
	import { scanRelay, type TagScan } from '$lib/api/scanRelay';
	import { findTagHolder } from '$lib/api/tags';
	import { nfcSupported, watchTagUids } from '$lib/utils/nfc';
	import { scanner, isBrowsableRoute } from '$lib/stores/scanner.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { getLocale, getTextDirection } from '$lib/paraglide/runtime';
	import { openSearchResult } from '$lib/library/params';
	import { filamentLabel } from '$lib/utils/library';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Keep <html data-theme> in sync with the preference (and OS changes when set
	// to "system"). The initial paint is already themed by the inline script in
	// app.html; this takes over once the app hydrates.
	$effect(() => {
		theme.apply();
	});

	// Reflect the resolved locale onto <html lang>/<dir>. app.html ships a static
	// "en"/"ltr" default (SSR is off, so the paraglide placeholders would never be
	// substituted); this applies the real locale once the app hydrates. Changing
	// the language reloads the page, so reading getLocale() once at mount is enough.
	$effect(() => {
		document.documentElement.lang = getLocale();
		document.documentElement.dir = getTextDirection();
	});

	// Load server settings and start central live-sync (keeps the reactive cache,
	// and thus every view that reads it, up to date with WebSocket events).
	$effect(() => {
		settings.load();
		serverInfo.load();

		return startLiveSync();
	});

	// The one place a scanned tag is allowed to move this browser.
	//
	// Exactly one subscription, and it lives here rather than in whichever
	// component happens to care, because two mounted components reacting to the
	// same scan is how one tap becomes two navigations. Dialogs that need scans
	// (AddTagModal) subscribe for their own purposes but never navigate.
	//
	// It exists only while auto-navigate is on, which also means a browser that
	// isn't using NFC holds no relay socket at all. Re-runs when the paired reader
	// changes, moving the subscription to the new pool.
	$effect(() => {
		if (!scanner.autoNavigate) return;
		return scanRelay.subscribe(scanner.pool, (scan) => {
			scanner.receive(scan);
			onScan(scan);
		});
	});

	// The same, for a tag tapped against this device's own NFC (Chrome on Android
	// over HTTPS). Pairing is about which remote reader to follow, so it has no say
	// here: the phone in your hand is always this browser's reader.
	//
	// Without a user gesture scan() only starts if NFC permission is already
	// granted, which is the usual case on reload. Otherwise it starts the moment
	// permission is granted, e.g. by reading a tag in the link-tag dialog.
	$effect(() => {
		if (!scanner.autoNavigate || !nfcSupported()) return;
		const ac = new AbortController();
		const start = () =>
			watchTagUids(
				ac.signal,
				async (uid) => {
					// A tag dialog is open and reading this very tap for itself.
					if (scanner.suppressed) return;
					const holder = await findTagHolder(uid, ac.signal).catch(() => undefined);
					if (ac.signal.aborted) return;
					onScan({
						uid,
						readerId: 'this-device',
						spool: holder?.kind === 'spool' ? holder.spool : undefined,
						filament: holder?.kind === 'filament' ? holder.filament : undefined
					});
				},
				() => {} // no permission yet, or NFC switched off: the relay still works
			);
		start();
		navigator.permissions
			?.query({ name: 'nfc' as PermissionName })
			.then((status) => {
				status.addEventListener(
					'change',
					() => {
						if (status.state === 'granted') start();
					},
					{ signal: ac.signal }
				);
			})
			.catch(() => {});
		return () => ac.abort();
	});

	function onScan(scan: TagScan) {
		// Read inside the handler, never in the effect body: depending on the route
		// here would tear the socket down and rebuild it on every navigation.
		// A page you are configuring reacts to nothing — not even the toast, which
		// during pairing would explain how to link the tag you just tapped to pair.
		if (!isBrowsableRoute(page.route.id)) return;
		// A tag identifies a spool or a filament, and either opens in the inspector.
		const hit = scan.spool
			? { kind: 'spool' as const, id: String(scan.spool.id) }
			: scan.filament
				? { kind: 'filament' as const, id: scan.filament.id }
				: null;
		if (!hit) {
			// An unknown tag has nowhere to navigate to, and silently ignoring it
			// would look like the tap failed. Say what was read and where to link
			// it — repeats coalesce, and the relay already debounces a reader that
			// re-reads a tag left sitting on it. Not an error: tapping a tag no
			// spool claims yet is how enrolling one starts.
			toasts.info(m['tags.scan.unknown']({ uid: scan.uid }));
			return;
		}
		if (!scanner.mayNavigate(document.activeElement, ui.addModalOpen || ui.scannerOpen)) return;
		// The same navigation a picked search result gets, and for the same reason:
		// on the Library it merges the selection into the view you are already in,
		// so a tap reveals the spool without throwing away the grouping, sort and
		// filters you had set up; from anywhere else it opens the Library on just
		// that spool. The inspector resolves a selection by id on its own, so the
		// spool still opens when the active filters exclude it from the list behind
		// it -- a scan answers "where is this spool", never "is it in this view".
		openSearchResult(hit.kind, hit.id);
		// Say what the tap did. The reader is often in another room from the screen,
		// and a page that changes by itself with no word why reads as a glitch. The
		// relay already cached the spool's filament and vendor, so naming is local.
		const filament = scan.filament ?? inventory.filamentById(scan.spool?.filamentId ?? '');
		const name = filament ? filamentLabel(filament, inventory.vendorById(filament.vendorId)) : '';
		toasts.info(
			scan.spool
				? m['tags.scan.openedSpool']({ id: scan.spool.id, name })
				: m['tags.scan.openedFilament']({ name })
		);
	}
</script>

<div class="app">
	<TopBar onadd={() => ui.openAddModal()} onscan={() => ui.openScanner()} />

	<main>{@render children()}</main>
	<Footer />
</div>

<AddSpoolModal
	open={ui.addModalOpen}
	presetFilamentId={ui.addModalFilamentId}
	duplicateFilamentId={ui.addModalDuplicateId}
	onclose={() => ui.closeAddModal()}
/>

<QrScannerModal open={ui.scannerOpen} onclose={() => ui.closeScanner()} />

<Toaster />

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}

	main {
		display: flex;
		flex: 1;
		min-height: 0;
	}
</style>
