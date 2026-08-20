<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import X from '@lucide/svelte/icons/x';
	import Loader from '@lucide/svelte/icons/loader-circle';
	import Button from './Button.svelte';
	import NfcModeSwitch from './NfcModeSwitch.svelte';
	import NfcNotice from './NfcNotice.svelte';
	import NfcTagSummary from './NfcTagSummary.svelte';
	import {
		isWebNfcSupported,
		nfcCreateFromTag,
		nfcRead,
		type QidiTagData,
		type TigerTagData
	} from '$lib/api/nfc';
	import { nfcState } from '$lib/stores/nfc.svelte';
	import { decodeTigerTag, isTigerTag } from '$lib/utils/tigertagCodec';

	interface Props {
		open: boolean;
		onclose?: () => void;
	}
	let { open, onclose }: Props = $props();

	let mode = $state<'server' | 'browser'>('server');
	let reading = $state(false);
	let readError = $state<string | null>(null);
	let readMessage = $state<string | null>(null);
	let browserScanning = $state(false);
	let browserError = $state<string | null>(null);
	let creating = $state(false);
	let createError = $state<string | null>(null);

	let unmatchedTagData = $state<TigerTagData | null>(null);
	let unmatchedQidiData = $state<QidiTagData | null>(null);
	let unmatchedTagUid = $state<string | null>(null);
	let unmatchedTagFormat = $state<string | null>(null);

	let webNfcAvailable = isWebNfcSupported();

	function resetState() {
		reading = false;
		readError = null;
		readMessage = null;
		browserScanning = false;
		browserError = null;
		creating = false;
		createError = null;
		unmatchedTagData = null;
		unmatchedQidiData = null;
		unmatchedTagUid = null;
		unmatchedTagFormat = null;
	}

	// Reset scan state each time the modal opens, and default to whichever mode
	// actually works — the segmented switch itself stays reachable either way so
	// a user with both can still flip it.
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
			if (result.success && result.spool_id) {
				close();
				goto(resolve(`/?sel=spool:${result.spool_id}`));
				return;
			}
			if (result.success) {
				unmatchedTagFormat = result.tag_format ?? null;
				unmatchedTagUid = result.nfc_tag_uid ?? null;
				if (result.qidi_data) {
					unmatchedQidiData = result.qidi_data;
				} else if (result.tag_data) {
					unmatchedTagData = result.tag_data;
				} else {
					readMessage = result.message || m['nfc.noMatch']();
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
		unmatchedTagData = null;

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

								unmatchedTagData = {
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
								return;
							}
						} catch {
							// Failed to decode, fall through to other record types
						}
					}

					if (record.recordType === 'url' || record.recordType === 'text') {
						const decoder = new TextDecoder(record.encoding || 'utf-8');
						const text = record.data ? decoder.decode(record.data) : '';

						const spoolmanMatch = text.match(/web\+spoolman:s-(\d+)/);
						if (spoolmanMatch) {
							close();
							goto(resolve(`/?sel=spool:${spoolmanMatch[1]}`));
							return;
						}

						const urlMatch = text.match(/\/spool\/show\/(\d+)/);
						if (urlMatch) {
							close();
							goto(resolve(`/?sel=spool:${urlMatch[1]}`));
							return;
						}
					}
				}

				browserError = m['nfc.noMatch']();
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

	async function handleCreateFromTag() {
		if (!unmatchedTagData && !unmatchedQidiData) return;
		creating = true;
		createError = null;
		try {
			const result =
				unmatchedQidiData && unmatchedTagFormat === 'qidi'
					? await nfcCreateFromTag({
							tag_type: 'qidi',
							material_code: unmatchedQidiData.material_code,
							color_code: unmatchedQidiData.color_code,
							nfc_tag_uid: unmatchedTagUid ?? undefined
						})
					: unmatchedTagData
						? await nfcCreateFromTag({
								id_product: unmatchedTagData.id_product,
								id_material: unmatchedTagData.id_material,
								id_diameter: unmatchedTagData.id_diameter,
								id_brand: unmatchedTagData.id_brand,
								color_hex: unmatchedTagData.color_hex,
								weight: unmatchedTagData.weight,
								nozzle_temp: unmatchedTagData.nozzle_temp,
								bed_temp: unmatchedTagData.bed_temp,
								drying_temp: unmatchedTagData.drying_temp,
								drying_duration: unmatchedTagData.drying_duration,
								diameter_mm: unmatchedTagData.diameter_mm
							})
						: null;

			if (result?.success && result.spool_id) {
				close();
				goto(resolve(`/?sel=spool:${result.spool_id}`));
				return;
			}
			createError = result?.message || m['nfc.error.createFailed']();
		} catch {
			createError = m['nfc.error.createFailed']();
		} finally {
			creating = false;
		}
	}

	let hasUnmatched = $derived(unmatchedTagData !== null || unmatchedQidiData !== null);
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
			aria-label={m['nfc.scanTitle']()}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">{m['nfc.scanTitle']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<div class="body">
				<p class="hint">{m['nfc.scanDescription']()}</p>

				<NfcModeSwitch
					{mode}
					serverEnabled={nfcState.serverEnabled}
					browserEnabled={webNfcAvailable}
					serverLabel={m['nfc.modeServer']()}
					browserLabel={m['nfc.modeBrowser']()}
					onchange={(v) => (mode = v)}
				/>

				{#if !hasUnmatched}
					{#if mode === 'server'}
						<div class="stage">
							<Button onclick={handleServerRead} disabled={reading}>
								{#if reading}<Loader size={14} class="spin" />{/if}
								{reading ? m['nfc.reading']() : m['nfc.scanTitle']()}
							</Button>
							{#if readMessage}<NfcNotice kind="warning" message={readMessage} />{/if}
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
					<NfcNotice kind="info" message={m['nfc.createFromTagDescription']()} />
					<NfcTagSummary tagData={unmatchedTagData ?? undefined} qidiData={unmatchedQidiData ?? undefined} />
					<Button onclick={handleCreateFromTag} disabled={creating}>
						{creating ? m['nfc.creatingSpool']() : m['nfc.createFromTag']()}
					</Button>
					{#if createError}<NfcNotice kind="error" message={createError} />{/if}
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
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
