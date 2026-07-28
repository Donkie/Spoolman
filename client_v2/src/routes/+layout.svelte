<script lang="ts">
	import '../app.css';
	import TopBar from '$components/TopBar.svelte';
	import Footer from '$components/Footer.svelte';
	import AddSpoolModal from '$components/AddSpoolModal.svelte';
	import QrScannerModal from '$components/QrScannerModal.svelte';
	import Toaster from '$components/Toaster.svelte';
	import LoginScreen from '$components/auth/LoginScreen.svelte';
	import SetupScreen from '$components/auth/SetupScreen.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { serverInfo } from '$lib/stores/serverInfo.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { startLiveSync } from '$lib/api/liveSync';
	import { live } from '$lib/api/live';
	import { getLocale, getTextDirection } from '$lib/paraglide/runtime';
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

	// Find out whether anyone needs to sign in before rendering anything. With auth
	// disabled this resolves immediately and reports full capability, so the default
	// configuration behaves exactly as it did before auth existed.
	$effect(() => {
		auth.load();
	});

	// Load server settings and start central live-sync (keeps the reactive cache,
	// and thus every view that reads it, up to date with WebSocket events).
	//
	// Split from the effect above and gated on being able to read: starting live-sync
	// while signed out would open websockets the server immediately closes. Because
	// canRead is reactive, signing in re-runs this and everything starts for real; the
	// returned teardown runs on sign-out.
	$effect(() => {
		if (!auth.ready || !auth.canRead) return;

		settings.load();
		serverInfo.load();
		// Sockets stopped by an auth rejection stay stopped until told otherwise.
		live.rearm();

		return startLiveSync();
	});
</script>

{#if !auth.ready}
	<!-- Nothing renders until we know: showing the app and then yanking it away
	     would flash the interface at someone who cannot use it. -->
	<div class="boot">{m['auth.loading']()}…</div>
{:else if auth.needsSetup}
	<div class="app"><SetupScreen /></div>
{:else if !auth.canRead}
	<div class="app"><LoginScreen /></div>
{:else}
	<div class="app">
		<TopBar onadd={() => ui.openAddModal()} onscan={() => ui.openScanner()} />

		<main>{@render children()}</main>
		<Footer />
	</div>

	{#if auth.canManage}
		<AddSpoolModal
			open={ui.addModalOpen}
			presetFilamentId={ui.addModalFilamentId}
			onclose={() => ui.closeAddModal()}
		/>
	{/if}

	<QrScannerModal open={ui.scannerOpen} onclose={() => ui.closeScanner()} />
{/if}

<!-- Outside the branches: sign-in errors need somewhere to surface too. -->
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

	.boot {
		display: grid;
		place-items: center;
		height: 100vh;
		height: 100dvh;
		background: var(--bg);
		color: var(--text-muted);
		font-size: 0.9rem;
	}
</style>
