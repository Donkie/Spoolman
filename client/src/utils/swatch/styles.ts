// The swatch style registry.
//
// A style decides the card dimensions and which label fields are embossed on
// it; the shared layout engine (layout.ts) handles text fitting, the QR block,
// contrast and mesh-friendly geometry.
//
// Contributing a new style:
//  1. Define a SwatchStyle below with a unique, stable `key` (it is stored in
//     the user's settings) and add it to SWATCH_STYLES.
//  2. Optionally add a translation under `filament.swatch.styles.<key>` in
//     public/locales/en/common.json; `name` is the fallback shown otherwise.
//  3. Run the tests: styles.test.ts validates every registered style
//     automatically (geometry stays inside the card, meshes are watertight,
//     the 3MF builds) against light/dark/multi-color/minimal filaments.
//
// Sizing tips: keep qrAreaMm ≥ 15 so the QR modules stay ≥ ~0.4 mm for a
// 0.4 mm nozzle, and keep line scales ≥ minPixelScaleMm for legible text.

import {
  SwatchInput,
  SwatchLayout,
  SwatchStyleSpec,
  buildSwatchLayout,
  idWeightText,
  materialDiameterText,
  temperaturesText,
} from "./layout";

export interface SwatchStyle {
  /** Stable identifier, persisted in the `swatch_style` setting. */
  key: string;
  /** English display name; translated via `filament.swatch.styles.<key>` when available. */
  name: string;
  spec: SwatchStyleSpec;
}

/** The original Spoolman swatch: label info on the left, QR on the right. */
const classic: SwatchStyle = {
  key: "classic",
  name: "Classic",
  spec: {
    widthMm: 75,
    heightMm: 34,
    baseThicknessMm: 2.4,
    markingThicknessMm: 0.2,
    cornerRadiusMm: 3,
    marginMm: 3,
    qrAreaMm: 20,
    textQrGapMm: 2.5,
    lineGapMm: 1.2,
    minPixelScaleMm: 0.4,
    composeLines: (input: SwatchInput) => [
      { text: input.vendorName ?? "", scale: 0.5 },
      { text: input.name ?? "", scale: 0.65 },
      { text: materialDiameterText(input), scale: 0.5 },
      { text: temperaturesText(input), scale: 0.5 },
      { text: idWeightText(input), scale: 0.45 },
    ],
  },
};

/** A small tag for sample boxes: just the essentials next to the QR code. */
const compact: SwatchStyle = {
  key: "compact",
  name: "Compact",
  spec: {
    widthMm: 55,
    heightMm: 25,
    baseThicknessMm: 2,
    markingThicknessMm: 0.2,
    cornerRadiusMm: 2.5,
    marginMm: 2.5,
    qrAreaMm: 16.5,
    textQrGapMm: 2,
    lineGapMm: 1,
    minPixelScaleMm: 0.4,
    composeLines: (input: SwatchInput) => [
      { text: input.name ?? input.vendorName ?? "", scale: 0.5 },
      { text: materialDiameterText(input), scale: 0.45 },
      { text: idWeightText(input), scale: 0.4 },
    ],
  },
};

/** Credit-card sized swatch with the full label contents and a large QR code. */
const card: SwatchStyle = {
  key: "card",
  name: "Card",
  spec: {
    widthMm: 85.6,
    heightMm: 54,
    baseThicknessMm: 2.4,
    markingThicknessMm: 0.2,
    cornerRadiusMm: 3.5,
    marginMm: 4,
    qrAreaMm: 26,
    textQrGapMm: 3,
    lineGapMm: 2,
    minPixelScaleMm: 0.4,
    composeLines: (input: SwatchInput) => [
      { text: input.vendorName ?? "", scale: 0.6 },
      { text: input.name ?? "", scale: 0.8 },
      { text: materialDiameterText(input), scale: 0.6 },
      { text: input.articleNumber ?? "", scale: 0.5 },
      { text: temperaturesText(input), scale: 0.6 },
      { text: idWeightText(input), scale: 0.5 },
    ],
  },
};

export const SWATCH_STYLES: readonly SwatchStyle[] = [classic, compact, card];

export const DEFAULT_SWATCH_STYLE_KEY = classic.key;

/** Resolve a style by key, falling back to the default style for unknown/unset keys. */
export function getSwatchStyle(key: string | null | undefined): SwatchStyle {
  return SWATCH_STYLES.find((style) => style.key === key) ?? classic;
}

/** Build the swatch layout for a filament using the style registered under `styleKey`. */
export function buildSwatchLayoutForStyle(input: SwatchInput, styleKey?: string | null): SwatchLayout {
  return buildSwatchLayout(input, getSwatchStyle(styleKey).spec);
}
