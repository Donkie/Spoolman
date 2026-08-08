<script lang="ts">
	import FilamentList from '$components/library/FilamentList.svelte';
	import Inspector from '$components/library/Inspector.svelte';
	import DetailPane from '$components/DetailPane.svelte';
	import Splitter from '$components/Splitter.svelte';
	import { clearSelection } from '$lib/library/params';
	import {
		listWidth,
		clampListWidth,
		LIST_MIN,
		LIST_DEFAULT,
		DETAIL_MIN
	} from '$lib/stores/listWidth.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	// The URL is the source of truth: `data.state` is parsed from the query
	// string by +page.ts and re-derived on every navigation, so this page simply
	// renders it. State changes happen through the params.* nav helpers in the
	// child components — no local sync to maintain.
	let { data }: { data: PageData } = $props();

	// How the list is sized (#1034). The stored preference is held to what the
	// window can currently fit, so a width chosen on a wide monitor never pushes
	// the inspector off a narrow one — and is remembered at full size for when the
	// user is back on the wide one.
	//
	// `available` is 0 until the container is measured; clampListWidth reads that
	// as "no ceiling yet" and renders the stored width, so the list doesn't paint
	// narrow and then jump on the first frame.
	let available = $state(0);
	let width = $derived(clampListWidth(listWidth.px, available));
	let maxWidth = $derived(available > 0 ? Math.max(LIST_MIN, available - DETAIL_MIN) : width);
</script>

<svelte:head>
	<title>{m['documentTitle.library.list']()}</title>
</svelte:head>

<div class="library" style="--list-w: {width}px" bind:clientWidth={available}>
	<!-- Left list: front and centre; on mobile it fills the screen. -->
	<div class="list-pane">
		<FilamentList libraryState={data.state} />
	</div>

	<!-- The divider between the two panes is also the handle that moves it. -->
	<Splitter
		value={width}
		min={LIST_MIN}
		max={maxWidth}
		resetValue={LIST_DEFAULT}
		label={m['library.resizeList']()}
		onchange={(px, done) => (done ? listWidth.commit(px) : listWidth.set(px))}
	/>

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
	/* Width comes from the inline --list-w above (the splitter's doing); the value
	   in app.css is the fallback for the frame before this page's script runs. */
	.list-pane {
		width: var(--list-w);
		flex: none;
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* The pane's width is now the user's to choose, so what's inside it has to
		   adapt to the PANE rather than to the window — the list toolbar sheds its
		   "Group:"/"Sort:" prefixes off this. Safe to contain: the width above never
		   depends on the content. */
		container-type: inline-size;
	}

	@media (max-width: 860px) {
		.list-pane {
			width: 100%;
		}
	}
</style>
