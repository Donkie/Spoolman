<script lang="ts">
	import type QrScanner from 'qr-scanner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { parseSpoolCode } from '$lib/utils/spoolCode';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onclose?: () => void;
	}
	let { open, onclose }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let error = $state<string | null>(null);
	let starting = $state(false);

	function close() {
		onclose?.();
	}

	// A scanned code that decodes to a Spoolman spool id opens that spool in the
	// Library. Non-Spoolman codes are ignored so the camera keeps scanning.
	function onDecode(result: QrScanner.ScanResult) {
		const id = parseSpoolCode(result.data);
		if (id === null) return;
		close();
		goto(resolve(`/?sel=spool:${id}`));
	}

	/** Map a getUserMedia DOMException to a friendly reason (by its `name`). */
	function messageForError(err: unknown): string {
		const name = (err as { name?: string } | null)?.name ?? '';
		if (name === 'NotAllowedError' || name === 'SecurityError') return m['scanner.errors.denied']();
		if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
			return m['scanner.errors.notFound']();
		if (name === 'NotReadableError' || name === 'TrackStartError') return m['scanner.errors.inUse']();
		return m['scanner.errors.generic']();
	}

	// qr-scanner collapses every getUserMedia failure into the opaque string
	// "Camera not found.", so when start() rejects we re-request the camera
	// ourselves to recover the real error name and report a specific reason.
	async function classifyStartFailure(): Promise<string> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			stream.getTracks().forEach((t) => t.stop());
			return m['scanner.errors.generic'](); // camera works now — the earlier failure was transient
		} catch (err) {
			return messageForError(err);
		}
	}

	// Start the camera while the modal is open and tear it down on close/unmount.
	// $effect re-runs when `open` (or the bound `video`) changes; its cleanup stops
	// the stream so the camera light goes off the moment the modal closes.
	$effect(() => {
		if (!open || !video) return;

		error = null;
		starting = false;

		// Insecure (non-HTTPS, non-localhost) origins don't expose the camera API
		// at all — qr-scanner would only report a generic "camera not found", so
		// detect this up front and tell the user the real reason before we try.
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			error = !window.isSecureContext ? m['scanner.errors.insecure']() : m['scanner.errors.unsupported']();
			return;
		}

		const el = video;
		let scanner: QrScanner | null = null;
		let cancelled = false;
		starting = true;

		// qr-scanner is a browser-only library, so load it lazily inside the effect.
		// A static import would drag its default export into the SSR bundle, where
		// this client-only usage is stripped and Rollup then warns it is unused.
		import('qr-scanner')
			.then(({ default: QrScanner }) => {
				if (cancelled) return;
				scanner = new QrScanner(el, onDecode, {
					// Prefer the rear camera; ignore frames that don't decode.
					preferredCamera: 'environment',
					highlightScanRegion: true,
					highlightCodeOutline: true,
					maxScansPerSecond: 5,
					returnDetailedScanResult: true
				});
				return scanner.start();
			})
			.then(() => {
				if (cancelled) scanner?.stop();
			})
			.catch(async (err) => {
				if (cancelled) return;
				console.error('QR scanner failed to start:', err);
				error = await classifyStartFailure();
			})
			.finally(() => {
				if (!cancelled) starting = false;
			});

		return () => {
			cancelled = true;
			scanner?.destroy();
			scanner = null;
		};
	});
</script>

{#if open}
	<div
		class="overlay"
		role="button"
		tabindex="0"
		onclick={close}
		onkeydown={(e) => e.key === 'Escape' && close()}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label={m['topbar.scan']()}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">{m['scanner.modalTitle']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}>✕</button>
			</div>

			<p class="hint">{m['scanner.hint']()}</p>

			<div class="stage">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video bind:this={video} playsinline></video>
				{#if error}
					<div class="msg error">{error}</div>
				{:else if starting}
					<div class="msg">{m['scanner.starting']()}</div>
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
		z-index: 50;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 16px 16px;
	}
	.modal {
		width: 460px;
		max-width: 100%;
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
		font-size: 15px;
		padding: 4px 8px;
		background: none;
		border: none;
	}
	.x:hover {
		color: var(--text);
	}
	.hint {
		padding: 8px 20px 0;
		margin: 0;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.stage {
		position: relative;
		margin: 14px 20px 20px;
		aspect-ratio: 1 / 1;
		background: #000;
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.stage video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.msg {
		position: absolute;
		inset: auto 12px 12px;
		text-align: center;
		font-size: 12.5px;
		color: #fff;
		background: rgba(0, 0, 0, 0.55);
		padding: 8px 12px;
		border-radius: var(--radius);
	}
	.msg.error {
		inset: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
