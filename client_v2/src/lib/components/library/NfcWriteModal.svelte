<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import Loader from '@lucide/svelte/icons/loader-circle';
	import Button from '../Button.svelte';
	import Field from '../Field.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Swatch from '../Swatch.svelte';
	import NfcModeSwitch from '../NfcModeSwitch.svelte';
	import NfcNotice from '../NfcNotice.svelte';
	import { nfcEncode, nfcWrite } from '$lib/api/nfc';
	import { nfcState } from '$lib/stores/nfc.svelte';
	import { encodeTigerTag, mapSpoolToTigerTag } from '$lib/utils/tigertagCodec';
	import type { Filament, Spool } from '$lib/types';

	interface Props {
		spool: Spool;
		filament: Filament;
		open: boolean;
		onclose?: () => void;
	}
	let { spool, filament, open, onclose }: Props = $props();

	let modeOverride = $state<'server' | 'browser' | null>(null);
	let tagFormat = $state<'tigertag' | 'qidi'>('tigertag');
	let userMessage = $state('');
	let writing = $state(false);
	let writeResult = $state<{ success: boolean; message: string } | null>(null);
	let encoding = $state(false);

	// Default to server if available, otherwise browser (whose "download" option
	// works without any NFC hardware or Web NFC support at all).
	let mode = $derived(modeOverride ?? (nfcState.serverEnabled ? 'server' : 'browser'));

	function resetState() {
		modeOverride = null;
		tagFormat = 'tigertag';
		userMessage = '';
		writing = false;
		writeResult = null;
		encoding = false;
	}

	$effect(() => {
		if (open) resetState();
	});

	function close() {
		onclose?.();
	}

	async function handleServerWrite() {
		writing = true;
		writeResult = null;
		try {
			const result = await nfcWrite({
				spool_id: spool.id,
				tag_format: tagFormat,
				user_message: tagFormat === 'tigertag' ? userMessage : undefined
			});
			writeResult = { success: result.success, message: result.message };
		} catch {
			writeResult = { success: false, message: m['nfc.writeError']() };
		} finally {
			writing = false;
		}
	}

	async function handleBrowserWrite() {
		if (!window.NDEFReader) {
			writeResult = { success: false, message: m['nfc.error.notSupported']() };
			return;
		}

		writing = true;
		writeResult = null;

		try {
			const reader = new window.NDEFReader();
			const tagData = mapSpoolToTigerTag(spool, filament, userMessage);
			const binaryPayload = encodeTigerTag(tagData);

			await reader.write({
				records: [{ recordType: 'tigertag.io:maker', data: binaryPayload }]
			});

			writeResult = { success: true, message: m['nfc.browserWriteSuccess']() };
		} catch (error) {
			if (error instanceof DOMException && error.name === 'NotAllowedError') {
				writeResult = { success: false, message: m['nfc.error.permissionDenied']() };
			} else {
				writeResult = { success: false, message: m['nfc.writeError']() };
			}
		} finally {
			writing = false;
		}
	}

	async function handleDownloadBinary() {
		encoding = true;
		try {
			const result = await nfcEncode({ spool_id: spool.id, user_message: userMessage });
			if (result.success && result.binary_b64) {
				const binaryString = atob(result.binary_b64);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
				const blob = new Blob([bytes], { type: 'application/octet-stream' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `spool-${spool.id}-tigertag.bin`;
				a.click();
				URL.revokeObjectURL(url);
				writeResult = { success: true, message: m['nfc.downloadSuccess']() };
			} else {
				writeResult = { success: false, message: result.message || m['nfc.error.encodeFailed']() };
			}
		} catch {
			writeResult = { success: false, message: m['nfc.error.encodeFailed']() };
		} finally {
			encoding = false;
		}
	}

	function handleWrite() {
		if (mode === 'server') {
			handleServerWrite();
		} else {
			handleBrowserWrite();
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
			aria-label={m['nfc.encodeTitle']()}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-head">
				<span class="title">{m['nfc.encodeTitle']()}</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={16} /></button>
			</div>

			<div class="body">
				<NfcModeSwitch
					{mode}
					serverEnabled={nfcState.serverEnabled}
					browserEnabled={true}
					serverLabel={m['nfc.modeServer']()}
					browserLabel={m['nfc.modeBrowser']()}
					onchange={(v) => (modeOverride = v)}
				/>

				{#if mode === 'server'}
					<div class="format-row">
						<span class="format-label">{m['nfc.tagFormatLabel']()}</span>
						<NfcModeSwitch
							mode={tagFormat === 'tigertag' ? 'server' : 'browser'}
							serverEnabled={true}
							browserEnabled={true}
							serverLabel="TigerTag (NTAG213)"
							browserLabel="Qidi (MIFARE Classic)"
							onchange={(v) => (tagFormat = v === 'server' ? 'tigertag' : 'qidi')}
						/>
					</div>
				{/if}

				{#if filament}
					<div class="preview">
						<span class="preview-title">{m['nfc.previewTitle']()}</span>
						<FieldGrid labelWidth="130px">
							<Field label={m['filament.fields.material']()}>{filament.material}</Field>
							<Field label={m['filament.fields.diameter']()} mono>{filament.diameter} mm</Field>
							{#if filament.colors.length}
								<Field label={m['filament.fields.colorHex']()}>
									<span class="color-row">
										<Swatch
											colors={filament.colors}
											direction={filament.multiColorDirection}
											size={14}
											radius={3}
										/>
										{filament.colors[0]?.toUpperCase()}
									</span>
								</Field>
							{/if}
							{#if filament.weight}
								<Field label={m['filament.fields.weight']()} mono>{filament.weight} g</Field>
							{/if}
							{#if filament.nozzleTemp}
								<Field label={m['filament.fields.settingsExtruderTemp']()} mono
									>{filament.nozzleTemp} °C</Field
								>
							{/if}
							{#if filament.bedTemp}
								<Field label={m['filament.fields.settingsBedTemp']()} mono>{filament.bedTemp} °C</Field>
							{/if}
						</FieldGrid>
					</div>
				{/if}

				{#if tagFormat === 'tigertag'}
					<label class="msg-field">
						<span class="format-label">{m['nfc.userMessage']()}</span>
						<input
							type="text"
							maxlength="28"
							placeholder={m['nfc.userMessageHelp']()}
							bind:value={userMessage}
						/>
					</label>
				{/if}

				{#if tagFormat === 'qidi' && mode === 'server'}
					<NfcNotice kind="info" message={m['nfc.qidiWriteInfo']()} />
				{/if}

				{#if mode === 'server' && writing}
					<div class="stage"><Loader size={16} class="spin" /> {m['nfc.placeTag']()}</div>
				{/if}
				{#if mode === 'browser' && writing}
					<div class="stage"><Loader size={16} class="spin" /> {m['nfc.placeTag']()}</div>
				{/if}
				{#if writeResult}
					<NfcNotice kind={writeResult.success ? 'success' : 'error'} message={writeResult.message} />
				{/if}

				{#if mode === 'browser'}
					<NfcNotice kind="warning" message={m['nfc.browserNdefWarning']()} />
					<Button variant="outline" onclick={handleDownloadBinary} disabled={encoding}>
						{#if encoding}<Loader size={14} class="spin" />{:else}<Download size={14} />{/if}
						{m['nfc.downloadRawBinary']()}
					</Button>
				{/if}

				<div class="footer-row">
					<Button variant="outline" onclick={close}>{m['buttons.close']()}</Button>
					<Button onclick={handleWrite} disabled={writing || (mode === 'server' && !nfcState.serverEnabled)}>
						{writing ? m['nfc.writing']() : m['nfc.encodeButton']()}
					</Button>
				</div>
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
		overflow-y: auto;
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
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px 20px 20px;
	}
	.format-row,
	.msg-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.format-label {
		font-size: 12px;
		color: var(--text-muted);
	}
	.msg-field input {
		font: inherit;
		font-size: 13px;
		padding: 7px 10px;
		border-radius: var(--radius);
		border: 1px solid var(--border-strong);
		background: var(--bg);
		color: var(--text);
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-md);
	}
	.preview-title {
		font-weight: 600;
		font-size: 12.5px;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.stage {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 12.5px;
		color: var(--text-muted);
		padding: 10px 0;
	}
	.footer-row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
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
