// Which camera the QR scanner opens with, remembered per browser.
//
// Asking for the 'environment' camera lets the browser choose among every rear
// camera, and on a phone with several lenses that can be the telephoto: the
// scanner then only reads a label from across the room (#693). A desktop has
// the same problem with a virtual webcam listed first. The scanner offers a
// button that steps through the cameras, and the one the user settles on is
// what it opens with next time.

const KEY = 'spoolman-v2-scanner-camera';

interface Camera {
	id: string;
}

/**
 * What to hand qr-scanner as `preferredCamera`: the remembered camera if the
 * browser still lists it, otherwise the rear camera. Checked up front because a
 * deviceId qr-scanner can't open makes it fall back to any camera at all, which
 * can be the front one.
 */
export function startingCamera(saved: string | null, deviceIds: readonly string[]): string {
	return saved && deviceIds.includes(saved) ? saved : 'environment';
}

/**
 * The camera after the one in use, wrapping at the end of the list. Null when
 * there is no other camera to go to.
 */
export function nextCamera<T extends Camera>(cameras: readonly T[], currentId: string | undefined): T | null {
	if (cameras.length < 2) return null;
	return cameras[(cameras.findIndex((c) => c.id === currentId) + 1) % cameras.length];
}

/** The camera the user last switched to in this browser, if any. */
export function rememberedCamera(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(KEY);
	} catch {
		// Storage disabled (private mode, blocked third-party context).
		return null;
	}
}

export function rememberCamera(id: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, id);
	} catch {
		/* nothing to do — remembering the camera is a convenience, not a requirement */
	}
}
