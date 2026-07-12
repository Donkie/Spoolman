<script lang="ts">
	interface Props {
		checked: boolean;
		onchange?: (checked: boolean) => void;
	}

	let { checked, onchange }: Props = $props();
</script>

<button
	class="toggle"
	class:on={checked}
	role="switch"
	aria-checked={checked}
	aria-label="Toggle"
	onclick={() => onchange?.(!checked)}
>
	<span class="knob"></span>
</button>

<style>
	.toggle {
		width: 34px;
		height: 19px;
		border-radius: 10px;
		background: #3a3a3a;
		border: none;
		position: relative;
		cursor: pointer;
		flex: none;
		padding: 0;
		transition: background 0.15s;
	}
	.toggle.on {
		background: var(--accent);
	}
	.knob {
		position: absolute;
		top: 2.5px;
		left: 2.5px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #fff;
		transition: left 0.15s;
	}
	.toggle.on .knob {
		left: 17.5px;
	}
</style>
