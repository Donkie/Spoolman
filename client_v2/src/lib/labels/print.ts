import Konva from 'konva';
import type { LabelDesign, PrintLayout } from './types';
import type { LabelBinding } from './template';
import { elementToShape, qrLogoBox } from './render';
import { getLogoImage } from './logo';
import { paperSize, sheetGrid, pxPerMmForDpi } from './paper';

// Renders a design to high-DPI raster images and lays them out for printing.
// Rendering is done imperatively with raw Konva (sharing elementToShape with the
// declarative editor) so we can rasterize many spools without mounting Svelte
// components. Output is composed into an off-screen print container measured in
// millimeters, then handed to the browser's print dialog.

const PRINT_DPI = 300;

/** Rasterize one label (bound to a spool) to a PNG data URL at print DPI. */
export function renderLabelDataUrl(
	design: LabelDesign,
	binding: LabelBinding,
	baseUrl: string,
	logoImage: HTMLImageElement | null
): string {
	const pxPerMm = pxPerMmForDpi(PRINT_DPI);
	const width = design.label.w * pxPerMm;
	const height = design.label.h * pxPerMm;

	const container = document.createElement('div');
	container.style.cssText = 'position:absolute;left:-100000px;top:0;';
	document.body.appendChild(container);

	const stage = new Konva.Stage({ container, width, height });
	const layer = new Konva.Layer({ scaleX: pxPerMm, scaleY: pxPerMm });
	// White paper background so the QR always has quiet-zone contrast.
	layer.add(new Konva.Rect({ x: 0, y: 0, width: design.label.w, height: design.label.h, fill: '#ffffff' }));

	for (const el of design.elements) {
		const spec = elementToShape(el, { binding, baseUrl });
		if (spec.kind === 'qr') {
			const group = new Konva.Group({ x: spec.x, y: spec.y });
			group.add(new Konva.Rect({ x: 0, y: 0, width: spec.size, height: spec.size, fill: '#ffffff' }));
			group.add(new Konva.Path({ data: spec.pathData, fill: '#000000' }));
			if (spec.logo && logoImage) {
				const box = qrLogoBox(spec.size);
				group.add(
					new Konva.Rect({ x: box.padXY, y: box.padXY, width: box.pad, height: box.pad, fill: '#ffffff' })
				);
				group.add(
					new Konva.Image({
						image: logoImage,
						x: box.logoXY,
						y: box.logoXY,
						width: box.logo,
						height: box.logo
					})
				);
			}
			layer.add(group);
		} else if (spec.kind === 'text') {
			layer.add(new Konva.Text(spec.config));
		} else if (spec.kind === 'textclip') {
			const group = new Konva.Group({
				x: spec.x,
				y: spec.y,
				clipX: 0,
				clipY: 0,
				clipWidth: spec.width,
				clipHeight: spec.clipHeight
			});
			group.add(new Konva.Text(spec.config));
			layer.add(group);
		} else {
			layer.add(new Konva.Rect(spec.config));
		}
	}
	stage.add(layer);
	layer.draw();

	const url = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
	stage.destroy();
	container.remove();
	return url;
}

function waitForImages(root: HTMLElement): Promise<void> {
	const imgs = Array.from(root.querySelectorAll('img'));
	return Promise.all(
		imgs.map(
			(img) =>
				new Promise<void>((resolve) => {
					if (img.complete) resolve();
					else {
						img.onload = () => resolve();
						img.onerror = () => resolve();
					}
				})
		)
	).then(() => undefined);
}

interface PrintJob {
	design: LabelDesign;
	bindings: LabelBinding[];
	layout: PrintLayout;
	baseUrl: string;
}

/**
 * Render the selected spools' labels and open the print dialog. Sheet mode tiles
 * many labels per page (honoring margins/spacing/skip); label mode emits one
 * exact-size page per label.
 */
export async function printLabels({ design, bindings, layout, baseUrl }: PrintJob): Promise<void> {
	const logoImage = await getLogoImage().catch(() => null);
	// One raster per spool, reused across copies.
	const urls = bindings.map((b) => renderLabelDataUrl(design, b, baseUrl, logoImage));
	const items: (string | null)[] = [];
	for (const url of urls) for (let c = 0; c < Math.max(1, layout.copies); c++) items.push(url);

	const root = document.createElement('div');
	root.className = 'label-print-root';

	const style = document.createElement('style');
	if (layout.mode === 'label') {
		buildLabelPages(root, items, design);
		style.textContent = pageCss(`${design.label.w}mm ${design.label.h}mm`);
	} else {
		buildSheetPages(root, items, design, layout);
		const page = paperSize(layout);
		style.textContent = pageCss(`${page.w}mm ${page.h}mm`);
	}

	document.body.appendChild(style);
	document.body.appendChild(root);
	await waitForImages(root);

	const cleanup = () => {
		root.remove();
		style.remove();
		window.removeEventListener('afterprint', cleanup);
	};
	window.addEventListener('afterprint', cleanup);
	window.print();
	// Fallback cleanup for browsers that don't fire afterprint.
	setTimeout(cleanup, 60000);
}

/** Insets in mm to push a label's content in from each edge (for the safe-zone). */
interface Inset {
	t: number;
	r: number;
	b: number;
	l: number;
}

function labelImg(url: string, w: number, h: number, inset?: Inset): HTMLImageElement {
	const img = document.createElement('img');
	img.src = url;
	const t = inset?.t ?? 0;
	const r = inset?.r ?? 0;
	const b = inset?.b ?? 0;
	const l = inset?.l ?? 0;
	// Shrink and offset the raster to keep the whole label inside the printable
	// area of an edge cell; interior cells get no inset and render at full size.
	img.style.cssText = `width:${w - l - r}mm;height:${h - t - b}mm;margin:${t}mm ${r}mm ${b}mm ${l}mm;display:block;`;
	return img;
}

function buildLabelPages(root: HTMLElement, items: (string | null)[], design: LabelDesign) {
	for (const url of items) {
		if (!url) continue;
		const page = document.createElement('div');
		page.className = 'label-print-page';
		page.style.cssText = `width:${design.label.w}mm;height:${design.label.h}mm;overflow:hidden;`;
		page.appendChild(labelImg(url, design.label.w, design.label.h));
		root.appendChild(page);
	}
}

function buildSheetPages(
	root: HTMLElement,
	items: (string | null)[],
	design: LabelDesign,
	layout: PrintLayout
) {
	const grid = sheetGrid(layout, design.label);
	const page = paperSize(layout);
	const { w: lw, h: lh } = design.label;

	// The label size is fixed by the design, so we place those fixed-size labels on
	// a grid anchored at the top-left margin, with the user's column count and gaps.
	// Sticker sheets are die-cut at fixed positions, so we align to the margin rather
	// than centering. The safe-zone (`layout.safe`) never moves this grid — it only
	// pushes the content of the outer labels inward by however much it exceeds the
	// corresponding margin, so a printer that can't reach the paper edge won't clip
	// them (matches the v1 behavior).
	const overSafe = (safe: number, margin: number) => Math.max(0, safe - margin);
	const lastRow = grid.rows - 1;
	const lastCol = grid.cols - 1;

	// Prepend blank cells so labels start after the skipped positions.
	const cells: (string | null)[] = [...Array(Math.max(0, layout.skip)).fill(null), ...items];
	const pageCount = Math.max(1, Math.ceil(cells.length / grid.perPage));

	for (let p = 0; p < pageCount; p++) {
		const pageEl = document.createElement('div');
		pageEl.className = 'label-print-page';
		pageEl.style.cssText = `position:relative;width:${page.w}mm;height:${page.h}mm;overflow:hidden;`;

		for (let i = 0; i < grid.perPage; i++) {
			const url = cells[p * grid.perPage + i];
			if (!url) continue;
			const col = i % grid.cols;
			const row = Math.floor(i / grid.cols);
			const x = layout.margin.l + col * (lw + layout.spacing.h);
			const y = layout.margin.t + row * (lh + layout.spacing.v);
			const inset: Inset = {
				l: col === 0 ? overSafe(layout.safe.l, layout.margin.l) : 0,
				r: col === lastCol ? overSafe(layout.safe.r, layout.margin.r) : 0,
				t: row === 0 ? overSafe(layout.safe.t, layout.margin.t) : 0,
				b: row === lastRow ? overSafe(layout.safe.b, layout.margin.b) : 0
			};
			const cell = document.createElement('div');
			cell.style.cssText =
				`position:absolute;left:${x}mm;top:${y}mm;width:${lw}mm;height:${lh}mm;overflow:hidden;` +
				(layout.border === 'border' ? 'outline:0.2mm solid #bbb;' : '');
			cell.appendChild(labelImg(url, lw, lh, inset));
			pageEl.appendChild(cell);
		}
		root.appendChild(pageEl);
	}
}

function pageCss(size: string): string {
	return `
		@media screen { .label-print-root { display: none; } }
		@media print {
			@page { size: ${size}; margin: 0; }
			html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
			body > *:not(.label-print-root) { display: none !important; }
			.label-print-root { display: block !important; }
			.label-print-page { page-break-after: always; break-after: page; }
			.label-print-page:last-child { page-break-after: auto; break-after: auto; }
		}
	`;
}
