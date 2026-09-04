<script lang="ts">
	import { untrack } from 'svelte';
	import QRCode from 'qrcode';
	import X from '@lucide/svelte/icons/x';
	import type { Filament, Spool, Vendor } from '$lib/types';
	import { buildOpenSpoolProfile, encodeOpenSpoolQr, type OpenSpoolProfile } from '$lib/openspool/qr';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		spool: Spool;
		filament: Filament;
		vendor?: Vendor;
		onclose: () => void;
	}

	let { open, spool, filament, vendor, onclose }: Props = $props();
	let dialog = $state<HTMLDivElement | null>(null);
	let opener: HTMLElement | null = null;
	let image = $state('');
	let error = $state('');
	let profile = $state<OpenSpoolProfile | null>(null);

	$effect(() => {
		if (!open) {
			image = '';
			error = '';
			profile = null;
			return;
		}

		let cancelled = false;
		image = '';
		error = '';
		try {
			// Keep the QR stable while the modal is open. Live inventory updates replace
			// the spool/filament objects frequently; tracking them here would clear and
			// regenerate the image on every update, making it visibly blink. Reopening
			// the modal still takes a fresh snapshot of the current values.
			const nextProfile = untrack(() => buildOpenSpoolProfile({ spool, filament, vendor }));
			profile = nextProfile;
			const payload = encodeOpenSpoolQr(nextProfile);
			QRCode.toDataURL(payload, {
				errorCorrectionLevel: 'H',
				margin: 4,
				width: 760,
				color: { dark: '#000000', light: '#FFFFFF' }
			})
				.then((dataUrl) => {
					if (!cancelled) image = dataUrl;
				})
				.catch((cause: unknown) => {
					if (!cancelled) error = cause instanceof Error ? cause.message : String(cause);
				});
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (open) {
			opener ??= document.activeElement as HTMLElement | null;
			dialog?.focus();
		} else if (opener) {
			opener.focus();
			opener = null;
		}
	});

	function close() {
		onclose();
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (open && event.key === 'Escape') close();
	}}
/>

{#if open}
	<div class="overlay">
		<button class="backdrop" tabindex="-1" aria-hidden="true" onclick={close}></button>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="openspool-qr-title"
			tabindex="-1"
			bind:this={dialog}
		>
			<div class="head">
				<span class="title" id="openspool-qr-title">OpenSpool QR</span>
				<button class="x" onclick={close} aria-label={m['buttons.close']()}><X size={18} /></button>
			</div>

			<div class="body" aria-live="polite">
				{#if error}
					<div class="error">{error}</div>
				{:else if profile}
					<div class="profile">
						<strong>{profile.brand} · {profile.name}</strong>
						<span>{profile.type}{profile.subtype ? ` / ${profile.subtype}` : ''}</span>
						<div class="colors" aria-label={profile.color_name ?? profile.color_hex}>
							{#each [profile.color_hex, ...(profile.additional_color_hexes ?? [])] as color (color)}
								<span class="color" style:background={color} title={color}></span>
							{/each}
							<span class="hexes">
								{[profile.color_hex, ...(profile.additional_color_hexes ?? [])].join(', ')}
							</span>
						</div>
					</div>

					{#if image}
						<img src={image} alt="OpenSpool QR" />
						<button class="confirm" type="button" onclick={close}>OK</button>
					{:else}
						<div class="loading">{m['loading']()}…</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: rgba(0, 0, 0, 0.64);
		backdrop-filter: blur(5px);
	}
	.backdrop {
		position: fixed;
		inset: 0;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		cursor: default;
	}
	.modal {
		position: relative;
		z-index: 1;
		width: 720px;
		max-width: 100%;
		max-height: calc(100vh - 32px);
		overflow: hidden;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 18px 12px 20px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		font-size: 17px;
		font-weight: 700;
	}
	.x {
		display: inline-flex;
		margin-left: auto;
		padding: 7px;
		color: var(--text-dim);
		background: var(--surface-raised);
		border: none;
		border-radius: 50%;
		cursor: pointer;
	}
	.x:hover {
		color: var(--text);
	}
	.body {
		display: flex;
		flex-direction: column;
		align-items: center;
		max-height: calc(100vh - 96px);
		overflow: auto;
		padding: 18px 20px 20px;
	}
	.profile {
		display: flex;
		align-self: stretch;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 14px;
		font-size: 13px;
		color: var(--text-2);
	}
	.profile strong {
		font-size: 15px;
		color: var(--text);
	}
	.colors {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 4px;
	}
	.color {
		width: 15px;
		height: 15px;
		border: 1px solid var(--border-strong);
		border-radius: 50%;
	}
	.hexes {
		margin-left: 3px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text-dim);
	}
	img {
		display: block;
		width: min(100%, 590px);
		height: auto;
		background: #fff;
		border-radius: var(--radius);
	}
	.confirm {
		display: inline-flex;
		align-items: center;
		margin-top: 14px;
		padding: 8px 13px;
		color: #fff;
		background: var(--accent-fill);
		border: none;
		border-radius: var(--radius);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.confirm:hover {
		background: var(--accent-fill-hover);
	}
	.loading,
	.error {
		padding: 56px 16px;
		font-size: 13px;
		color: var(--text-dim);
	}
	.error {
		color: var(--danger);
	}
	@media (max-width: 640px) {
		.overlay {
			align-items: flex-end;
			padding: 0;
		}
		.modal {
			max-height: 94vh;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
		}
		.body {
			max-height: calc(94vh - 60px);
			padding: 14px;
		}
	}
</style>
