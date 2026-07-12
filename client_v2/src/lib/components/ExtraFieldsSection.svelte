<script lang="ts">
	import { fields } from '$lib/stores/fields.svelte';
	import ExtraFieldInput from './ExtraFieldInput.svelte';
	import SectionLabel from './SectionLabel.svelte';
	import FieldGrid from './FieldGrid.svelte';
	import Field from './Field.svelte';
	import type { EntityType } from '$lib/api/fields';
	import type { Extra } from '$lib/types';

	interface Props {
		entity: EntityType;
		extra: Extra;
		onchange: (key: string, json: string | undefined) => void;
	}
	let { entity, extra, onchange }: Props = $props();

	$effect(() => {
		fields.ensure(entity);
	});
	let defs = $derived(fields.get(entity));
</script>

{#if defs.length}
	<SectionLabel>Extra fields</SectionLabel>
	<FieldGrid>
		{#each defs as f (f.key)}
			<Field label={f.name}>
				<ExtraFieldInput field={f} value={extra[f.key]} onchange={(json) => onchange(f.key, json)} />
			</Field>
		{/each}
	</FieldGrid>
{/if}
