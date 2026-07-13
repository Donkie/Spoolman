<!--
  Trans renders an i18n message that contains inline markup tags — the Svelte
  analog of react-i18next's <Trans>.

  It resolves the message with svelte-i18n (so ICU {placeholders} are still
  interpolated from `values`), parses the resulting string with parseRichText,
  then renders the node tree. Text nodes render as escaped text; tag nodes are
  matched against the `tags` snippet map, falling back to built-in p/br/title.

  SECURITY: `key`/`values` are app-controlled, but the resolved *string* comes
  from a locale file that is community-maintained via Weblate and must be
  treated as untrusted. Rendering never uses {@html}: every text node is
  escaped by Svelte, and only allowlisted tag names map to real markup. A tag
  the app didn't provide (and isn't a built-in) renders its children only, with
  the wrapper dropped — so injected tags/attributes cannot become live DOM.

  Usage:
    <Trans key="home.description" tags={{ helpPageLink }} />
    {#snippet helpPageLink(children)}
      <a href="/help">{@render children()}</a>
    {/snippet}
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { parseRichText, type TransNode } from './richText';

	interface Props {
		/** i18n message key. */
		key: string;
		/** ICU placeholder values for the message. */
		values?: Record<string, string | number | boolean | Date | null | undefined>;
		/**
		 * Map of tag name -> snippet. Each snippet receives a `children` snippet
		 * that renders the tag's inner content. Provide the link/list/etc. tags
		 * the message uses; p/br/title have built-in defaults.
		 */
		tags?: Record<string, Snippet<[Snippet]>>;
	}

	let { key, values, tags }: Props = $props();

	let nodes = $derived(parseRichText($_(key, { values })));
</script>

{#snippet render(list: TransNode[])}
	{#each list as node, i (i)}
		{#if node.type === 'text'}{node.value}{:else}{@render tagNode(node)}{/if}
	{/each}
{/snippet}

{#snippet tagNode(node: TransNode & { type: 'tag' })}
	{#snippet children()}{@render render(node.children)}{/snippet}
	{#if tags?.[node.name]}
		{@render tags[node.name](children)}
	{:else if node.name === 'p'}
		<p>{@render children()}</p>
	{:else if node.name === 'br'}
		<br />
	{:else if node.name === 'title'}
		<div class="trans-title">{@render children()}</div>
	{:else}
		{@render children()}
	{/if}
{/snippet}

{@render render(nodes)}

<style>
	.trans-title {
		font-weight: 600;
		font-size: 1.25em;
		margin-bottom: 0.5em;
	}
</style>
