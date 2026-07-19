<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import ColorEditor from '../ColorEditor.svelte';
	import Button from '../Button.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Square from '@lucide/svelte/icons/square';
	import SquareCheck from '@lucide/svelte/icons/square-check';
	import EditableField from '../EditableField.svelte';
	import NumberInput from '../NumberInput.svelte';
	import ProgressBar from '../ProgressBar.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import Breadcrumbs from '../Breadcrumbs.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import type { Filament, Spool } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { serverInfo } from '$lib/stores/serverInfo.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import * as params from '$lib/library/params';
	import { pct, grams } from '$lib/utils/format';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live } from '$lib/api/live';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';
	import { trackSave } from '$lib/utils/autosave';
	import * as m from '$lib/paraglide/messages';

	let { filament }: { filament: Filament } = $props();

	// Undefined when the filament has no manufacturer set (or it isn't cached yet) —
	// the display falls back to a plain "no manufacturer" note instead of a link.
	let vendor = $derived(inventory.vendorById(filament.vendorId));

	// Fetch this filament's spools from the API (scoped list) rather than the cache.
	// Depend on the primitive id (via $derived) — not `filament` itself — so the
	// fetch's own cache upsert (which replaces the `filament` prop object) doesn't
	// re-trigger this effect in an infinite loop.
	let filamentId = $derived(filament.id);
	let spools = $state<Spool[]>([]);
	// Bumped by live spool events so adding/removing/editing a spool refetches
	// this filament's list (the fetch below is server-ordered, not read from the
	// cache, so it needs an explicit nudge to stay in sync).
	let revision = $state(0);
	// Archived spools are hidden by default here, same as in the library list.
	let showArchived = $state(false);
	$effect(() => live.subscribe('spool', {}, () => revision++));
	$effect(() => {
		const id = filamentId;
		const archived = showArchived;
		revision; // refetch on live spool events
		let cancelled = false;
		spoolSource
			.listSpools({
				filters: {},
				sort: [{ field: 'last_used', dir: 'desc' }],
				groupScope: { field: 'filament', key: id },
				allowArchived: archived,
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
		trackSave(spoolSource.saveFilament(id, patch))
	);
	$effect(() => () => saver.flush());

	function set(patch: Partial<Filament>) {
		inventory.patchFilament(filament.id, patch);
		saver.push(filament.id, patch);
	}

	const extraSaver = makeExtraSaver(
		(e) => inventory.patchFilament(filament.id, { extra: e }),
		(p) => trackSave(spoolSource.saveFilament(filament.id, { extra: p })),
		() => filament.extra
	);
	$effect(() => () => extraSaver.flush());
</script>

<div class="insp">
	<Breadcrumbs
		items={[
			vendor
				? { label: vendor.name, onclick: () => params.select('vendor', vendor.id) }
				: { label: m['add.noManufacturer'](), muted: true },
			{ label: filament.name }
		]}
	/>

	<div class="head">
		<Swatch colors={filament.colors} size={40} radius={9} />
		<div class="titles">
			<div class="title">
				{filament.name}
				{#if filament.externalId}<span
						class="ext-badge"
						title={serverInfo.externalDbName + ' · ' + filament.externalId}>{serverInfo.externalDbName}</span
					>{/if}
			</div>
			<div class="subtitle">
				{#if vendor}{vendor.name} ·
				{/if}{filament.material} · {filament.diameter} mm
			</div>
		</div>
		<div class="add">
			<Button onclick={() => ui.openAddModal(filament.id)}
				><Plus size={15} /> {m['inspector.addSpoolsOfThis']()}</Button
			>
		</div>
	</div>

	<SectionLabel>
		{#snippet children()}<span style="padding-left:20px"
				>{m['inspector.spoolsCount']({ count: spools.length })}</span
			>{/snippet}
		{#snippet right()}
			<button
				class="arch-toggle"
				role="switch"
				aria-checked={showArchived}
				onclick={() => (showArchived = !showArchived)}
			>
				{#if showArchived}<SquareCheck size={14} />{:else}<Square size={14} />{/if}
				{m['buttons.showArchived']()}
			</button>
		{/snippet}
	</SectionLabel>
	<div class="spools">
		{#each spools as s (s.id)}
			<button
				class="spool-row"
				class:archived={s.archived}
				onclick={() => params.select('spool', String(s.id))}
			>
				<span class="id mono">#{s.id}</span>
				<span class="state"
					>{s.archived
						? m['spool.fields.archived']()
						: s.unused
							? m['library.unused']()
							: m['library.inUse']()}</span
				>
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
				<Field label={m['filament.fields.colorHex']()}>
					{#key filament.id}
						<ColorEditor
							colors={filament.colors}
							direction={filament.multiColorDirection}
							onchange={(v) => set({ colors: v.colors, multiColorDirection: v.direction })}
						/>
					{/key}
				</Field>
				<Field label={m['filament.fields.diameter']()}>
					<NumberInput
						dense
						width="200px"
						unit="mm"
						step={0.05}
						min={0}
						value={filament.diameter}
						onchange={(v) => set({ diameter: v || filament.diameter })}
					/>
				</Field>
				<Field label={m['filament.fields.density']()}>
					<NumberInput
						dense
						width="200px"
						unit="g/cm³"
						step={0.01}
						min={0}
						value={filament.density}
						onchange={(v) => set({ density: v || filament.density })}
					/>
				</Field>
				<Field label={m['filament.fields.settingsExtruderTemp']()}>
					<NumberInput
						dense
						width="200px"
						unit="°C"
						step={5}
						min={0}
						value={filament.nozzleTemp}
						onchange={(v) => set({ nozzleTemp: Math.round(v) })}
					/>
				</Field>
				<Field label={m['filament.fields.settingsBedTemp']()}>
					<NumberInput
						dense
						width="200px"
						unit="°C"
						step={5}
						min={0}
						value={filament.bedTemp}
						onchange={(v) => set({ bedTemp: Math.round(v) })}
					/>
				</Field>
				<Field label={m['filament.fields.price']()}>
					<NumberInput
						dense
						width="200px"
						unit={settings.currency}
						step={1}
						min={0}
						value={filament.price}
						onchange={(v) => set({ price: v })}
					/>
				</Field>
				<Field label={m['filament.fields.articleNumber']()}>
					<EditableField
						value={filament.articleNumber ?? ''}
						mono
						oninput={(v) => set({ articleNumber: v })}
					/>
				</Field>
				<Field label={m['filament.fields.registered']()}>{filament.registeredLabel}</Field>
				<Field label={m['filament.fields.comment']()}>
					<EditableField value={filament.comment} oninput={(v) => set({ comment: v })} />
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
		border: 1px solid var(--swatch-border);
		border-radius: var(--radius-md);
		font-size: 12px;
		cursor: pointer;
		color: inherit;
		font-family: inherit;
		text-align: left;
	}
	.spool-row:hover {
		border-color: var(--swatch-border-hover);
	}
	.spool-row.archived {
		opacity: 0.6;
	}
	.arch-toggle {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 20px 0 0;
		font: inherit;
		font-size: 11.5px;
		background: none;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
	}
	.arch-toggle:hover {
		color: var(--text-2);
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
