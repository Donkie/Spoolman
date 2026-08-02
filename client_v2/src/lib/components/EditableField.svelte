<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   The href below is an external absolute URL out of the user's own field value;
	   there is no deploy base path to resolve it against. */
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { getFieldLabelId } from './fieldLabel';
	import { extractUrls } from '$lib/utils/links';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		value: string | number;
		placeholder?: string;
		mono?: boolean;
		oninput?: (value: string) => void;
		/** Accessible name, for use outside a <Field> that supplies one. */
		ariaLabel?: string;
		/**
		 * Offer any URLs in the value as links beside the input (#992). The value
		 * stays editable text — an inline anchor can't also be a caret target — so
		 * the links sit next to the field rather than replacing it.
		 */
		linkify?: boolean;
	}

	let { value, placeholder = '—', mono = false, oninput, ariaLabel, linkify = false }: Props = $props();

	// Named by the enclosing <Field>'s label cell when there is one; see fieldLabel.ts.
	const labelId = getFieldLabelId();

	let urls = $derived(linkify ? extractUrls(String(value ?? '')) : []);
</script>

<span class="row">
	<input
		class="edit"
		class:mono
		{value}
		{placeholder}
		aria-label={ariaLabel}
		aria-labelledby={ariaLabel ? undefined : labelId}
		oninput={(e) => oninput?.(e.currentTarget.value)}
	/>
	{#each urls as url (url)}
		<a
			class="open"
			href={url}
			target="_blank"
			rel="nofollow noopener"
			title={url}
			aria-label={m['inspector.openLink']({ url })}><ExternalLink size={13} /></a
		>
	{/each}
</span>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}
	.edit {
		background: none;
		border: none;
		border-bottom: 1px dashed var(--track);
		color: var(--text);
		font-size: 12.5px;
		padding: 2px 0;
		width: 100%;
		flex: 1;
		min-width: 0;
	}
	.edit:focus {
		border-bottom-color: var(--accent);
	}
	.open {
		position: relative;
		display: inline-flex;
		align-items: center;
		flex: none;
		color: var(--accent-link);
	}
	.open::before {
		/* Roomy tap target on touch, laid over the icon so it doesn't grow the row
		   — the same trick the ⓘ help toggle in Field.svelte uses. Kept narrower
		   than it is tall so that when a value holds several URLs, neighbouring
		   targets never reach across another icon's glyph. */
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 24px;
		height: 32px;
		transform: translate(-50%, -50%);
	}
	.open:hover {
		color: var(--accent);
	}
</style>
