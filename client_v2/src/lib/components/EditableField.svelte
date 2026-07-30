<script lang="ts">
	import { getFieldLabelId } from './fieldLabel';

	interface Props {
		value: string | number;
		placeholder?: string;
		mono?: boolean;
		oninput?: (value: string) => void;
		/** Accessible name, for use outside a <Field> that supplies one. */
		ariaLabel?: string;
	}

	let { value, placeholder = '—', mono = false, oninput, ariaLabel }: Props = $props();

	// Named by the enclosing <Field>'s label cell when there is one; see fieldLabel.ts.
	const labelId = getFieldLabelId();
</script>

<input
	class="edit"
	class:mono
	{value}
	{placeholder}
	aria-label={ariaLabel}
	aria-labelledby={ariaLabel ? undefined : labelId}
	oninput={(e) => oninput?.(e.currentTarget.value)}
/>

<style>
	.edit {
		background: none;
		border: none;
		border-bottom: 1px dashed var(--track);
		color: var(--text);
		font-size: 12.5px;
		padding: 2px 0;
		width: 100%;
	}
	.edit:focus {
		border-bottom-color: var(--accent);
	}
</style>
