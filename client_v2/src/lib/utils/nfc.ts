// Reading a tag with the phone you are holding, via Web NFC.
//
// This is progressive enhancement, not a code path with a fallback: Web NFC
// exists only in Chrome on Android, and only in a secure context, so it is absent
// on desktop, on iOS, in Firefox, and on every plain-HTTP install — which is most
// of them, since Spoolman is typically reached at http://192.168.x.x. Callers
// check `nfcSupported()` and omit the control entirely when it is false. A
// disabled button the user can never explain is worse than no button.
//
// Phase 1 wants nothing but the UID, and a tag's serial number is readable
// without decoding any of its contents — so there is no NDEF record parsing here
// at all, and a blank sticker works exactly as well as a written one.
//
// The Web NFC types are declared locally rather than pulled in as a dependency:
// this module is their only consumer, and keeping the surface small is the point
// of having it. Errors come back as reason codes, leaving the wording to the
// components, the way the QR scanner does.

interface NDEFReadingEventLike extends Event {
	serialNumber: string;
}

interface NDEFReaderLike {
	scan(options?: { signal?: AbortSignal }): Promise<void>;
	addEventListener(type: 'reading', listener: (ev: NDEFReadingEventLike) => void): void;
	addEventListener(type: 'readingerror', listener: (ev: Event) => void): void;
}

type NDEFReaderCtor = new () => NDEFReaderLike;

/** Why reading a tag failed, in terms a message can be written for. */
export type NfcErrorReason =
	/** No Web NFC in this browser at all. */
	| 'unsupported'
	/** Web NFC exists but the page is not a secure context (plain HTTP). */
	| 'insecureContext'
	/** The user declined the permission prompt, or it is blocked for this site. */
	| 'notAllowed'
	/** NFC hardware is missing or switched off in system settings. */
	| 'notSupported'
	/** The radio is there but unreadable — usually another app holds it. */
	| 'notReadable'
	| 'unknown';

export class NfcError extends Error {
	constructor(readonly reason: NfcErrorReason) {
		super(`NFC read failed: ${reason}`);
		this.name = 'NfcError';
	}
}

/**
 * Whether this browser can read tags at all. False on desktop, iOS, Firefox and
 * any plain-HTTP origin. Call it before rendering any NFC affordance.
 */
export function nfcSupported(): boolean {
	if (typeof window === 'undefined') return false;
	return 'NDEFReader' in window && window.isSecureContext;
}

/**
 * Turn a browser exception into a reason. Web NFC reports through DOMException
 * names, the same vocabulary getUserMedia uses, so this mirrors the mapping in
 * QrScannerModal — an opaque failure the user cannot act on is the thing worth
 * avoiding here.
 */
function reasonFor(err: unknown): NfcErrorReason {
	const name = (err as { name?: string } | null)?.name ?? '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'notAllowed';
	if (name === 'NotSupportedError') return 'notSupported';
	if (name === 'NotReadableError') return 'notReadable';
	return 'unknown';
}

/**
 * Wait for one tag to be tapped and resolve with its UID.
 *
 * The UID arrives in whatever spelling the platform uses (Chrome's is
 * colon-separated lowercase) and is passed on untouched — normalization belongs
 * to the server, which does it for every reader rather than for this one.
 *
 * Scanning continues until a tag is read or `signal` aborts, so callers must
 * always pass one and abort it when their dialog closes; otherwise the radio
 * keeps running behind a screen nobody is looking at.
 *
 * Rejects with an `NfcError` carrying a reason, or with the abort's own reason
 * when cancelled — check `signal.aborted` before reporting anything.
 */
export function readTagUid(signal: AbortSignal): Promise<string> {
	if (typeof window === 'undefined' || !('NDEFReader' in window)) {
		return Promise.reject(new NfcError('unsupported'));
	}
	if (!window.isSecureContext) return Promise.reject(new NfcError('insecureContext'));

	const Ctor = (window as unknown as { NDEFReader: NDEFReaderCtor }).NDEFReader;
	return new Promise<string>((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		let reader: NDEFReaderLike;
		try {
			reader = new Ctor();
		} catch (err) {
			reject(new NfcError(reasonFor(err)));
			return;
		}

		signal.addEventListener('abort', () => reject(signal.reason), { once: true });
		reader.addEventListener('reading', (ev) => resolve(ev.serialNumber));
		// A tag that came and went before it could be read. Not fatal and not worth
		// reporting: the user's next tap is the retry, and the scan is still live.
		reader.addEventListener('readingerror', () => {});

		// scan() is what raises the permission prompt, so its rejection is the one
		// that carries a reason worth showing.
		reader.scan({ signal }).catch((err) => {
			if (signal.aborted) return; // our own cancellation, already rejected above
			reject(new NfcError(reasonFor(err)));
		});
	});
}
