<script lang="ts">
	import FilamentList from '$components/library/FilamentList.svelte';
	import Inspector from '$components/library/Inspector.svelte';
	import DetailPane from '$components/DetailPane.svelte';
	import { clearSelection } from '$lib/library/params';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	// The URL is the source of truth: `data.state` is parsed from the query
	// string by +page.ts and re-derived on every navigation, so this page simply
	// renders it. State changes happen through the params.* nav helpers in the
	// child components — no local sync to maintain.
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{m['documentTitle.library.list']()}</title>
</svelte:head>

<div class="library">
	<!-- Left list: front and centre; on mobile it fills the screen. -->
	<div class="list-pane">
		<FilamentList libraryState={data.state} />
	</div>

	<!-- The inspector: a side pane on desktop, a bottom-sheet drawer on mobile.
	     Rendered once — DetailPane adapts via CSS. On mobile the drawer is open
	     exactly when something is selected; closing it clears the selection. -->
	<DetailPane open={data.state.selection !== null} onclose={() => clearSelection()}>
		<Inspector selection={data.state.selection} />
	</DetailPane>
</div>

<style>
	.library {
		display: flex;
		flex: 1;
		min-height: 0;
		width: 100%;
	}
	.list-pane {
		width: var(--list-w);
		flex: none;
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	@media (max-width: 860px) {
		.list-pane {
			width: 100%;
			border-right: none;
		}
	}
</style>
