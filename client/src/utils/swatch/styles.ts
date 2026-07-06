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
// Sizing tips: QR modules snap down to multiples of the 0.4 mm nozzle width,
// so pick qrAreaMm as (modules + 4 quiet) x a 0.4 multiple for the payloads
// you care about — 20 fits a version-1 code (21 + 4 modules) at exactly
// 0.8 mm, 26.4 additionally fits version 3 (typical URL payloads) at 0.8 mm.
// Keep line scales ≥ minPixelScaleMm for legible text.
// A style may punch a keychain hole through the card via `hole` — place it on
// the left side (the text block starts right of its rim) and keep its collar
// square (1.6x the radius) inside the card outline — or grow a hanger tab on
// the top edge via `hangerTab` (not both); the contract tests verify the
// marking keeps clear of either hole.

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

/** The classic card with a keychain hole on the left, for sample rings. */
const keychain: SwatchStyle = {
  key: "keychain",
  name: "Keychain",
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
    // 4.8mm hole: fits standard split rings and ball chains, with a 3.6mm rim
    // to the card edge.
    hole: { cx: 6, cy: 17, r: 2.4 },
    composeLines: (input: SwatchInput) => [
      { text: input.vendorName ?? "", scale: 0.5 },
      { text: input.name ?? "", scale: 0.65 },
      { text: materialDiameterText(input), scale: 0.5 },
      { text: temperaturesText(input), scale: 0.5 },
      { text: idWeightText(input), scale: 0.45 },
    ],
  },
};

/** The classic card with an upside-down-U tab on top, to hang it on a nail. */
const hanger: SwatchStyle = {
  key: "hanger",
  name: "Hanger",
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
    // 5mm nail hole centered on the top edge, under a 3mm-thick arch.
    hangerTab: { cx: 37.5, outerR: 5.5, holeR: 2.5 },
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
    // Exactly a version-1 QR grid (21 modules + 4 quiet) at 0.8mm; anything
    // smaller would snap the modules down to 0.4mm.
    qrAreaMm: 20,
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
    // A version-3 QR grid (29 + 4 quiet modules) at 0.8mm, so typical URL
    // payloads (up to ~53 bytes) keep 0.8mm modules on this style.
    qrAreaMm: 26.4,
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

export const SWATCH_STYLES: readonly SwatchStyle[] = [classic, keychain, hanger, compact, card];

export const DEFAULT_SWATCH_STYLE_KEY = classic.key;

/** Resolve a style by key, falling back to the default style for unknown/unset keys. */
export function getSwatchStyle(key: string | null | undefined): SwatchStyle {
  return SWATCH_STYLES.find((style) => style.key === key) ?? classic;
}

/** Build the swatch layout for a filament using the style registered under `styleKey`. */
export function buildSwatchLayoutForStyle(input: SwatchInput, styleKey?: string | null): SwatchLayout {
  return buildSwatchLayout(input, getSwatchStyle(styleKey).spec);
}
