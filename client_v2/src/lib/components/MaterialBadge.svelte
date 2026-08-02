<script lang="ts">
	interface Props {
		label: string;
		/** `solid` is the default chip. `outline` is for places where a filled chip
		 *  would read as the same kind of thing as a neighbouring filled chip that
		 *  says something else entirely — see the search panel's "matched" tag. */
		variant?: 'solid' | 'outline';
	}

	let { label, variant = 'solid' }: Props = $props();
</script>

<span class="badge mono" class:outline={variant === 'outline'}>{label}</span>

<style>
	.badge {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text-2);
		white-space: nowrap;
	}
	.badge.outline {
		background: none;
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 0 5px;
		letter-spacing: 0.02em;
	}
</style>
