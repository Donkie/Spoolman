<script lang="ts">
	// Which tag reader this browser listens to, and whether a scan moves it.
	//
	// Pairing is done by walking over and tapping a tag on the reader you mean:
	// the browser subscribes to every reader, takes the reader id off the first
	// scan that arrives, and resubscribes to just that one. No codes to copy, no
	// server state, and the binding is self-evidently right because the user made
	// it with their hands.
	//
	// The list of recently-seen readers underneath is the fallback for pairing with
	// a reader in another room. It comes from an in-memory registry that is empty
	// after a server restart until something scans again — so an empty list is a
	// normal state to be explained, never an error.
	import Card from '../Card.svelte';
	import SettingRow from './SettingRow.svelte';
	import Toggle from '../Toggle.svelte';
	import Button from '../Button.svelte';
	import Radio from '@lucide/svelte/icons/radio';
	import { scanRelay, listReaders, type KnownReader } from '$lib/api/scanRelay';
	import { scanner } from '$lib/stores/scanner.svelte';
	import { isAbortError } from '$lib/api/http';
	import { formatDurationShort } from '$lib/utils/datetime';
	import * as m from '$lib/paraglide/messages';

	let pairing = $state(false);
	let readers = $state<KnownReader[]>([]);
	let loadingReaders = $state(false);

	// While pairing, listen to the root pool — every reader — and pair with the
	// first one heard from. The subscription is torn down by the effect's cleanup,
	// which runs as soon as `pairing` goes false, including on the scan itself.
	$effect(() => {
		if (!pairing) return;
		return scanRelay.subscribe(null, (scan) => {
			scanner.receive(scan);
			scanner.pair(scan.readerId, scan.name);
			pairing = false;
		});
	});

	// Refreshed on mount and whenever pairing starts, which is when the list is
	// actually being read. A reader that scans while this page is open won't appear
	// until then — acceptable for a fallback affordance, and tapping the tag is the
	// path that needs no list at all.
	async function loadReaders(signal?: AbortSignal) {
		loadingReaders = true;
		try {
			readers = await listReaders(signal);
		} catch (err) {
			if (isAbortError(err, signal)) return; // navigated away mid-request
			readers = []; // registry unreachable — the empty-state copy still applies
		} finally {
			loadingReaders = false;
		}
	}

	$effect(() => {
		const ac = new AbortController();
		loadReaders(ac.signal);
		return () => ac.abort();
	});

	let pairedLabel = $derived(scanner.pairedReaderName ?? scanner.pairedReaderId);
	// A reader that has scanned since the server started is described by that
	// registry entry, which is fresher than whatever was stored at pairing time.
	let others = $derived(readers.filter((r) => r.readerId !== scanner.pairedReaderId));
</script>

<Card divided>
	<SettingRow
		title={m['settings.scanner.autoNavigate.label']()}
		desc={m['settings.scanner.autoNavigate.desc']()}
	>
		<Toggle
			checked={scanner.autoNavigate}
			onchange={(v) => scanner.setAutoNavigate(v)}
			ariaLabel={m['settings.scanner.autoNavigate.label']()}
		/>
	</SettingRow>

	<SettingRow
		title={m['settings.scanner.reader.label']()}
		desc={pairedLabel
			? m['settings.scanner.reader.pairedDesc']({ reader: pairedLabel })
			: m['settings.scanner.reader.anyDesc']()}
	>
		{#if pairing}
			<span class="waiting">{m['settings.scanner.waiting']()}</span>
			<Button variant="ghost" onclick={() => (pairing = false)}>{m['buttons.cancel']()}</Button>
		{:else}
			{#if scanner.pairedReaderId}
				<Button variant="ghost" onclick={() => scanner.unpair()}>{m['settings.scanner.unpair']()}</Button>
			{/if}
			<Button
				variant="outline"
				onclick={() => {
					pairing = true;
					loadReaders();
				}}
			>
				<Radio size={15} />
				{m['settings.scanner.pair']()}
			</Button>
		{/if}
	</SettingRow>
</Card>

<div class="known">
	<div class="known-head">{m['settings.scanner.recent']()}</div>
	{#if others.length}
		<ul class="readers">
			{#each others as reader (reader.readerId)}
				<li class="reader">
					<div class="who">
						<span class="rname">{reader.name ?? reader.readerId}</span>
						{#if reader.name}<span class="rid mono">{reader.readerId}</span>{/if}
					</div>
					<span class="seen"
						>{m['settings.scanner.lastSeen']({ when: formatDurationShort(reader.lastSeen) })}</span
					>
					<button class="link" onclick={() => scanner.pair(reader.readerId, reader.name)}>
						{m['settings.scanner.use']()}
					</button>
				</li>
			{/each}
		</ul>
	{:else if !loadingReaders}
		<p class="empty">{m['settings.scanner.recentNone']()}</p>
	{/if}
</div>

<style>
	.waiting {
		font-size: 12px;
		color: var(--text-muted);
	}
	.known {
		margin-top: 14px;
	}
	.known-head {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		margin-bottom: 6px;
	}
	.readers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.reader {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12.5px;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.rname {
		overflow-wrap: anywhere;
	}
	.rid {
		font-size: 11px;
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}
	.seen {
		margin-left: auto;
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
	}
	.link {
		font-size: 12px;
		color: var(--accent-link);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex: none;
	}
	.link:hover {
		text-decoration: underline;
	}
	.empty {
		margin: 0;
		font-size: 12px;
		color: var(--text-dim);
	}
</style>
