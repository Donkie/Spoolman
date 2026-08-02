<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { setFieldLabelId } from './fieldLabel';

	// One label/value row inside a <FieldGrid>. Svelte components render without a
	// wrapper element, so the label and value below become direct grid cells.
	// `mono` renders the value in the monospace font. `help` adds an ⓘ toggle next
	// to the label that reveals the explanation under the value, matching the help
	// toggles in the add-spool form.
	//
	// The label cell and the value cell are siblings, so a control in the value cell
	// gets no implicit label from being nested. Publishing the label's id lets those
	// controls name themselves — see fieldLabel.ts.
	let {
		label,
		mono = false,
		help,
		children
	}: { label: string; mono?: boolean; help?: string; children: Snippet } = $props();

	let helpOpen = $state(false);
	// One $props.id() per component is all Svelte allows, so suffix it for the two
	// elements that need to be referenced.
	const uid = $props.id();
	const helpId = `${uid}-help`;
	const labelId = `${uid}-label`;
	setFieldLabelId(labelId);
</script>

<!-- The id sits on an inner span holding only the label text: the ⓘ toggle is a
     sibling, so referencing it would fold "Help" into every control's name. -->
<span class="k" class:top={helpOpen}
	><span id={labelId}>{label}</span>{#if help}<button
			type="button"
			class="help-toggle"
			aria-label={m['help.help']()}
			aria-controls={helpId}
			aria-expanded={helpOpen}
			onclick={() => (helpOpen = !helpOpen)}>ⓘ</button
		>{/if}</span
>
<div class="v" class:mono class:top={helpOpen}>
	{@render children()}
	{#if help && helpOpen}
		<span class="help-popup" id={helpId} role="note">{help}</span>
	{/if}
</div>

<style>
	.k {
		color: var(--text-muted);
	}
	.v {
		min-width: 0;
	}
	/* The grid centers rows vertically. Opening the help popup makes this row
	   taller, which would slide the label (and the ⓘ button being clicked) down;
	   pinning both cells to the top keeps them where they already were. */
	.top {
		align-self: start;
	}
	.help-toggle {
		position: relative;
		margin-left: 4px;
		border: none;
		background: none;
		padding: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
		vertical-align: middle;
	}
	.help-toggle::before {
		/* Roomy tap target on touch, laid out over the glyph so it doesn't
		   affect the inline height of the label. */
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 32px;
		height: 32px;
		transform: translate(-50%, -50%);
	}
	.help-toggle:hover,
	.help-toggle[aria-expanded='true'] {
		color: var(--accent-soft);
	}
	.help-popup {
		display: block;
		margin-top: 6px;
		padding: 8px 10px;
		border-radius: 7px;
		background: var(--surface-2, rgba(127, 127, 127, 0.12));
		border: 1px solid var(--border-strong);
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--text-muted);
		max-width: 100%;
		/* Never inherits the value cell's monospace font. */
		font-family: var(--font-sans, inherit);
	}
</style>
