import type { LabelElement, LabelKind } from './types';
import { resolveTemplate, type LabelBinding } from './template';
import { qrContent, qrPathData, qrTemplate } from './qr';

// Turns a design element into a Konva shape spec (in mm units — the Konva layer
// is scaled by px-per-mm). Text/swatch/rect map to a single node; QR maps to a
// small group (white background + module path + optional centre logo). The
// declarative editor and the imperative print export share these specs so their
// geometry stays identical.

export interface RenderContext {
	/** Bound spool/filament data; when absent the design renders in "template" preview. */
	binding?: LabelBinding;
	baseUrl: string;
	/** Whether the design labels spools or filaments. Defaults to `spool`. */
	kind?: LabelKind;
}

export type ShapeSpec =
	| { kind: 'rect'; config: Record<string, unknown> }
	| { kind: 'text'; config: Record<string, unknown> }
	| {
			kind: 'textclip';
			x: number;
			y: number;
			width: number;
			clipHeight: number;
			config: Record<string, unknown>;
	  }
	| { kind: 'qr'; x: number; y: number; size: number; pathData: string; logo: boolean };

const PLACEHOLDER_SWATCH = '#9aa0a6';

// Ring thickness (mm) for the swatch's definition border. The printed/canvas
// swatch is intentionally flat (no gloss) — the glossy sheen lives only in the
// on-screen Swatch.svelte chip — but the ring keeps light colours legible
// against a white label.
const SWATCH_RING = 0.12;

/** Builds the flat colour rect config (fill + definition ring) for a swatch. */
function swatchConfig(x: number, y: number, width: number, height: number, radius: number, colors: string[]) {
	const config: Record<string, unknown> = {
		x,
		y,
		width,
		height,
		cornerRadius: radius,
		stroke: 'rgba(0,0,0,0.35)',
		strokeWidth: SWATCH_RING
	};
	if (colors.length === 0) {
		config.fill = PLACEHOLDER_SWATCH;
	} else if (colors.length === 1) {
		config.fill = colors[0];
	} else {
		// Even gradient stops across the width for multi-color filaments.
		const stops: (number | string)[] = [];
		colors.forEach((hex, i) => {
			stops.push(colors.length === 1 ? 0 : i / (colors.length - 1), hex);
		});
		config.fillLinearGradientStartPoint = { x: 0, y: 0 };
		config.fillLinearGradientEndPoint = { x: width, y: 0 };
		config.fillLinearGradientColorStops = stops;
	}
	return config;
}

/** Geometry (in mm, relative to the QR's top-left) for a centred logo. */
export function qrLogoBox(size: number) {
	// Square (not rounded) so the white backing fully covers the QR modules
	// behind it right into the corners — a rounded corner would carve away
	// white area there and let the black modules peek through.
	const pad = size * 0.285;
	const logo = size * 0.25;
	return {
		pad,
		padXY: (size - pad) / 2,
		logo,
		logoXY: (size - logo) / 2
	};
}

export function elementToShape(el: LabelElement, ctx: RenderContext): ShapeSpec {
	switch (el.type) {
		case 'qr': {
			const qrCtx = { baseUrl: ctx.baseUrl, kind: ctx.kind };
			// The QR's subject is the spool (spool labels) or filament (filament labels).
			const subjectId = ctx.kind === 'filament' ? ctx.binding?.filament?.id : ctx.binding?.spool?.id;
			// With no bound subject (editor canvas), preview the template with id 0 so
			// the QR's module density matches what will actually print for this
			// encoding — a long URL/custom target is denser than the compact scheme.
			const content =
				subjectId !== undefined
					? qrContent(el, subjectId, qrCtx)
					: qrTemplate(el, qrCtx).replace('{id}', '0');
			return {
				kind: 'qr',
				x: el.x,
				y: el.y,
				size: el.size,
				pathData: qrPathData(content, el.ec, el.size),
				logo: el.logo
			};
		}
		case 'text': {
			const text = ctx.binding
				? resolveTemplate(el.template, ctx.binding)
				: el.template.replace(/\*\*(.*?)\*\*/gs, '$1');
			const common = {
				text,
				fontSize: el.fontSize,
				fontStyle: el.bold ? 'bold' : 'normal',
				fontFamily: 'sans-serif',
				align: el.align,
				fill: el.color,
				lineHeight: 1.15
			};
			// Default (undefined) wraps, for backward compatibility with older designs.
			if (el.wrap !== false) {
				return { kind: 'text', config: { x: el.x, y: el.y, width: el.w, wrap: 'word', ...common } };
			}
			// No wrap: keep each line on one line and clip horizontal overflow to `w`.
			const lines = Math.max(1, text.split('\n').length);
			const clipHeight = el.fontSize * 1.15 * lines + el.fontSize * 0.3;
			// Pin the text height so the transformer box matches the clip (Konva
			// otherwise reports the wrapped height even with wrap disabled).
			return {
				kind: 'textclip',
				x: el.x,
				y: el.y,
				width: el.w,
				clipHeight,
				config: { x: 0, y: 0, width: el.w, height: clipHeight, wrap: 'none', ...common }
			};
		}
		case 'swatch': {
			const colors = ctx.binding?.filament?.colors ?? [];
			return { kind: 'rect', config: swatchConfig(el.x, el.y, el.w, el.h, el.radius, colors) };
		}
		case 'rect': {
			return {
				kind: 'rect',
				config: {
					x: el.x,
					y: el.y,
					width: el.w,
					height: el.h,
					cornerRadius: el.radius,
					fill: el.fill || undefined,
					stroke: el.stroke || undefined,
					strokeWidth: el.strokeWidth
				}
			};
		}
	}
}
