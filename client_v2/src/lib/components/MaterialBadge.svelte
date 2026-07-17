<script lang="ts">
	let { label }: { label: string } = $props();
</script>

<span class="badge mono">{label}</span>

<style>
	.badge {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text-2);
		white-space: nowrap;
	}
</style>
