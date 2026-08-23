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
	import { scanRelay } from '$lib/api/scanRelay';
	import { scanner, isBrowsableRoute } from '$lib/stores/scanner.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { getLocale, getTextDirection } from '$lib/paraglide/runtime';
	import { openSearchResult } from '$lib/library/params';
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
			// Read inside the handler, never in the effect body: depending on the route
			// here would tear the socket down and rebuild it on every navigation.
			// A page you are configuring reacts to nothing — not even the toast, which
			// during pairing would explain how to link the tag you just tapped to pair.
			if (!isBrowsableRoute(page.route.id)) return;
			if (!scan.spool) {
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
			openSearchResult('spool', String(scan.spool.id));
		});
	});
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
