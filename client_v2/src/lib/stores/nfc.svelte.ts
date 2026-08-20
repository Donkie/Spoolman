// Server-side NFC reader availability, polled once at startup so the TopBar
// can decide whether the NFC scan button is worth showing at all. Web NFC
// (browser-side, Android Chrome only) is a synchronous capability check and
// doesn't need state — see isWebNfcSupported() in $lib/api/nfc.

import { nfcStatus, isWebNfcSupported } from '$lib/api/nfc';

class NfcState {
	serverEnabled = $state(false);
	checked = $state(false);

	/** True when either the server has a reader attached, or this browser can scan NFC itself. */
	available = $derived(this.serverEnabled || isWebNfcSupported());

	async refresh() {
		try {
			const status = await nfcStatus();
			this.serverEnabled = status.enabled === true && status.status === 'connected';
		} catch {
			this.serverEnabled = false;
		} finally {
			this.checked = true;
		}
	}
}

export const nfcState = new NfcState();
