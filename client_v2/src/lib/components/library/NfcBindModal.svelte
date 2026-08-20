<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import X from '@lucide/svelte/icons/x';
	import Link from '@lucide/svelte/icons/link';
	import Loader from '@lucide/svelte/icons/loader-circle';
	import Button from '../Button.svelte';
	import NfcModeSwitch from '../NfcModeSwitch.svelte';
	import NfcNotice from '../NfcNotice.svelte';
	import NfcTagSummary from '../NfcTagSummary.svelte';
	import { isWebNfcSupported, nfcBind, nfcRead, type QidiTagData, type TigerTagData } from '$lib/api/nfc';
	import { nfcState } from '$lib/stores/nfc.svelte';
	import { decodeTigerTag, isTigerTag } from '$lib/utils/tigertagCodec';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { Spool } from '$lib/types';

	interface Props {
		spool: Spool;
		open: boolean;
		onclose?: () => void;
		onbound?: () => void;
	}
	let { spool, open, onclose, onbound }: Props = $props();

	let mode = $state<'server' | 'browser'>('server');
	let reading = $state(false);
	let readError = $state<string | null>(null);
	let browserScanning = $state(false);
	let browserError = $state<string | null>(null);
	let binding = $state(false);

	let scannedTagData = $state<TigerTagData | null>(null);
	let scannedQidiData = $state<QidiTagData | null>(null);
	let scannedRawB64 = $state<string | null>(null);
	let scannedTagUid = $state<string | null>(null);
	let scannedTagFormat = $state<string | null>(null);

	let webNfcAvailable = isWebNfcSupported();
	let hasScannedTag = $derived(scannedTagData !== null || scannedQidiData !== null);

	function resetState() {
		reading = false;
		readError = null;
		browserScanning = false;
		browserError = null;
		binding = false;
		scannedTagData = null;
		scannedQidiData = null;
		scannedRawB64 = null;
		scannedTagUid = null;
		scannedTagFormat = null;
	}

	$effect(() => {
		if (!open) return;
		resetState();
		mode = nfcState.serverEnabled ? 'server' : 'browser';
	});

	function close() {
		onclose?.();
	}

	async function handleServerRead() {
		resetState();
		reading = true;
		try {
			const result = await nfcRead();
			if (result.success) {
				scannedTagFormat = result.tag_format ?? null;
				scannedTagUid = result.nfc_tag_uid ?? null;
				scannedRawB64 = result.raw_data_b64 ?? null;
				if (result.qidi_data) {
					scannedQidiData = result.qidi_data;
				} else if (result.tag_data) {
					scannedTagData = result.tag_data;
				} else {
					readError = result.message || m['nfc.bindNoTigertag']();
				}
			} else {
				readError = result.message || m['nfc.error.readFailed']();
			}
		} catch {
			readError = m['nfc.error.readFailed']();
		} finally {
			reading = false;
		}
	}

	async function handleBrowserScan() {
		if (!window.NDEFReader) {
			browserError = m['nfc.error.notSupported']();
			return;
		}

		browserScanning = true;
		browserError = null;
		scannedTagData = null;
		scannedRawB64 = null;

		try {
			const reader = new window.NDEFReader();
			const controller = new AbortController();

			reader.onreading = (event) => {
				controller.abort();
				browserScanning = false;

				for (const record of event.message.records) {
					if (record.recordType === 'tigertag.io:maker' && record.data) {
						try {
							const tagData = decodeTigerTag(record.data.buffer as ArrayBuffer);
							if (isTigerTag(tagData.id_tigertag) && tagData.id_product > 0) {
								const colorHex = [tagData.color_r, tagData.color_g, tagData.color_b]
									.map((c) => c.toString(16).padStart(2, '0'))
									.join('');
								const diameterMm = tagData.id_diameter === 1 ? 1.75 : tagData.id_diameter === 2 ? 2.85 : 0;

								scannedTagData = {
									id_tigertag: tagData.id_tigertag,
									id_product: tagData.id_product,
									id_material: tagData.id_material,
									id_diameter: tagData.id_diameter,
									id_brand: tagData.id_brand,
									color_hex: colorHex,
									weight: tagData.weight,
									nozzle_temp: tagData.nozzle_temp,
									bed_temp: tagData.bed_temp,
									drying_temp: tagData.drying_temp,
									drying_duration: tagData.drying_duration,
									timestamp: tagData.timestamp,
									user_message: tagData.user_message,
									diameter_mm: diameterMm
								};

								const bytes = new Uint8Array(record.data.buffer);
								scannedRawB64 = btoa(String.fromCharCode(...bytes));
								return;
							}
						} catch {
							// Fall through
						}
					}
				}

				browserError = m['nfc.bindNoTigertag']();
			};

			reader.onreadingerror = () => {
				controller.abort();
				browserScanning = false;
				browserError = m['nfc.error.readFailed']();
			};

			await reader.scan({ signal: controller.signal });
		} catch (error) {
			browserScanning = false;
			if (error instanceof DOMException && error.name === 'NotAllowedError') {
				browserError = m['nfc.error.permissionDenied']();
			} else {
				browserError = m['nfc.error.readFailed']();
			}
		}
	}

	async function handleBind() {
		if (!hasScannedTag) return;
		binding = true;
		try {
			const result =
				scannedTagFormat === 'qidi' && scannedTagUid
					? await nfcBind({
							spool_id: spool.id,
							tag_type: 'qidi',
							nfc_tag_uid: scannedTagUid,
							raw_data_b64: scannedRawB64 ?? undefined
						})
					: scannedTagData
						? await nfcBind(
								scannedRawB64
									? { spool_id: spool.id, raw_data_b64: scannedRawB64 }
									: {
											spool_id: spool.id,
											id_product: scannedTagData.id_product,
											timestamp: scannedTagData.timestamp || 0
										}
							)
						: null;

			if (result?.success) {
				toasts.success(result.message);
				onbound?.();
				close();
			} else {
				toasts.error(result?.message || m['nfc.bindError']());
			}
		} catch {
			toasts.error(m['nfc.bindError']());
		} finally {
			binding = false;
		}
	}
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
			aria-label={m['nfc.bindTitle']()}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">{m['nfc.bindTitle']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<div class="body">
				<p class="hint">{m['nfc.bindDescription']()}</p>

				<NfcModeSwitch
					{mode}
					serverEnabled={nfcState.serverEnabled}
					browserEnabled={webNfcAvailable}
					serverLabel={m['nfc.modeServer']()}
					browserLabel={m['nfc.modeBrowser']()}
					onchange={(v) => (mode = v)}
				/>

				{#if !hasScannedTag}
					{#if mode === 'server'}
						<div class="stage">
							<Button onclick={handleServerRead} disabled={reading}>
								{#if reading}<Loader size={14} class="spin" />{/if}
								{reading ? m['nfc.reading']() : m['nfc.scanTitle']()}
							</Button>
							{#if readError}<NfcNotice kind="error" message={readError} />{/if}
						</div>
					{:else}
						<div class="stage">
							<Button onclick={handleBrowserScan} disabled={browserScanning}>
								{#if browserScanning}<Loader size={14} class="spin" />{/if}
								{browserScanning ? m['nfc.placeTag']() : m['nfc.scanTitle']()}
							</Button>
							{#if browserError}<NfcNotice kind="error" message={browserError} />{/if}
						</div>
					{/if}
				{:else}
					<NfcNotice kind="info" message={m['nfc.bindConfirmDescription']()} />
					<NfcTagSummary tagData={scannedTagData ?? undefined} qidiData={scannedQidiData ?? undefined} />
					<div class="confirm-row">
						<Button variant="outline" onclick={resetState}>{m['nfc.bindScanAgain']()}</Button>
						<Button onclick={handleBind} disabled={binding}>
							{#if binding}<Loader size={14} class="spin" />{:else}<Link size={14} />{/if}
							{binding ? m['nfc.bindBinding']() : m['nfc.bindButton']()}
						</Button>
					</div>
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
		width: 440px;
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
		margin: 0;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 12px 20px 20px;
	}
	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 20px 0;
	}
	.confirm-row {
		display: flex;
		gap: 8px;
		justify-content: center;
	}
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
