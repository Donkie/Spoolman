<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { fields } from '$lib/stores/fields.svelte';
	import ExtraFieldInput from './ExtraFieldInput.svelte';
	import SectionLabel from './SectionLabel.svelte';
	import FieldGrid from './FieldGrid.svelte';
	import Field from './Field.svelte';
	import { extraFieldsHref } from '$lib/settings/params';
	import type { EntityType } from '$lib/api/fields';
	import type { Extra } from '$lib/types';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	interface Props {
		entity: EntityType;
		extra: Extra;
		onchange: (key: string, json: string | undefined) => void;
		readonly?: boolean;
		/**
		 * Show the section even when this entity has no extra fields, with a link to
		 * Settings for defining some. On for the detail views, which are where the
		 * feature is worth discovering; off in forms and in read-only mirrors of
		 * another entity, where an empty section is just noise.
		 */
		manage?: boolean;
		/**
		 * Emit only the field rows — no section header, no grid of its own — so the
		 * caller can drop them straight into its own <FieldGrid>. Used by the
		 * read-only mirrors of another entity, where a second "Extra fields" heading
		 * in the same panel reads as a peer section rather than as more of the
		 * entity above it (#992).
		 */
		headless?: boolean;
	}
	let { entity, extra, onchange, readonly = false, manage = false, headless = false }: Props = $props();

	$effect(() => {
		fields.ensure(entity);
	});
	let defs = $derived(fields.get(entity));
	// An empty list is only worth announcing once we know it IS the answer, rather
	// than the definitions not having arrived yet.
	let show = $derived(defs.length > 0 || (manage && fields.isLoaded(entity)));
</script>

{#snippet manageLink()}
	<!-- extraFieldsHref() already resolves against the deploy base path; resolving
	     it again here would double-apply the base. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="manage" href={extraFieldsHref(entity)}
		>{m['inspector.manageExtraFields']()} <ArrowRight size={13} /></a
	>
{/snippet}

{#snippet rows()}
	{#each defs as f (f.key)}
		<Field label={f.name}>
			<ExtraFieldInput field={f} value={extra[f.key]} onchange={(json) => onchange(f.key, json)} {readonly} />
		</Field>
	{/each}
{/snippet}

{#if headless}
	{@render rows()}
{:else if show}
	<SectionLabel right={manage ? manageLink : undefined}>{m['settings.extraFields.tab']()}</SectionLabel>
	{#if defs.length}
		<FieldGrid>
			{@render rows()}
		</FieldGrid>
	{:else}
		<div class="none">{m['inspector.noExtraFields']()}</div>
	{/if}
{/if}

<style>
	.manage {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--accent-link);
		text-decoration: none;
	}
	.manage:hover {
		text-decoration: underline;
	}
	.none {
		font-size: 12px;
		color: var(--text-dim);
	}
</style>
