<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import Button from '$components/Button.svelte';
	import LabelDesigner from '$components/labels/LabelDesigner.svelte';
	import PrintLayoutPanel from '$components/labels/PrintLayoutPanel.svelte';
	import { labelDesigns } from '$lib/stores/labelDesigns.svelte';
	import type { LabelDesign } from '$lib/labels/types';
	import * as m from '$lib/paraglide/messages';

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

	// Keep-alive: once a tab has been visited, keep it mounted (just hidden) so
	// switching tabs doesn't reset its local state (selected spools, search, etc).
	let visitedDesign = $state(untrack(() => tab) === 'design');
	let visitedPrint = $state(untrack(() => tab) === 'print');
	$effect(() => {
		if (tab === 'design') visitedDesign = true;
		else visitedPrint = true;
	});

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
		if (!confirm(m['labels.deleteConfirm']())) return;
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
	<title>{m['nav.labels']()} | Spoolman</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">{m['labels.designerTitle']()}</div>
		<div class="subtitle">{m['labels.designerDesc']()}</div>

		<div class="toolbar">
			<select
				value={selectedId ?? ''}
				onchange={(e) => selectDesign(e.currentTarget.value)}
				disabled={labelDesigns.designs.length === 0}
			>
				{#if labelDesigns.designs.length === 0}
					<option value="">{m['labels.noDesignsOption']()}</option>
				{/if}
				{#each labelDesigns.designs as d (d.id)}
					<option value={d.id}>{d.name}</option>
				{/each}
			</select>

			{#if working}
				<input class="name" bind:value={working.name} placeholder={m['labels.designName']()} />
			{/if}

			<div class="spacer"></div>

			<Button variant="outline" onclick={newDesign}>+ {m['labels.new']()}</Button>
			{#if working}
				<Button variant="outline" onclick={duplicate}>{m['labels.duplicate']()}</Button>
				<Button variant="outline" onclick={remove}>{m['buttons.delete']()}</Button>
				<Button onclick={save} disabled={saving || !dirty}
					>{saving ? m['labels.saving']() : dirty ? m['buttons.save']() : m['labels.saved']()}</Button
				>
			{/if}
		</div>

		{#if working}
			<div class="tabs">
				<button class:active={tab === 'design'} onclick={() => (tab = 'design')}
					>{m['labels.tabDesign']()}</button
				>
				<button class:active={tab === 'print'} onclick={() => (tab = 'print')}
					>{m['labels.tabPrint']()}</button
				>
			</div>

			{#if visitedDesign}
				<div class:hidden={tab !== 'design'}>
					<LabelDesigner bind:design={working} />
				</div>
			{/if}
			{#if visitedPrint}
				<div class:hidden={tab !== 'print'}>
					<PrintLayoutPanel design={working} {preselected} />
				</div>
			{/if}
		{:else}
			<div class="blank">
				<p>{m['labels.blank']()}</p>
				<Button onclick={newDesign}>+ {m['labels.createFirst']()}</Button>
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
	.hidden {
		display: none;
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
