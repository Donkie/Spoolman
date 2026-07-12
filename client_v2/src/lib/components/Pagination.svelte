<script lang="ts">
	interface Props {
		page: number;
		pageSize: number;
		total: number;
		unit?: string;
		onpage: (page: number) => void;
		onpagesize: (size: number) => void;
	}

	let { page, pageSize, total, unit = 'items', onpage, onpagesize }: Props = $props();

	let pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
	let from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	let to = $derived(Math.min(total, page * pageSize));

	// Windowed page numbers with 1 … n … last.
	let pages = $derived.by(() => {
		const out: (number | '…')[] = [];
		const add = (n: number) => out.push(n);
		const window = 1;
		const lo = Math.max(2, page - window);
		const hi = Math.min(pageCount - 1, page + window);
		add(1);
		if (lo > 2) out.push('…');
		for (let i = lo; i <= hi; i++) add(i);
		if (hi < pageCount - 1) out.push('…');
		if (pageCount > 1) add(pageCount);
		return out;
	});

	const sizes = [10, 20, 50, 100];

	function go(p: number) {
		if (p >= 1 && p <= pageCount && p !== page) onpage(p);
	}
</script>

<div class="pager">
	<span class="count">
		{#if total === 0}No {unit}{:else}{from}–{to} of {total} {unit}{/if}
	</span>

	<div class="spacer"></div>

	{#if pageCount > 1}
		<div class="nums">
			<button class="pg nav" disabled={page <= 1} onclick={() => go(page - 1)} aria-label="Previous page">‹</button>
			{#each pages as p, i (i)}
				{#if p === '…'}
					<span class="ellipsis">…</span>
				{:else}
					<button class="pg" class:active={p === page} onclick={() => go(p)}>{p}</button>
				{/if}
			{/each}
			<button class="pg nav" disabled={page >= pageCount} onclick={() => go(page + 1)} aria-label="Next page">›</button>
		</div>
	{/if}

	<select class="size" value={pageSize} onchange={(e) => onpagesize(Number(e.currentTarget.value))} aria-label="Page size">
		{#each sizes as s (s)}
			<option value={s}>{s} / page</option>
		{/each}
	</select>
</div>

<style>
	.pager {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
		padding: 8px 14px;
		border-top: 1px solid var(--border-soft);
		background: var(--surface);
		font-size: 11.5px;
		color: var(--text-dim);
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.count {
		white-space: nowrap;
	}
	.nums {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.pg {
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-2);
		font-size: 11.5px;
		cursor: pointer;
		font-family: inherit;
	}
	.pg:hover:not(:disabled) {
		background: var(--surface-2);
	}
	.pg.active {
		background: var(--accent-wash);
		border-color: var(--accent-border);
		color: var(--accent-soft);
		font-weight: 600;
	}
	.pg:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ellipsis {
		padding: 0 2px;
		color: var(--text-faint);
	}
	.size {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		color: var(--text-2);
		padding: 4px 6px;
		font-size: 11.5px;
	}
</style>
