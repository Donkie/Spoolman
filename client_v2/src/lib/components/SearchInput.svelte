<script lang="ts">
	interface Props {
		value: string;
		placeholder?: string;
		oninput?: (value: string) => void;
		fullWidth?: boolean;
	}

	let { value, placeholder = 'Search', oninput, fullWidth = false }: Props = $props();
</script>

<div class="search" class:full={fullWidth}>
	<span class="icon">⌕</span>
	<input
		{value}
		{placeholder}
		oninput={(e) => oninput?.(e.currentTarget.value)}
		aria-label="Search"
	/>
</div>

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		padding: 0 12px;
		width: 280px;
	}
	.search.full {
		width: 100%;
	}
	.search:focus-within {
		border-color: var(--accent);
	}
	.icon {
		color: var(--text-dim);
		font-size: 14px;
		flex: none;
	}
	input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		color: var(--text);
		font-size: 12.5px;
		padding: 8px 0;
	}
	input:focus {
		border: none;
	}
</style>
