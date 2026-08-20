<script lang="ts">
	import type { TigerTagData, QidiTagData } from '$lib/api/nfc';
	import Field from './Field.svelte';
	import FieldGrid from './FieldGrid.svelte';
	import Swatch from './Swatch.svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		tagData?: TigerTagData;
		qidiData?: QidiTagData;
	}
	let { tagData, qidiData }: Props = $props();

	let diameter = $derived(
		tagData
			? tagData.diameter_mm > 0
				? `${tagData.diameter_mm} mm`
				: tagData.id_diameter === 1
					? '1.75 mm'
					: tagData.id_diameter === 2
						? '2.85 mm'
						: '—'
			: '—'
	);
</script>

<FieldGrid labelWidth="110px">
	{#if qidiData}
		<Field label={m['nfc.tagFormat']()}>Qidi</Field>
		<Field label={m['nfc.tagMaterial']()}>{qidiData.material_name}</Field>
		<Field label={m['nfc.tagColor']()}>
			{#if qidiData.color_hex}
				<span class="color-row">
					<Swatch colors={[qidiData.color_hex]} size={14} radius={3} />
					{qidiData.color_name}
				</span>
			{:else}
				—
			{/if}
		</Field>
		<Field label={m['nfc.tagMaterialType']()}>{qidiData.material_type}</Field>
	{:else if tagData}
		<Field label={m['nfc.tagColor']()}>
			{#if tagData.color_hex}
				<span class="color-row">
					<Swatch colors={[`#${tagData.color_hex}`]} size={14} radius={3} />
					<span class="mono">#{tagData.color_hex}</span>
				</span>
			{:else}
				—
			{/if}
		</Field>
		<Field label={m['nfc.tagDiameter']()} mono>{diameter}</Field>
		<Field label={m['nfc.tagWeight']()} mono>{tagData.weight > 0 ? `${tagData.weight} g` : '—'}</Field>
		<Field label={m['nfc.tagNozzleTemp']()} mono>
			{tagData.nozzle_temp > 0 ? `${tagData.nozzle_temp} °C` : '—'}
		</Field>
		<Field label={m['nfc.tagBedTemp']()} mono>{tagData.bed_temp > 0 ? `${tagData.bed_temp} °C` : '—'}</Field>
	{/if}
</FieldGrid>

<style>
	.color-row {
		display: flex;
		align-items: center;
		gap: 7px;
	}
</style>
