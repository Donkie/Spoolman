import { describe, expect, it } from 'vitest';
import { nextCamera, startingCamera } from './cameraChoice';

// A phone can expose half a dozen cameras, and which one the browser picks for
// 'environment' is up to the browser: on some it's the telephoto, which only
// reads a label from across the room (#693). These decide which camera the
// scanner opens with and which one the switch button moves to next.

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

describe('nextCamera', () => {
	it('moves to the camera after the one in use', () => {
		expect(nextCamera(cameras, 'c5')).toBe(cameras[2]);
	});

	it('wraps from the last camera back to the first', () => {
		expect(nextCamera(cameras, 'c0')).toBe(cameras[0]);
	});

	it('starts at the first camera when the one in use is not listed', () => {
		expect(nextCamera(cameras, undefined)).toBe(cameras[0]);
		expect(nextCamera(cameras, 'unknown')).toBe(cameras[0]);
	});

	it('has nowhere to go with a single camera', () => {
		expect(nextCamera([cameras[0]], 'c1')).toBeNull();
		expect(nextCamera([], undefined)).toBeNull();
	});
});
