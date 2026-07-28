<script lang="ts">
	// A checkbox with a 44px tap target and an 18px box.
	//
	// A native `<input type="checkbox">` sized to 18px is what the app used, and it is
	// what the mobile audit flags: the *input* is the tap target, so wrapping it in a
	// 44px label makes the row comfortable while leaving the control itself at 18px.
	// `appearance: none` lets the input be 44px and the visible box be drawn at 18px by
	// a pseudo-element, which satisfies both at once.
	//
	// Still a real `<input type="checkbox">` underneath, so it keeps native keyboard
	// behaviour, form participation and the checkbox role for free.

	let {
		checked = $bindable(false),
		id,
		disabled = false,
		label
	}: {
		checked?: boolean;
		id?: string;
		disabled?: boolean;
		label: string;
	} = $props();
</script>

<label class="check" class:disabled>
	<input type="checkbox" {id} bind:checked {disabled} />
	<span>{label}</span>
</label>

<style>
	.check {
		display: flex;
		align-items: center;
		gap: 2px;
		cursor: pointer;
		color: var(--text);
		font-size: 0.85rem;
	}

	.check.disabled {
		cursor: default;
		opacity: 0.55;
	}

	input {
		appearance: none;
		display: grid;
		place-content: center;
		width: 44px;
		height: 44px;
		flex: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: inherit;
	}

	input::before {
		content: '';
		width: 18px;
		height: 18px;
		border: 1px solid var(--border-input);
		border-radius: 4px;
		background: var(--input-bg);
		transition:
			background 0.12s ease,
			border-color 0.12s ease;
	}

	input:checked::before {
		border-color: var(--accent);
		background-color: var(--accent);
		/* A tick, inlined so the component stays self-contained and needs no asset. */
		background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5l3.5 3.5L13 4.5'/></svg>");
		background-repeat: no-repeat;
		background-position: center;
		background-size: 14px 14px;
	}

	input:focus-visible::before {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
