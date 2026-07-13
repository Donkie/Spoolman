import { base } from '$app/paths';

// Loads the Spoolman logo (static/spoolman.svg) once as an HTMLImageElement for
// drawing in the centre of QR codes. Cached so every canvas/print job reuses it.

let cached: Promise<HTMLImageElement> | null = null;

export function getLogoImage(): Promise<HTMLImageElement> {
	if (!cached) {
		cached = new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = `${base}/spoolman.svg`;
		});
	}
	return cached;
}
