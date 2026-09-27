// Which camera the QR scanner opens with, remembered per browser.
//
// Asking for the 'environment' camera lets the browser choose among every rear
// camera, and on a phone with several lenses that can be the telephoto: the
// scanner then only reads a label from across the room (#693). A desktop has
// the same problem with a virtual webcam listed first. The scanner offers a
// picker of every camera, and the one the user chooses is what it opens with
// next time.

const KEY = 'spoolman-v2-scanner-camera';

export interface Camera {
	id: string;
	label: string;
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
 * The cameras among the browser's media devices, in its order. An empty label
 * stays empty for the caller to number: qr-scanner's listCameras() would fill in
 * an untranslated "Default Camera" / "Camera N" that can't be told apart from a
 * real device name.
 */
export function videoCameras(
	devices: readonly Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[]
): Camera[] {
	return devices.filter((d) => d.kind === 'videoinput').map((d) => ({ id: d.deviceId, label: d.label }));
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
