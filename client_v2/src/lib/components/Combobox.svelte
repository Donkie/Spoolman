<script lang="ts">
	interface Props {
		value: string | number;
		options: string[];
		placeholder?: string;
		mono?: boolean;
		invalid?: boolean;
		disabled?: boolean;
		/** Dashed-underline style (matches EditableField) instead of the bordered
		 *  box style used in forms. */
		underline?: boolean;
		/** Fired on every change — typing or picking an option. */
		oninput?: (value: string) => void;
	}

	let {
		value,
		options,
		placeholder = '',
		mono = false,
		invalid = false,
		disabled = false,
		underline = false,
		oninput
	}: Props = $props();

	const listId = $props.id();
	let open = $state(false);
	let highlight = $state(-1);
	let inputEl = $state<HTMLInputElement>();
	let listEl = $state<HTMLUListElement>();
	// Dropdown is position:fixed and anchored to the input's rect so it never gets
	// clipped by scrollable/overflow-hidden ancestors (e.g. the modal body).
	let rect = $state({ top: 0, left: 0, width: 0 });

	// True while the user is actively typing, false when the list was just opened
	// with a pre-filled value. On open we show the full list (so all options are
	// visible immediately); once typing starts we always filter by substring —
	// even when the query exactly matches an option (typing "PLA" still narrows
	// to "PLA"/"PLA+" rather than snapping back to the full list).
	let typing = $state(false);
	let filtered = $derived.by(() => {
		const q = String(value).trim().toLowerCase();
		if (!typing || !q) return options;
		return options.filter((o) => o.toLowerCase().includes(q));
	});

	function reposition() {
		if (!inputEl) return;
		const r = inputEl.getBoundingClientRect();
		rect = { top: r.bottom, left: r.left, width: r.width };
	}

	function openList() {
		if (disabled || options.length === 0 || open) return;
		reposition();
		open = true;
		typing = false;
		highlight = -1;
	}
	function close() {
		open = false;
		highlight = -1;
	}
	function choose(opt: string) {
		oninput?.(opt);
		close();
		inputEl?.focus();
	}
	function onInput(e: Event & { currentTarget: HTMLInputElement }) {
		oninput?.(e.currentTarget.value);
		if (!open) openList();
		typing = true;
		highlight = -1;
	}
	function onKeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				openList();
				e.preventDefault();
			}
			return;
		}
		if (e.key === 'ArrowDown') {
			highlight = Math.min(highlight + 1, filtered.length - 1);
			e.preventDefault();
		} else if (e.key === 'ArrowUp') {
			highlight = Math.max(highlight - 1, 0);
			e.preventDefault();
		} else if (e.key === 'Enter') {
			// Commit: take the highlighted option, or an exact match of what's
			// typed; otherwise just accept the typed free-text value. Either way
			// close the list and swallow the Enter so it doesn't submit a
			// surrounding form while the dropdown is open.
			if (highlight >= 0 && highlight < filtered.length) {
				choose(filtered[highlight]);
			} else {
				const q = String(value).trim().toLowerCase();
				const exact = filtered.find((o) => o.toLowerCase() === q);
				if (exact) choose(exact);
				else close();
			}
			e.preventDefault();
		} else if (e.key === 'Escape') {
			close();
		}
	}

	// While open: outside pointer closes it, scroll/resize keeps it anchored.
	$effect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			const t = e.target as Node;
			if (inputEl?.contains(t) || listEl?.contains(t)) return;
			close();
		};
		window.addEventListener('pointerdown', onPointer, true);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return () => {
			window.removeEventListener('pointerdown', onPointer, true);
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	});
</script>

<input
	bind:this={inputEl}
	class="cbx"
	class:mono
	class:underline
	class:invalid
	{value}
	{placeholder}
	{disabled}
	role="combobox"
	aria-expanded={open}
	aria-controls={listId}
	aria-autocomplete="list"
	autocomplete="off"
	onfocus={openList}
	onclick={openList}
	oninput={onInput}
	onkeydown={onKeydown}
/>
{#if open && filtered.length > 0}
	<ul
		bind:this={listEl}
		id={listId}
		role="listbox"
		class="cbx-list"
		style="top:{rect.top}px; left:{rect.left}px; width:{rect.width}px;"
	>
		{#each filtered as opt, i (opt)}
			<li role="option" aria-selected={opt === String(value)}>
				<button
					type="button"
					class="cbx-opt"
					class:hl={i === highlight}
					class:sel={opt === String(value)}
					onpointerdown={(e) => {
						e.preventDefault();
						choose(opt);
					}}
					onmouseenter={() => (highlight = i)}
				>
					{opt}
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.cbx {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: none;
		border-radius: 7px;
		padding: 9px 12px;
		color: var(--text);
		font-size: 13px;
		/* Matches .form input spacing below its label text. */
		margin-top: 5px;
	}
	.cbx:focus {
		outline: none;
		border-color: var(--accent);
	}
	.cbx.invalid {
		border-color: var(--danger);
	}
	/* Inline dashed-underline variant, matching EditableField. */
	.cbx.underline {
		border: none;
		border-bottom: 1px dashed var(--track);
		border-radius: 0;
		padding: 2px 0;
		font-size: 12.5px;
		margin-top: 0;
	}
	.cbx.underline:focus {
		border-bottom-color: var(--accent);
	}

	.cbx-list {
		position: fixed;
		z-index: 3000;
		margin: 4px 0 0;
		padding: 4px;
		list-style: none;
		max-height: 240px;
		overflow-y: auto;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
	}
	.cbx-opt {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 7px 10px;
		border-radius: var(--radius);
		color: var(--text);
		font-size: 13px;
		cursor: pointer;
	}
	.cbx-opt.hl {
		background: var(--accent-wash);
	}
	.cbx-opt.sel {
		color: var(--accent);
	}
</style>
