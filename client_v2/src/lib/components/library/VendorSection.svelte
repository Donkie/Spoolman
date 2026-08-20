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
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import OverrideMark from './OverrideMark.svelte';
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
		/**
		 * Set when a nearer level holds an empty-spool weight of its own, in which
		 * case this one applies to nothing here. Already-phrased, because which level
		 * wins depends on where this section is shown: under a filament only the
		 * filament can shadow it, under a spool either can. See OverrideMark.
		 */
		emptyWeightShadowedBy?: string;
		/**
		 * Open the change-manufacturer dialog. Passed only under a filament, which is
		 * the entity that owns the link. A spool shows this section too, but reaches
		 * its manufacturer *through* its filament — changing it there would silently
		 * re-file every other spool of that filament as well, so the action is left
		 * out and the spool's own "change filament" is the way to move it.
		 */
		onchange?: () => void;
	}
	let { vendor, href, emptyWeightShadowedBy, onchange }: Props = $props();

	// The section is headed even when there is nothing to open (no manufacturer yet),
	// because that is exactly when "Change" is the point of the header.
	let hasActions = $derived(!!onchange || !!(vendor && href));
</script>

{#snippet actions()}
	<span class="sec-actions">
		{#if onchange}
			<button class="link" onclick={onchange}
				><ArrowLeftRight size={13} /> {m['changeVendor.action']()}</button
			>
		{/if}
		{#if vendor && href}
			<a class="link" {href} data-sveltekit-keepfocus data-sveltekit-noscroll
				>{m['inspector.openManufacturer']()} <ArrowRight size={13} /></a
			>
		{/if}
	</span>
{/snippet}

<SectionLabel right={hasActions ? actions : undefined}>
	{m['library.section.vendor']()}
</SectionLabel>

{#if vendor}
	<!-- 140px, as in the manufacturer's own view: "Empty Spool Weight" plus its ⓘ
	     wraps to two lines in the default 120px label column. -->
	<FieldGrid labelWidth="140px">
		<Field label={m['vendor.fields.name']()}>{vendor.name}</Field>
		<Field
			label={m['vendor.fields.emptySpoolWeight']()}
			help={m['vendor.fieldsHelp.emptySpoolWeight']()}
			mono
		>
			<span class:shadowed={emptyWeightShadowedBy}>{vendor.emptyWeight} g</span>
			{#if emptyWeightShadowedBy}<OverrideMark label={emptyWeightShadowedBy} />{/if}
		</Field>
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
		/* The "change" affordance is a button, the "open" one a link; reset the
		   button's own furniture so the pair reads as one row of section actions. */
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
	}
	.sec-actions {
		display: inline-flex;
		align-items: center;
		gap: 14px;
	}
	.none {
		font-size: 12px;
		color: var(--text-dim);
	}
	/* A value another level has replaced: struck through rather than hidden, so the
	   inherited chain stays readable while making clear it is not what applies. */
	.shadowed {
		color: var(--text-dim);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
		opacity: 0.7;
	}
</style>
