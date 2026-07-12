<script lang="ts">
	interface Props {
		value: string | number;
		placeholder?: string;
		mono?: boolean;
		oninput?: (value: string) => void;
	}

	let { value, placeholder = '—', mono = false, oninput }: Props = $props();
</script>

<input
	class="edit"
	class:mono
	{value}
	{placeholder}
	oninput={(e) => oninput?.(e.currentTarget.value)}
/>

<style>
	.edit {
		background: none;
		border: none;
		border-bottom: 1px dashed #3a3a3a;
		color: var(--text);
		font-size: 12.5px;
		padding: 2px 0;
		width: 100%;
	}
	.edit:focus {
		border-bottom-color: var(--accent);
	}
</style>
