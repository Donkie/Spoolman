<script lang="ts">
	import * as m from '$lib/paraglide/messages';
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
		readonly?: boolean;
	}
	let { entity, extra, onchange, readonly = false }: Props = $props();

	$effect(() => {
		fields.ensure(entity);
	});
	let defs = $derived(fields.get(entity));
</script>

{#if defs.length}
	<SectionLabel>{m['settings.extraFields.tab']()}</SectionLabel>
	<FieldGrid>
		{#each defs as f (f.key)}
			<Field label={f.name}>
				<ExtraFieldInput
					field={f}
					value={extra[f.key]}
					onchange={(json) => onchange(f.key, json)}
					{readonly}
				/>
			</Field>
		{/each}
	</FieldGrid>
{/if}
