<script lang="ts">
	interface Props {
		label?: string;
		size?: number;
	}

	let { label = 'Spoolman', size = 18 }: Props = $props();
</script>

<div class="logo" style="font-size:{size < 20 ? 15 : 18}px">
	<span class="ring" style="width:{size}px;height:{size}px"></span>
	{#if label}<span>{label}</span>{/if}
</div>

<style>
	.logo {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 700;
	}
	.ring {
		border-radius: 50%;
		border: 4px solid var(--accent);
		flex: none;
	}
</style>
