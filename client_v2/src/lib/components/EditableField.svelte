<script lang="ts">
	interface Props {
		value: string | number;
		placeholder?: string;
		mono?: boolean;
		/** Read-only presentation, for users without permission to edit. */
		disabled?: boolean;
		oninput?: (value: string) => void;
	}

	let { value, placeholder = '—', mono = false, disabled = false, oninput }: Props = $props();
</script>

<input
	class="edit"
	class:mono
	{value}
	{placeholder}
	{disabled}
	readonly={disabled}
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

	/* Read-only: drop the dashed affordance so the field does not invite an edit
	   that the server would refuse. */
	.edit:disabled {
		border-bottom-color: transparent;
		color: var(--text-2);
		cursor: default;
	}
</style>
