<script lang="ts">
	import { base } from '$app/paths';

	interface Props {
		label?: string;
		size?: number;
	}

	let { label = 'Spoolman', size = 22 }: Props = $props();
</script>

<a class="logo" href="{base}/" style="font-size:{size < 20 ? 15 : 18}px" aria-label="Spoolman home">
	<img class="mark" src="{base}/spoolman.svg" alt="" width={size} height={size} />
	{#if label}<span>{label}</span>{/if}
</a>

<style>
	.logo {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 700;
		color: inherit;
		text-decoration: none;
	}
	.logo:hover span {
		color: var(--accent-soft);
	}
	.mark {
		flex: none;
		display: block;
	}
</style>
