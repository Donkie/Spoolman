<script lang="ts">
	import '../app.css';
	import TopBar from '$components/TopBar.svelte';
	import Footer from '$components/Footer.svelte';
	import AddSpoolModal from '$components/AddSpoolModal.svelte';
	import QrScannerModal from '$components/QrScannerModal.svelte';
	import NfcScannerModal from '$components/NfcScannerModal.svelte';
	import Toaster from '$components/Toaster.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { serverInfo } from '$lib/stores/serverInfo.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { nfcState } from '$lib/stores/nfc.svelte';
	import { startLiveSync } from '$lib/api/liveSync';
	import { getLocale, getTextDirection } from '$lib/paraglide/runtime';
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
		nfcState.refresh();

		return startLiveSync();
	});
</script>

<div class="app">
	<TopBar
		onadd={() => ui.openAddModal()}
		onscan={() => ui.openScanner()}
		onnfcscan={() => ui.openNfcScanner()}
	/>

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

<NfcScannerModal open={ui.nfcScannerOpen} onclose={() => ui.closeNfcScanner()} />

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
