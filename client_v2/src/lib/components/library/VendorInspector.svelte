<script lang="ts">
	import Swatch from '../Swatch.svelte';
	import EditableField from '../EditableField.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import type { Filament, Vendor } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import * as params from '$lib/library/params';
	import { spoolSource } from '$lib/api/spoolSource';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';

	let { vendor }: { vendor: Vendor } = $props();

	// Depend on the primitive id (via $derived) — not `vendor` itself — so the
	// fetch's own cache upsert (which replaces the `vendor` prop object) doesn't
	// re-trigger this effect in an infinite loop.
	let vendorId = $derived(vendor.id);
	let filaments = $state<Filament[]>([]);
	$effect(() => {
		const id = vendorId;
		let cancelled = false;
		spoolSource
			.listFilamentsByVendor(id)
			.then((list) => {
				if (!cancelled) filaments = list;
			})
			.catch((e) => console.error('Failed to load vendor filaments', e));
		return () => {
			cancelled = true;
		};
	});

	let initials = $derived(
		vendor.name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);

	const saver = makeSaver<string, Partial<Vendor>>((id, patch) =>
		spoolSource.saveVendor(id, patch).catch((e) => console.error('Save failed', e))
	);
	$effect(() => () => saver.flush());

	function set(patch: Partial<Vendor>) {
		inventory.patchVendor(vendor.id, patch);
		saver.push(vendor.id, patch);
	}

	const extraSaver = makeExtraSaver(
		(e) => inventory.patchVendor(vendor.id, { extra: e }),
		(p) => spoolSource.saveVendor(vendor.id, { extra: p }).catch((err) => console.error('Save failed', err)),
		() => vendor.extra
	);
	$effect(() => () => extraSaver.flush());
</script>

<div class="insp">
	<div class="head">
		<div class="avatar">{initials}</div>
		<div class="titles">
			<div class="title">{vendor.name}</div>
			<div class="subtitle">
				{filaments.length} filament{filaments.length === 1 ? '' : 's'} · empty spool {vendor.emptyWeight} g
			</div>
		</div>
	</div>

	<div class="grid">
		<div class="col">
			<SectionLabel>Manufacturer</SectionLabel>
			<FieldGrid labelWidth="140px">
				<Field label="Name">
					<EditableField value={vendor.name} oninput={(v) => set({ name: v })} />
				</Field>
				<Field label="Empty spool wt. g">
					<EditableField
						value={vendor.emptyWeight}
						mono
						oninput={(v) => set({ emptyWeight: parseInt(v, 10) || vendor.emptyWeight })}
					/>
				</Field>
			</FieldGrid>

			<ExtraFieldsSection entity="vendor" extra={vendor.extra} onchange={extraSaver.change} />
		</div>
		<div class="col">
			<SectionLabel>Filaments</SectionLabel>
			<div class="fils">
				{#each filaments as f (f.id)}
					<button class="fil-row" onclick={() => params.select('filament', f.id)}>
						<Swatch colors={f.colors} size={18} radius={5} />
						<span class="fname">{f.name}</span>
						<span class="meta">{f.material}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-soft);
	}
	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 9px;
		background: var(--surface-raised);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #b8b8b8;
		flex: none;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 32px;
		padding: 4px 20px 24px;
	}
	.fils {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fil-row {
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
	.fil-row:hover {
		border-color: #4a4a4a;
	}
	.fname {
		font-weight: 600;
		flex: 1;
	}
	.meta {
		color: var(--text-dim);
	}
	@media (max-width: 620px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
