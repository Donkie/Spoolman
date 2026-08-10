<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		value: string;
		oninput: (value: string) => void;
		/**
		 * Escape with text in the box, which the caller should treat as "clear";
		 * with the box already empty the key falls through to `onclose` instead.
		 */
		onclear?: () => void;
		onclose?: () => void;
		/** Enter: take the first thing still on the list. */
		onenter?: () => void;
	}

	let { value, oninput, onclear, onclose, onenter }: Props = $props();

	let el = $state<HTMLInputElement>();

	// Focus as the menu opens, so a menu that was opened to be searched can be
	// searched without a second click. Only where there is a real pointer: on a
	// touch device the same focus raises the on-screen keyboard over the very
	// list it filters, and a thumb is already on the list.
	$effect(() => {
		if (el && window.matchMedia('(pointer: fine)').matches) el.focus();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// Kept local either way, so that dismissing a query or a menu never also
			// closes whatever the menu was opened on top of.
			e.stopPropagation();
			if (value) onclear?.();
			else onclose?.();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			onenter?.();
		}
	}
</script>

<div class="menu-search">
	<span class="icon" aria-hidden="true"><Search size={13} /></span>
	<input
		bind:this={el}
		{value}
		type="text"
		autocomplete="off"
		placeholder={m['common.search']()}
		aria-label={m['common.search']()}
		oninput={(e) => oninput(e.currentTarget.value)}
		{onkeydown}
	/>
</div>

<style>
	/* Sticky so it survives scrolling a list long enough to have needed it. The
	   background is the menu's own, since rows pass underneath. */
	.menu-search {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 7px;
		/* No vertical padding of its own: the input carries it instead, so the
		   field's own box covers the full height of the row and a thumb landing
		   anywhere in the band lands on the input. */
		padding: 0 10px;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border-soft);
	}
	.icon {
		display: flex;
		flex: none;
		color: var(--text-dim);
	}
	input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		color: var(--text);
		font-family: inherit;
		font-size: 12.5px;
		padding: 12px 0;
	}
	input:focus {
		outline: none;
	}
	input::placeholder {
		color: var(--text-faint);
	}
</style>
