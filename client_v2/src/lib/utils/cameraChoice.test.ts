import { describe, expect, it } from 'vitest';
import { startingCamera, videoCameras } from './cameraChoice';

// A phone can expose half a dozen cameras, and which one the browser picks for
// 'environment' is up to the browser: on some it's the telephoto, which only
// reads a label from across the room (#693). These decide which camera the
// scanner opens with and what the camera picker offers.

// The order Chrome enumerates them on an Oppo X9 Ultra.
const cameras = [
	{ id: 'c1', label: 'camera 1, facing front' },
	{ id: 'c5', label: 'camera 5, facing back' },
	{ id: 'c4', label: 'camera 4, facing back' },
	{ id: 'c3', label: 'camera 3, facing back' },
	{ id: 'c2', label: 'camera 2, facing back' },
	{ id: 'c0', label: 'camera 0, facing back' }
];
const ids = cameras.map((c) => c.id);

describe('startingCamera', () => {
	it('opens the camera the user picked last time', () => {
		expect(startingCamera('c0', ids)).toBe('c0');
	});

	it('asks for the rear camera when nothing was picked yet', () => {
		expect(startingCamera(null, ids)).toBe('environment');
	});

	it('asks for the rear camera when the picked one is gone', () => {
		// qr-scanner retries a missing deviceId with no constraint at all, which
		// can land on the front camera. The rear one is the better fallback.
		expect(startingCamera('unplugged-webcam', ids)).toBe('environment');
	});

	it('asks for the rear camera before the browser reveals device ids', () => {
		// Without camera permission enumerateDevices lists every camera with an
		// empty id, and an empty saved id must not match one of those.
		expect(startingCamera('', ['', ''])).toBe('environment');
	});
});

describe('videoCameras', () => {
	const device = (kind: MediaDeviceKind, deviceId: string, label = '') => ({ kind, deviceId, label });

	it('lists the video inputs in the order the browser gives them', () => {
		expect(
			videoCameras([
				device('audioinput', 'mic', 'Microphone'),
				device('videoinput', 'c1', 'camera 1, facing front'),
				device('videoinput', 'c5', 'camera 5, facing back'),
				device('audiooutput', 'spk', 'Speaker')
			])
		).toEqual([
			{ id: 'c1', label: 'camera 1, facing front' },
			{ id: 'c5', label: 'camera 5, facing back' }
		]);
	});

	it('keeps an empty label empty so the picker can number it', () => {
		// qr-scanner's listCameras() fills these in with an untranslated
		// "Default Camera" / "Camera N", which the picker couldn't tell apart
		// from a real device name.
		expect(videoCameras([device('videoinput', 'c1')])).toEqual([{ id: 'c1', label: '' }]);
	});
});
