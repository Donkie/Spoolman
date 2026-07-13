<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import Button from '$components/Button.svelte';
	import LabelDesigner from '$components/labels/LabelDesigner.svelte';
	import PrintLayoutPanel from '$components/labels/PrintLayoutPanel.svelte';
	import { labelDesigns } from '$lib/stores/labelDesigns.svelte';
	import type { LabelDesign } from '$lib/labels/types';

	// Spool ids to pre-select in the print tab (deep-link, e.g. /labels?spools=1,2).
	const preselected = $derived(
		($page.url.searchParams.get('spools') ?? '')
			.split(',')
			.map((s) => parseInt(s, 10))
			.filter((n) => Number.isFinite(n))
	);

	let selectedId = $state<string | null>(null);
	let working = $state<LabelDesign | null>(null);
	// Deep-linking with ?spools=… lands straight on the Print tab.
	let tab = $state<'design' | 'print'>(untrack(() => preselected).length > 0 ? 'print' : 'design');
	let saving = $state(false);
	let savedSnapshot = $state('');

	$effect(() => {
		void labelDesigns.load().then(() => {
			if (selectedId === null && labelDesigns.designs.length > 0) {
				selectDesign(labelDesigns.designs[0].id);
			}
		});
	});

	function clone(d: LabelDesign): LabelDesign {
		return structuredClone($state.snapshot(d)) as LabelDesign;
	}

	function selectDesign(id: string) {
		const d = labelDesigns.designs.find((x) => x.id === id);
		if (!d) return;
		selectedId = id;
		working = clone(d);
		savedSnapshot = JSON.stringify(working);
	}

	const dirty = $derived(working !== null && JSON.stringify(working) !== savedSnapshot);

	async function newDesign() {
		const d = await labelDesigns.create();
		selectDesign(d.id);
		tab = 'design';
	}
	async function duplicate() {
		if (!selectedId) return;
		const d = await labelDesigns.duplicate(selectedId);
		if (d) selectDesign(d.id);
	}
	async function remove() {
		if (!selectedId) return;
		if (!confirm('Delete this label design?')) return;
		await labelDesigns.remove(selectedId);
		selectedId = null;
		working = null;
		if (labelDesigns.designs.length > 0) selectDesign(labelDesigns.designs[0].id);
	}
	async function save() {
		if (!working) return;
		saving = true;
		try {
			await labelDesigns.save(clone(working));
			savedSnapshot = JSON.stringify(working);
		} catch (e) {
			console.error('Failed to save design', e);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Labels | Spoolman</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">Label designer</div>
		<div class="subtitle">
			Design QR-code labels with any spool, filament, or vendor field, then print them on sheets or a label
			printer. Designs are saved on the server.
		</div>

		<div class="toolbar">
			<select
				value={selectedId ?? ''}
				onchange={(e) => selectDesign(e.currentTarget.value)}
				disabled={labelDesigns.designs.length === 0}
			>
				{#if labelDesigns.designs.length === 0}
					<option value="">No designs yet</option>
				{/if}
				{#each labelDesigns.designs as d (d.id)}
					<option value={d.id}>{d.name}</option>
				{/each}
			</select>

			{#if working}
				<input class="name" bind:value={working.name} placeholder="Design name" />
			{/if}

			<div class="spacer"></div>

			<Button variant="outline" onclick={newDesign}>+ New</Button>
			{#if working}
				<Button variant="outline" onclick={duplicate}>Duplicate</Button>
				<Button variant="outline" onclick={remove}>Delete</Button>
				<Button onclick={save} disabled={saving || !dirty}
					>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Button
				>
			{/if}
		</div>

		{#if working}
			<div class="tabs">
				<button class:active={tab === 'design'} onclick={() => (tab = 'design')}>Design</button>
				<button class:active={tab === 'print'} onclick={() => (tab = 'print')}>Print</button>
			</div>

			{#if tab === 'design'}
				<LabelDesigner bind:design={working} />
			{:else}
				<PrintLayoutPanel design={working} {preselected} />
			{/if}
		{:else}
			<div class="blank">
				<p>You don't have any label designs yet.</p>
				<Button onclick={newDesign}>+ Create your first label</Button>
			</div>
		{/if}
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
	}
	.wrap {
		max-width: 1040px;
		margin: 0 auto;
		padding: 28px 24px 60px;
	}
	.title {
		font-size: 20px;
		font-weight: 600;
	}
	.subtitle {
		color: var(--text-dim);
		font-size: 13px;
		margin: 6px 0 20px;
		max-width: 640px;
		line-height: 1.5;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 18px;
		flex-wrap: wrap;
	}
	.toolbar select,
	.name {
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		padding: 8px 10px;
		color: var(--text);
		font-size: 13px;
		font-family: inherit;
	}
	.name {
		flex: 1;
		min-width: 160px;
		max-width: 280px;
	}
	.toolbar select:focus,
	.name:focus {
		outline: none;
		border-color: var(--accent);
	}
	.spacer {
		flex: 1;
	}
	.tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.tabs button {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-dim);
		padding: 8px 14px;
		font-size: 13px;
		cursor: pointer;
		margin-bottom: -1px;
	}
	.tabs button.active {
		color: var(--accent-soft);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}
	.blank {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 80px 0;
		color: var(--text-dim);
	}
</style>
