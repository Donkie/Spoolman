<script lang="ts">
	import '../app.css';
	import TopBar from '$components/TopBar.svelte';
	import Footer from '$components/Footer.svelte';
	import AddSpoolModal from '$components/AddSpoolModal.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { startLiveSync } from '$lib/api/liveSync';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Load server settings and start central live-sync (keeps the reactive cache,
	// and thus every view that reads it, up to date with WebSocket events).
	$effect(() => {
		settings.load();
		return startLiveSync();
	});
</script>

<div class="app">
	<TopBar onadd={() => ui.openAddModal()} />
	<main>
		{@render children()}
	</main>
	<Footer />
</div>

<AddSpoolModal
	open={ui.addModalOpen}
	presetFilamentId={ui.addModalFilamentId}
	onclose={() => ui.closeAddModal()}
/>

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
