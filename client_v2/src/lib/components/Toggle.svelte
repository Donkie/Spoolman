<script lang="ts">
	interface Props {
		checked: boolean;
		onchange?: (checked: boolean) => void;
		ariaLabel: string | undefined;
		/** Refuse interaction, for a toggle the server would reject anyway. */
		disabled?: boolean;
	}

	let { checked, onchange, ariaLabel, disabled = false }: Props = $props();
</script>

<button
	class="toggle"
	class:on={checked}
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={ariaLabel}
	{disabled}
	onclick={() => onchange?.(!checked)}
>
	<span class="knob"></span>
</button>

<style>
	.toggle {
		width: 34px;
		height: 19px;
		border-radius: 10px;
		background: var(--track);
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
	.toggle:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.knob {
		position: absolute;
		top: 2.5px;
		left: 2.5px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
		transition: left 0.15s;
	}
	.toggle.on .knob {
		left: 17.5px;
	}
</style>
