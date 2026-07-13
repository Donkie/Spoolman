<script lang="ts">
	import QrScanner from 'qr-scanner';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { parseSpoolCode } from '$lib/utils/spoolCode';

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
		goto(`${base}/?sel=spool:${id}`);
	}

	const MSG = {
		insecure:
			'The camera needs a secure connection. Browsers only allow camera access over HTTPS (or via localhost / 127.0.0.1) — open Spoolman that way to scan.',
		unsupported: 'This browser does not provide camera access.',
		denied:
			'Camera access was blocked. Allow the camera permission for this site in your browser, then try again.',
		notFound: 'No camera was found on this device.',
		inUse: 'The camera is already in use by another application.',
		generic: 'Could not start the camera.'
	};

	/** Map a getUserMedia DOMException to a friendly reason (by its `name`). */
	function messageForError(err: unknown): string {
		const name = (err as { name?: string } | null)?.name ?? '';
		if (name === 'NotAllowedError' || name === 'SecurityError') return MSG.denied;
		if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
			return MSG.notFound;
		if (name === 'NotReadableError' || name === 'TrackStartError') return MSG.inUse;
		return MSG.generic;
	}

	// qr-scanner collapses every getUserMedia failure into the opaque string
	// "Camera not found.", so when start() rejects we re-request the camera
	// ourselves to recover the real error name and report a specific reason.
	async function classifyStartFailure(): Promise<string> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			stream.getTracks().forEach((t) => t.stop());
			return MSG.generic; // camera works now — the earlier failure was transient
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
			error = !window.isSecureContext ? MSG.insecure : MSG.unsupported;
			return;
		}

		let scanner: QrScanner | null = null;
		let cancelled = false;
		starting = true;

		scanner = new QrScanner(video, onDecode, {
			// Prefer the rear camera; ignore frames that don't decode.
			preferredCamera: 'environment',
			highlightScanRegion: true,
			highlightCodeOutline: true,
			maxScansPerSecond: 5,
			returnDetailedScanResult: true
		});

		scanner
			.start()
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
			aria-label="Scan spool QR code"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">Scan a spool</span>
				<button class="x" onclick={close} aria-label="Close">✕</button>
			</div>

			<p class="hint">Point your camera at a Spoolman QR code to open its spool.</p>

			<div class="stage">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video bind:this={video} playsinline></video>
				{#if error}
					<div class="msg error">{error}</div>
				{:else if starting}
					<div class="msg">Starting camera…</div>
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
