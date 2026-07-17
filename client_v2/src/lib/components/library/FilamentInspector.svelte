<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import EditableField from '../EditableField.svelte';
	import ProgressBar from '../ProgressBar.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import type { Filament, Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import * as params from '$lib/library/params';
	import { pct, grams } from '$lib/utils/format';
	import { spoolSource } from '$lib/api/spoolSource';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';
	import * as m from '$lib/paraglide/messages';

	let { filament }: { filament: Filament } = $props();

	let vendor = $derived(inventory.vendorOf(filament));

	// Fetch this filament's spools from the API (scoped list) rather than the cache.
	// Depend on the primitive id (via $derived) — not `filament` itself — so the
	// fetch's own cache upsert (which replaces the `filament` prop object) doesn't
	// re-trigger this effect in an infinite loop.
	let filamentId = $derived(filament.id);
	let spools = $state<Spool[]>([]);
	$effect(() => {
		const id = filamentId;
		let cancelled = false;
		spoolSource
			.listSpools({
				filters: {},
				sort: [{ field: 'last_used', dir: 'desc' }],
				groupScope: { field: 'filament', key: id },
				limit: 100,
				offset: 0,
				lowThreshold: settings.lowThreshold
			})
			.then((page) => {
				if (!cancelled) spools = page.items;
			})
			.catch((e) => console.error('Failed to load filament spools', e));
		return () => {
			cancelled = true;
		};
	});

	const saver = makeSaver<string, Partial<Filament>>((id, patch) =>
		spoolSource.saveFilament(id, patch).catch((e) => console.error('Save failed', e))
	);
	$effect(() => () => saver.flush());

	function set(patch: Partial<Filament>) {
		inventory.patchFilament(filament.id, patch);
		saver.push(filament.id, patch);
	}

	const extraSaver = makeExtraSaver(
		(e) => inventory.patchFilament(filament.id, { extra: e }),
		(p) =>
			spoolSource.saveFilament(filament.id, { extra: p }).catch((err) => console.error('Save failed', err)),
		() => filament.extra
	);
	$effect(() => () => extraSaver.flush());
</script>

<div class="insp">
	<Breadcrumbs
		items={[
			{ label: vendor.name, onclick: () => params.select('vendor', vendor.id) },
			{ label: filament.name }
		]}
	/>

	<div class="head">
		<Swatch colors={filament.colors} size={40} radius={9} />
		<div class="titles">
			<div class="title">
				{filament.name}
				{#if filament.externalId}<span class="ext-badge" title={'SpoolmanDB · ' + filament.externalId}
						>SpoolmanDB</span
					>{/if}
			</div>
			<div class="subtitle">{vendor.name} · {filament.material} · {filament.diameter} mm</div>
		</div>
		<div class="add">
			<Button onclick={() => ui.openAddModal(filament.id)}>＋ {m['inspector.addSpoolsOfThis']()}</Button>
		</div>
	</div>

	<SectionLabel>
		{#snippet children()}<span style="padding-left:20px"
				>{m['inspector.spoolsCount']({ count: spools.length })}</span
			>{/snippet}
	</SectionLabel>
	<div class="spools">
		{#each spools as s (s.id)}
			<button class="spool-row" onclick={() => params.select('spool', String(s.id))}>
				<span class="id mono">#{s.id}</span>
				<span class="state">{s.unused ? m['library.unused']() : m['library.inUse']()}</span>
				<span class="barwrap">
					<ProgressBar
						value={pct(s.remaining, s.initial)}
						width="100%"
						danger={settings.isLow(s.remaining, s.unused)}
					/>
				</span>
				<span class="rem mono">{grams(s.remaining)} g</span>
				<span class="loc">{s.location ?? ''}</span>
			</button>
		{/each}
	</div>

	<div class="grid">
		<div class="col">
			<SectionLabel>{m['inspector.specs']()}</SectionLabel>
			<FieldGrid>
				<Field label={m['filament.fields.name']()}>
					<EditableField value={filament.name} oninput={(v) => set({ name: v })} />
				</Field>
				<Field label={m['filament.fields.material']()}>
					<EditableField value={filament.material} oninput={(v) => set({ material: v })} />
				</Field>
				<Field label={m['inspector.colorHex']()}>
					<EditableField value={filament.colors[0]} mono oninput={(v) => set({ colors: [v] })} />
				</Field>
				<Field label={m['inspector.diameterMm']()}>
					<EditableField
						value={filament.diameter}
						mono
						oninput={(v) => set({ diameter: parseFloat(v) || filament.diameter })}
					/>
				</Field>
				<Field label={m['filament.fields.density']()}>
					<EditableField
						value={filament.density}
						mono
						oninput={(v) => set({ density: parseFloat(v) || filament.density })}
					/>
				</Field>
				<Field label={m['inspector.nozzleC']()}>
					<EditableField
						value={filament.nozzleTemp}
						mono
						oninput={(v) => set({ nozzleTemp: parseInt(v, 10) || filament.nozzleTemp })}
					/>
				</Field>
				<Field label={m['inspector.bedC']()}>
					<EditableField
						value={filament.bedTemp}
						mono
						oninput={(v) => set({ bedTemp: parseInt(v, 10) || filament.bedTemp })}
					/>
				</Field>
				<Field label={m['inspector.defaultPrice']({ currency: settings.currency })}>
					<EditableField value={filament.price} mono oninput={(v) => set({ price: parseFloat(v) || 0 })} />
				</Field>
			</FieldGrid>

			<ExtraFieldsSection entity="filament" extra={filament.extra} onchange={extraSaver.change} />
		</div>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 20px 16px;
		border-bottom: 1px solid var(--border-soft);
	}
	.titles {
		min-width: 0;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.ext-badge {
		font-size: 10px;
		font-weight: 600;
		vertical-align: middle;
		margin-left: 8px;
		padding: 1px 7px;
		border-radius: 8px;
		background: var(--accent-wash);
		border: 1px solid var(--accent-border);
		color: var(--accent-soft);
		cursor: default;
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}
	.add {
		margin-left: auto;
		flex: none;
	}
	.spools {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 20px;
	}
	.spool-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 12px;
		background: var(--surface-2);
		border: 1px solid #363636;
		border-radius: var(--radius-md);
		font-size: 12px;
		cursor: pointer;
		color: inherit;
		font-family: inherit;
		text-align: left;
	}
	.spool-row:hover {
		border-color: #4a4a4a;
	}
	.id {
		color: var(--text-muted);
		width: 36px;
		flex: none;
	}
	.state {
		color: var(--text-2);
		flex: none;
	}
	.barwrap {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.rem {
		color: var(--text-2);
		flex: none;
	}
	.loc {
		color: var(--text-dim);
		flex: none;
	}
	.grid {
		padding: 4px 20px 24px;
	}
	@media (max-width: 620px) {
		.add {
			display: none;
		}
	}
</style>
