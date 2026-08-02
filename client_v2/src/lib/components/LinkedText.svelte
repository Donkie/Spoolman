<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   The hrefs below are external absolute URLs out of the user's own field values;
	   there is no deploy base path to resolve them against. */
	import { splitLinks } from '$lib/utils/links';

	// Read-only text value with any URLs in it rendered as real links (#992).
	// Use this wherever a free-text field is *shown* rather than edited; the
	// editable inputs get the same links as an affordance beside them instead.
	let { text, placeholder = '—' }: { text: string; placeholder?: string } = $props();

	let segments = $derived(splitLinks(text ?? ''));
</script>

<!-- prettier-ignore -->
{#if !segments.length}<span class="empty">{placeholder}</span>{:else}{#each segments as seg, i (i)}{#if seg.href}<a class="link" href={seg.href} target="_blank" rel="nofollow noopener">{seg.text}</a>{:else}{seg.text}{/if}{/each}{/if}

<style>
	.empty {
		color: var(--text-dim);
	}
	.link {
		color: var(--accent-link);
		text-decoration: none;
		/* Long order URLs must not push the field grid wider than its column. */
		overflow-wrap: anywhere;
	}
	.link:hover {
		text-decoration: underline;
	}
</style>
