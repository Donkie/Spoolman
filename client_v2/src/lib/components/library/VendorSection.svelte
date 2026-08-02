<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   `href` comes from a src/lib/library/params.ts helper, which already resolves
	   against the deploy base path; resolving again would double-apply it. */
	import SectionLabel from '../SectionLabel.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import LinkedText from '../LinkedText.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { Vendor } from '$lib/types';
	import * as m from '$lib/paraglide/messages';

	// Read-only mirror of a manufacturer's fields, shown inside the filament and
	// spool detail views. Before #992 those views named the manufacturer and
	// stopped there, so its empty-spool weight, comment and extra fields were only
	// reachable by navigating away to the manufacturer itself.
	interface Props {
		/** Undefined when the filament has no manufacturer, or it isn't cached yet. */
		vendor: Vendor | undefined;
		/** Link to the manufacturer's own detail view. */
		href?: string;
	}
	let { vendor, href }: Props = $props();
</script>

{#snippet open()}
	<a class="link" {href} data-sveltekit-keepfocus data-sveltekit-noscroll
		>{m['inspector.openManufacturer']()} <ArrowRight size={13} /></a
	>
{/snippet}

<SectionLabel right={vendor && href ? open : undefined}>
	{m['library.section.vendor']()}
</SectionLabel>

{#if vendor}
	<!-- 140px, as in the manufacturer's own view: "Empty Spool Weight" plus its ⓘ
	     wraps to two lines in the default 120px label column. -->
	<FieldGrid labelWidth="140px">
		<Field label={m['vendor.fields.name']()}>{vendor.name}</Field>
		<Field label={m['vendor.fields.emptySpoolWeight']()} help={m['vendor.fieldsHelp.emptySpoolWeight']()} mono
			>{vendor.emptyWeight} g</Field
		>
		{#if vendor.externalId}
			<Field label={m['vendor.fields.externalId']()} mono>{vendor.externalId}</Field>
		{/if}
		<Field label={m['vendor.fields.registered']()}>{vendor.registeredLabel}</Field>
		<Field label={m['vendor.fields.comment']()}><LinkedText text={vendor.comment} /></Field>
		<!-- Rows of this same grid rather than their own headed section — see the
		     `headless` prop's note in ExtraFieldsSection. -->
		<ExtraFieldsSection entity="vendor" extra={vendor.extra} onchange={() => {}} readonly headless />
	</FieldGrid>
{:else}
	<div class="none">{m['add.noManufacturer']()}</div>
{/if}

<style>
	.link {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11.5px;
		color: var(--accent-link);
		text-decoration: none;
	}
	.none {
		font-size: 12px;
		color: var(--text-dim);
	}
</style>
