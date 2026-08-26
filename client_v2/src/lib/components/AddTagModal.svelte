<script lang="ts">
	// Link a physical tag to a spool, by any of the three ways a UID can reach a
	// browser: a reader taps it and the relay delivers it, this phone reads it over
	// Web NFC, or the user types it.
	//
	// All three converge on one input, deliberately. The UID is the whole of a
	// tag's identity, so a scan is nothing more than a faster way to fill the same
	// box — and seeing what was captured before committing is what makes an
	// unfamiliar tag safe to link.
	//
	// The dialog looks the UID up as it settles rather than waiting for the link to
	// be rejected, because "this tag is already on spool #12" is the answer that
	// changes what you want to do, and learning it after pressing the button means
	// pressing a second one. A 409 on submit is still handled: the lookup can be
	// stale, and the server is the authority.
	import Button from './Button.svelte';
	import X from '@lucide/svelte/icons/x';
	import Nfc from '@lucide/svelte/icons/nfc';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import Radio from '@lucide/svelte/icons/radio';
	import History from '@lucide/svelte/icons/history';
	import type { Spool } from '$lib/types';
	import { linkTag, unlinkTag, findSpoolByTag, asTagConflict, isBadUid } from '$lib/api/tags';
	import { scanRelay } from '$lib/api/scanRelay';
	import { scanner } from '$lib/stores/scanner.svelte';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { spoolSource } from '$lib/api/spoolSource';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { isAbortError } from '$lib/api/http';
	import { nfcSupported, readTagUid, NfcError, type NfcErrorReason } from '$lib/utils/nfc';
	import { filamentLabel } from '$lib/utils/library';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		spool: Spool;
		onclose: () => void;
	}
	let { open, spool, onclose }: Props = $props();

	let uid = $state('');
	/** Carried through from a scan; a typed UID has no format to report. */
	let format = $state<string | undefined>(undefined);
	let busy = $state(false);
	let error = $state<string | null>(null);

	/** What the UID currently in the box resolves to on the server. */
	type Lookup =
		| { state: 'empty' }
		| { state: 'checking' }
		| { state: 'free' }
		| { state: 'here' }
		| { state: 'taken'; spool: Spool }
		| { state: 'bad' }
		| { state: 'unknown' };
	let lookup = $state<Lookup>({ state: 'empty' });

	let nfcReading = $state(false);
	let nfcError = $state<NfcErrorReason | null>(null);
	/** Whether this phone can read tags itself. False everywhere but Chrome on
	 *  Android over HTTPS, which is why the control is omitted rather than
	 *  disabled — there is no advice to give a desktop user about it. */
	const canReadHere = nfcSupported();

	// Web NFC needs a real gesture to raise its permission prompt, so this is
	// started by the button rather than on open.
	let nfcAbort: AbortController | null = null;

	function reset() {
		uid = '';
		format = undefined;
		error = null;
		lookup = { state: 'empty' };
		nfcError = null;
		stopNfc();
	}

	function close() {
		onclose();
	}

	function stopNfc() {
		nfcAbort?.abort();
		nfcAbort = null;
		nfcReading = false;
	}

	// Everything the dialog does starts when it opens and stops when it closes,
	// including the relay subscription and the hold on auto-navigate. That hold
	// matters more than it looks: the tap this dialog is waiting for is exactly the
	// event that would otherwise navigate the browser somewhere else, throwing the
	// dialog away mid-flow.
	$effect(() => {
		if (!open) return;
		reset();
		const release = scanner.suppress();
		const off = scanRelay.subscribe(scanner.pool, (scan) => {
			scanner.receive(scan);
			uid = scan.uid;
			format = scan.format;
			nfcError = null;
			stopNfc();
		});
		return () => {
			off();
			release();
			stopNfc();
		};
	});

	// Resolve the UID as it settles. Debounced because this also runs while the
	// user is typing one in by hand, and aborted on every change so a slow earlier
	// answer can't land on top of a newer one.
	$effect(() => {
		const value = uid.trim();
		if (!open) return;
		if (!value) {
			lookup = { state: 'empty' };
			return;
		}
		lookup = { state: 'checking' };
		const ac = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const found = await findSpoolByTag(value, ac.signal);
				if (ac.signal.aborted) return;
				if (!found) lookup = { state: 'free' };
				else if (found.id === spool.id) lookup = { state: 'here' };
				else lookup = { state: 'taken', spool: found };
			} catch (err) {
				if (isAbortError(err, ac.signal)) return;
				// A UID that isn't hexadecimal is a 400 rather than an empty result, so
				// a half-typed or mistyped one says so instead of claiming to be free.
				lookup = isBadUid(err) ? { state: 'bad' } : { state: 'unknown' };
			}
		}, 350);
		return () => {
			clearTimeout(timer);
			ac.abort();
		};
	});

	async function startNfc() {
		stopNfc();
		nfcError = null;
		const ac = new AbortController();
		nfcAbort = ac;
		nfcReading = true;
		try {
			const serial = await readTagUid(ac.signal);
			uid = serial;
			// Web NFC reaches NDEF tags, so "ntag" is the honest default for what it
			// can read — but only as a starting guess the server may refine later.
			format = 'ntag';
		} catch (err) {
			if (ac.signal.aborted) return; // closed, or superseded by another read
			nfcError = err instanceof NfcError ? err.reason : 'unknown';
		} finally {
			if (nfcAbort === ac) {
				nfcAbort = null;
				nfcReading = false;
			}
		}
	}

	function nfcErrorMessage(reason: NfcErrorReason): string {
		if (reason === 'notAllowed') return m['tags.nfc.notAllowed']();
		if (reason === 'notSupported') return m['tags.nfc.notSupported']();
		if (reason === 'notReadable') return m['tags.nfc.notReadable']();
		if (reason === 'insecureContext') return m['tags.nfc.insecureContext']();
		return m['tags.nfc.unknown']();
	}

	/** Describe another spool well enough to decide whether to take its tag. */
	function describe(other: Spool): string {
		const filament = inventory.filamentById(other.filamentId);
		const vendor = filament ? inventory.vendorById(filament.vendorId) : undefined;
		if (!filament) return m['tags.modal.spoolShort']({ id: other.id });
		return m['tags.modal.spoolNamed']({
			id: other.id,
			name: vendor ? filamentLabel(filament, vendor) : filament.name
		});
	}

	async function submit() {
		const value = uid.trim();
		if (!value || busy) return;
		busy = true;
		error = null;
		try {
			await linkTag(spool.id, value, format);
			toasts.success(m['tags.added']());
			close();
		} catch (err) {
			const conflict = asTagConflict(err);
			if (conflict) {
				// Lost a race, or the lookup never ran. Fetch the holder so the offer to
				// move the tag can name it, and fall back to the bare id if even that
				// fails — the offer is still valid without a name.
				const holder = await spoolSource.fetchSpool(conflict.spoolId).catch(() => undefined);
				lookup = holder ? { state: 'taken', spool: holder } : { state: 'unknown' };
				error = holder ? null : conflict.message;
			} else if (isBadUid(err)) {
				lookup = { state: 'bad' };
			} else {
				error = m['tags.modal.failed']();
			}
		} finally {
			busy = false;
		}
	}

	/**
	 * Take a tag off the spool that holds it and put it on this one.
	 *
	 * Two requests, in this order, because a tag belongs to exactly one spool and
	 * the server will not accept the second until the first has happened. If the
	 * link then fails the tag is left on neither, which is reported rather than
	 * hidden: the tag still exists and can simply be linked again.
	 */
	async function move(from: Spool) {
		const value = uid.trim();
		if (!value || busy) return;
		busy = true;
		error = null;
		try {
			await unlinkTag(from.id, value);
			await linkTag(spool.id, value, format);
			toasts.success(m['tags.moved']({ id: from.id }));
			close();
		} catch {
			error = m['tags.modal.moveFailed']();
		} finally {
			busy = false;
		}
	}

	// Naming the reader you are waiting on needs the server's registry, since the
	// store keeps no copy of reader names; until it arrives the id stands in.
	$effect(() => {
		if (open && scanner.pool !== null) scanner.ensureReaderNames();
	});

	let readerLabel = $derived(scanner.pairedLabel);
	// What the reader we listen to already has on it. Offered instead of asking
	// for another tap, which on a scale means lifting the spool off the pad and
	// putting it back. Hidden once it is what the field already holds, so it
	// never sits there as a no-op.
	let lastSeen = $derived(scanner.listeningLastSeen);
	let lastSeenOffer = $derived(
		lastSeen && lastSeen.uid.toUpperCase() !== uid.trim().toUpperCase() ? lastSeen : null
	);
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') close();
	}}
/>

{#if open}
	<div class="overlay">
		<!-- Click-outside catcher: a sibling of the dialog rather than a parent, so
		     interactive controls aren't nested inside an interactive element. -->
		<button class="backdrop" tabindex="-1" aria-hidden="true" onclick={close}></button>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-tag-title" tabindex="-1">
			<div class="modal-head">
				<span class="title" id="add-tag-title">{m['tags.modal.title']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<div class="body">
				<p class="intro">{m['tags.modal.intro']({ id: spool.id })}</p>

				<label class="uid-label" for="add-tag-uid">{m['tags.modal.uidLabel']()}</label>
				<input
					id="add-tag-uid"
					class="uid-input mono"
					bind:value={uid}
					placeholder={m['tags.modal.uidPlaceholder']()}
					autocomplete="off"
					spellcheck="false"
					onkeydown={(e) => {
						if (e.key === 'Enter') submit();
					}}
				/>
				<p class="help">{m['tags.modal.uidHelp']()}</p>

				<div class="status" aria-live="polite">
					{#if lookup.state === 'checking'}
						<span class="muted">{m['tags.modal.checking']()}</span>
					{:else if lookup.state === 'free'}
						<span class="ok">{m['tags.modal.free']()}</span>
					{:else if lookup.state === 'here'}
						<span class="muted">{m['tags.modal.alreadyHere']()}</span>
					{:else if lookup.state === 'taken'}
						<span class="warn">{m['tags.modal.takenBy']({ spool: describe(lookup.spool) })}</span>
					{:else if lookup.state === 'bad'}
						<span class="warn">{m['tags.modal.badUid']()}</span>
					{/if}
				</div>

				<div class="ways">
					<div class="way">
						<Radio size={14} class="way-ico" />
						<span>
							{#if readerLabel}
								{m['tags.modal.waitingOn']({ reader: readerLabel })}
							{:else}
								{m['tags.modal.waitingAny']()}
							{/if}
						</span>
					</div>
					{#if lastSeenOffer}
						<div class="way">
							<History size={14} class="way-ico" />
							<span>
								{m['tags.modal.lastSeenOn']({
									reader: lastSeenOffer.label,
									uid: lastSeenOffer.uid
								})}
							</span>
							<button class="link act" onclick={() => (uid = lastSeenOffer.uid)}>
								{m['tags.modal.useLastSeen']()}
							</button>
						</div>
					{/if}
					{#if canReadHere}
						<div class="way">
							<Smartphone size={14} class="way-ico" />
							{#if nfcReading}
								<span>{m['tags.modal.phoneReading']()}</span>
								<button class="link" onclick={stopNfc}>{m['buttons.cancel']()}</button>
							{:else}
								<button class="link" onclick={startNfc}>{m['tags.modal.phoneScan']()}</button>
							{/if}
						</div>
					{/if}
				</div>

				{#if nfcError}<div class="err">{nfcErrorMessage(nfcError)}</div>{/if}
				{#if error}<div class="err">{error}</div>{/if}
			</div>

			<div class="foot">
				<Button variant="ghost" onclick={close}>{m['buttons.cancel']()}</Button>
				{#if lookup.state === 'taken'}
					{@const other = lookup.spool}
					<Button variant="primary" disabled={busy} onclick={() => move(other)}>
						<Nfc size={15} />
						{busy ? m['tags.modal.moving']() : m['tags.modal.move']({ id: other.id })}
					</Button>
				{:else}
					<Button
						variant="primary"
						disabled={busy || !uid.trim() || lookup.state === 'here' || lookup.state === 'bad'}
						onclick={submit}
					>
						<Nfc size={15} />
						{busy ? m['tags.modal.linking']() : m['tags.modal.link']()}
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		/* Above the inspector's bottom sheet on mobile, same layer as the other
		   library dialogs. */
		z-index: 60;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 16px 16px;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		border: none;
		margin: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.modal {
		position: relative;
		z-index: 1;
		width: 460px;
		max-width: 100%;
		max-height: 84vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.modal-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 20px 0;
		flex: none;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.x {
		margin-left: auto;
		color: var(--text-dim);
		cursor: pointer;
		padding: 4px 8px;
		background: none;
		border: none;
		display: inline-flex;
	}
	.x:hover {
		color: var(--text);
	}
	.body {
		padding: 12px 20px 4px;
		overflow-y: auto;
	}
	.intro {
		margin: 0 0 14px;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.uid-label {
		display: block;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		margin-bottom: 5px;
	}
	.uid-input {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 10px;
		font-size: 14px;
		letter-spacing: 0.04em;
		color: var(--text);
		background: var(--surface-sunken);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.uid-input:focus {
		outline: none;
		border-color: var(--accent-link);
	}
	.help {
		margin: 6px 0 0;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.status {
		/* Reserved so the dialog doesn't jump as the lookup resolves. */
		min-height: 20px;
		margin-top: 8px;
		font-size: 12px;
	}
	.muted {
		color: var(--text-dim);
	}
	.ok {
		color: var(--text-muted);
	}
	.warn {
		color: var(--danger-soft);
	}
	.ways {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.way {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.way :global(.way-ico) {
		color: var(--text-dim);
		flex: none;
	}
	.link {
		font-size: 12px;
		color: var(--accent-link);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.link:hover {
		text-decoration: underline;
	}
	/* The offer is the action in its row rather than an alternative route like
	   the phone reader, so it carries the weight a UID gets elsewhere. */
	.link.act {
		font-weight: 600;
		white-space: nowrap;
	}
	.err {
		margin-top: 10px;
		font-size: 12px;
		color: var(--danger-soft);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 14px 20px 16px;
		flex: none;
	}
</style>
