<script lang="ts">
	import type QrScanner from 'qr-scanner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { parseSpoolCode } from '$lib/utils/spoolCode';
	import {
		type Camera,
		rememberCamera,
		rememberedCamera,
		startingCamera,
		videoCameras
	} from '$lib/utils/cameraChoice';
	import * as m from '$lib/paraglide/messages';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		open: boolean;
		onclose?: () => void;
	}
	let { open, onclose }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let error = $state<string | null>(null);
	let starting = $state(false);

	// Every camera the browser lists, read once the scanner is running (labels
	// are only readable after camera permission). More than one shows the picker.
	let cameras = $state<Camera[]>([]);
	// The camera the picker shows as selected: the one streaming, or the one that
	// just failed to open.
	let currentCamera = $state('');
	let switching = $state(false);
	// The running scanner, for the picker. Null while starting or closed.
	let active: QrScanner | null = null;

	function close() {
		onclose?.();
	}

	/** The deviceId of the camera actually streaming, whichever one we asked for. */
	function streamingCameraId(): string | undefined {
		const stream = video?.srcObject;
		return stream instanceof MediaStream ? stream.getVideoTracks()[0]?.getSettings().deviceId : undefined;
	}

	async function pickCamera(id: string) {
		const scanner = active;
		if (!scanner || switching) return;
		switching = true;
		error = null;
		try {
			await scanner.setCamera(id);
			// After a failed open the scanner is stopped, and setCamera only
			// restarts a running one (or does nothing for the same id), so a
			// retry has to start it again.
			if (!streamingCameraId()) await scanner.start();
			if (scanner !== active) return; // closed while switching
			// qr-scanner opens some other camera if the requested one fails, so
			// show and remember what is actually streaming.
			currentCamera = streamingCameraId() ?? id;
			rememberCamera(currentCamera);
		} catch (err) {
			if (scanner !== active) return;
			console.error('QR scanner failed to switch camera:', err);
			currentCamera = id;
			error = await classifyStartFailure();
		} finally {
			switching = false;
		}
	}

	// A scanned code that decodes to a Spoolman spool or filament opens it in the
	// Library. Non-Spoolman codes are ignored so the camera keeps scanning.
	function onDecode(result: QrScanner.ScanResult) {
		const ref = parseSpoolCode(result.data);
		if (ref === null) return;
		close();
		goto(resolve(`/?sel=${ref.kind}:${ref.id}`));
	}

	/** Map a getUserMedia DOMException to a friendly reason (by its `name`). */
	function messageForError(err: unknown): string {
		const name = (err as { name?: string } | null)?.name ?? '';
		if (name === 'NotAllowedError' || name === 'SecurityError') return m['scanner.error.notAllowed']();
		if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
			return m['scanner.error.notFound']();
		if (name === 'NotReadableError' || name === 'TrackStartError') return m['scanner.error.inUse']();
		return m['scanner.error.unknown']({ error: name });
	}

	// qr-scanner collapses every getUserMedia failure into the opaque string
	// "Camera not found.", so when start() rejects we re-request the camera
	// ourselves to recover the real error name and report a specific reason.
	async function classifyStartFailure(): Promise<string> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			stream.getTracks().forEach((t) => t.stop());
			return m['scanner.error.unknown']({ error: 'error unknown' }); // camera works now — the earlier failure was transient
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
		cameras = [];
		currentCamera = '';

		// Insecure (non-HTTPS, non-localhost) origins don't expose the camera API
		// at all — qr-scanner would only report a generic "camera not found", so
		// detect this up front and tell the user the real reason before we try.
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			error = !window.isSecureContext
				? m['scanner.error.insecureContext']()
				: m['scanner.error.streamApiNotSupported']();
			return;
		}

		const el = video;
		let scanner: QrScanner | null = null;
		let cancelled = false;
		starting = true;

		// qr-scanner is a browser-only library, so load it lazily inside the effect.
		// A static import would drag its default export into the SSR bundle, where
		// this client-only usage is stripped and Rollup then warns it is unused.
		Promise.all([
			import('qr-scanner'),
			// Only to check the remembered camera still exists; any failure just
			// means we fall back to the rear camera.
			navigator.mediaDevices.enumerateDevices().catch(() => [])
		])
			.then(async ([{ default: QrScanner }, devices]) => {
				if (cancelled) return;
				const ids = videoCameras(devices).map((c) => c.id);
				scanner = new QrScanner(el, onDecode, {
					// The camera picked last time, else the rear one; ignore frames that don't decode.
					preferredCamera: startingCamera(rememberedCamera(), ids),
					highlightScanRegion: true,
					highlightCodeOutline: true,
					maxScansPerSecond: 5,
					returnDetailedScanResult: true
				});
				await scanner.start();
				if (cancelled) {
					scanner?.stop();
					return;
				}
				active = scanner;
				currentCamera = streamingCameraId() ?? '';
				// The camera is already running, so a failed listing only costs the picker.
				const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
				if (!cancelled) cameras = videoCameras(list);
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
			active = null;
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
			aria-label={m['scanner.title']()}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">{m['scanner.title']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<p class="hint">{m['scanner.description']()}</p>

			<div class="stage">
				<video bind:this={video} playsinline></video>
				{#if error}
					<div class="msg error">{error}</div>
				{:else if starting}
					<div class="msg">{m['scanner.starting']()}</div>
				{/if}
			</div>

			{#if cameras.length > 1}
				<!-- Stays up after a failed switch, so another camera can be tried. -->
				<select
					class="camera"
					value={currentCamera}
					disabled={switching}
					aria-label={m['scanner.camera']()}
					onchange={(e) => pickCamera(e.currentTarget.value)}
				>
					{#each cameras as camera, i (camera.id)}
						<option value={camera.id}>{camera.label || m['scanner.cameraNumbered']({ number: i + 1 })}</option
						>
					{/each}
				</select>
			{/if}
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
	.camera {
		margin: -6px 20px 20px;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		color: var(--text);
		padding: 7px 10px;
		font-size: 13px;
	}
	.camera:disabled {
		opacity: 0.55;
	}
</style>
