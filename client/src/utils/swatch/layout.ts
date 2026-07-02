// Pure 2D layout of a filament swatch card: label-style text lines on the left,
// QR code on the right. Coordinates are in mm with the origin at the top-left
// corner (SVG orientation); the mesh builder flips to 3D coordinates.
// The card dimensions and text contents are driven by a SwatchStyleSpec — see
// styles.ts for the built-in styles and how to contribute new ones.

import { MarkingColor, normalizeHexColor, pickMarkingColor } from "./color";
import {
  CHAR_ADVANCE,
  DEGREE_SIGN,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  glyphColumns,
  isGlyphPixelSet,
  textWidthPx,
} from "./font5x7";
import { QrEcLevel, makeQrModules } from "./qr";

const QR_QUIET_MODULES = 2;
/** Below this module size a 0.4mm nozzle cannot print the QR reliably. */
const MIN_QR_MODULE_MM = 0.4;
const TRUNCATION_SUFFIX = "..";

export interface SwatchInput {
  id: number;
  name?: string;
  vendorName?: string;
  material?: string;
  diameterMm?: number;
  weightG?: number;
  extruderTempC?: number;
  bedTempC?: number;
  articleNumber?: string;
  /** Filament color(s); multiple entries for multi-color filaments. */
  colorHexes: readonly (string | undefined)[];
  qrPayload: string;
}

/** One text line requested by a style: content plus preferred mm-per-glyph-pixel size. */
export interface SwatchLineSpec {
  text: string;
  scale: number;
}

/** The geometry and content recipe of a swatch style. */
export interface SwatchStyleSpec {
  widthMm: number;
  heightMm: number;
  baseThicknessMm: number;
  markingThicknessMm: number;
  cornerRadiusMm: number;
  marginMm: number;
  /** Side length of the square QR block, including its quiet zone. */
  qrAreaMm: number;
  /** Horizontal gap between the text block and the QR block. */
  textQrGapMm: number;
  lineGapMm: number;
  /** Smallest printable glyph-pixel size; below this, lines are truncated instead. */
  minPixelScaleMm: number;
  /** The text lines to emboss; empty-text lines are skipped. */
  composeLines(input: SwatchInput): SwatchLineSpec[];
}

/** An axis-aligned rectangle of raised marking, in mm from the top-left corner. */
export interface MarkRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SwatchTextLine {
  text: string;
  /** mm per glyph pixel after fitting. */
  scale: number;
  truncated: boolean;
}

export interface SwatchLayout {
  widthMm: number;
  heightMm: number;
  baseThicknessMm: number;
  markingThicknessMm: number;
  cornerRadiusMm: number;
  /** Normalized "#rrggbb" filament colors; empty if unknown. */
  baseColorHexes: string[];
  markingColor: MarkingColor;
  /** All raised marking geometry (text pixels and QR modules). */
  markRects: MarkRect[];
  textLines: SwatchTextLine[];
  qr: {
    x: number;
    y: number;
    sizeMm: number;
    moduleCount: number;
    moduleSizeMm: number;
    ecLevel: QrEcLevel;
    /**
     * True when the light modules are raised instead of the dark ones (white
     * marking on a dark filament), keeping the scanned polarity dark-on-light.
     */
    inverted: boolean;
  };
}

/** Format a number with up to maxDecimals decimals, trailing zeros trimmed. */
export function formatDecimal(value: number, maxDecimals: number): string {
  return parseFloat(value.toFixed(maxDecimals)).toString();
}

/** "PLA 1.75mm" — material and diameter, either part optional. */
export function materialDiameterText(input: SwatchInput): string {
  const parts: string[] = [];
  if (input.material) parts.push(input.material);
  if (input.diameterMm) parts.push(`${formatDecimal(input.diameterMm, 2)}mm`);
  return parts.join(" ");
}

/** "E 215°C  B 60°C" — extruder and bed temperatures, either part optional. */
export function temperaturesText(input: SwatchInput): string {
  const parts: string[] = [];
  if (input.extruderTempC) parts.push(`E ${Math.round(input.extruderTempC)}${DEGREE_SIGN}C`);
  if (input.bedTempC) parts.push(`B ${Math.round(input.bedTempC)}${DEGREE_SIGN}C`);
  return parts.join("  ");
}

/** "#42  1000g" — Spoolman filament id and net weight (weight optional). */
export function idWeightText(input: SwatchInput): string {
  const parts: string[] = [`#${input.id}`];
  if (input.weightG) parts.push(`${formatDecimal(Math.round(input.weightG), 0)}g`);
  return parts.join("  ");
}

/** Append rectangles for the true-runs of a row of equally sized cells. */
function appendRunRects(
  rects: MarkRect[],
  cells: readonly boolean[],
  xOriginMm: number,
  yMm: number,
  cellSizeMm: number,
): void {
  let runStart = -1;
  for (let i = 0; i <= cells.length; i++) {
    const set = i < cells.length && cells[i];
    if (set && runStart < 0) {
      runStart = i;
    } else if (!set && runStart >= 0) {
      rects.push({
        x: xOriginMm + runStart * cellSizeMm,
        y: yMm,
        w: (i - runStart) * cellSizeMm,
        h: cellSizeMm,
      });
      runStart = -1;
    }
  }
}

/** Shrink a line to fit maxWidthMm; below minScale, truncate it instead. */
function fitLine(text: string, preferredScale: number, maxWidthMm: number, minScale: number): SwatchTextLine {
  const naturalWidthPx = textWidthPx(text);
  let scale = preferredScale;
  if (naturalWidthPx * scale > maxWidthMm) {
    scale = maxWidthMm / naturalWidthPx;
  }
  if (scale >= minScale) {
    return { text, scale, truncated: false };
  }
  const chars = [...text];
  while (chars.length > 0 && textWidthPx(chars.join("") + TRUNCATION_SUFFIX) * minScale > maxWidthMm) {
    chars.pop();
  }
  return { text: chars.join("") + TRUNCATION_SUFFIX, scale: minScale, truncated: true };
}

/**
 * Encode the QR payload at error-correction level M, but fall back to level L
 * when that would make the modules too small to print: for physical scanning,
 * larger modules help more than extra error-correction bits.
 */
function chooseQrModules(payload: string, qrAreaMm: number): { modules: boolean[][]; ecLevel: QrEcLevel } {
  const preferred = makeQrModules(payload, "M");
  if (qrAreaMm / (preferred.length + 2 * QR_QUIET_MODULES) >= MIN_QR_MODULE_MM) {
    return { modules: preferred, ecLevel: "M" };
  }
  const fallback = makeQrModules(payload, "L");
  if (fallback.length < preferred.length) {
    return { modules: fallback, ecLevel: "L" };
  }
  return { modules: preferred, ecLevel: "M" };
}

function appendTextRects(rects: MarkRect[], line: SwatchTextLine, xMm: number, yMm: number): void {
  const chars = [...line.text];
  const widthPx = textWidthPx(line.text);
  const columnsPerChar = chars.map((char) => glyphColumns(char));
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    const rowBits: boolean[] = new Array(widthPx).fill(false);
    columnsPerChar.forEach((columns, charIndex) => {
      for (let column = 0; column < GLYPH_WIDTH; column++) {
        if (isGlyphPixelSet(columns, column, row)) {
          rowBits[charIndex * CHAR_ADVANCE + column] = true;
        }
      }
    });
    appendRunRects(rects, rowBits, xMm, yMm + row * line.scale, line.scale);
  }
}

export function buildSwatchLayout(input: SwatchInput, spec: SwatchStyleSpec): SwatchLayout {
  const markingColor = pickMarkingColor(input.colorHexes);
  const baseColorHexes = input.colorHexes
    .map((hex) => normalizeHexColor(hex))
    .filter((hex): hex is string => hex !== null);
  const markRects: MarkRect[] = [];

  // QR block, vertically centered on the right.
  const qrX = spec.widthMm - spec.marginMm - spec.qrAreaMm;
  const qrY = (spec.heightMm - spec.qrAreaMm) / 2;
  const { modules, ecLevel } = chooseQrModules(input.qrPayload, spec.qrAreaMm);
  const moduleCount = modules.length;
  const gridCount = moduleCount + 2 * QR_QUIET_MODULES;
  const moduleSizeMm = spec.qrAreaMm / gridCount;
  // With a white marking on a dark filament, raise the light modules and the
  // quiet zone instead of the dark modules, so a scanner still sees dark
  // modules on a light background.
  const inverted = markingColor === "white";
  for (let row = 0; row < gridCount; row++) {
    const cells: boolean[] = [];
    for (let column = 0; column < gridCount; column++) {
      const coreRow = row - QR_QUIET_MODULES;
      const coreColumn = column - QR_QUIET_MODULES;
      const inCore = coreRow >= 0 && coreRow < moduleCount && coreColumn >= 0 && coreColumn < moduleCount;
      const dark = inCore && modules[coreRow][coreColumn];
      cells.push(inverted ? !dark : dark);
    }
    appendRunRects(markRects, cells, qrX, qrY + row * moduleSizeMm, moduleSizeMm);
  }

  // Text block on the left, vertically centered.
  const textMaxWidthMm = qrX - spec.textQrGapMm - spec.marginMm;
  const textLines = spec
    .composeLines(input)
    .filter((line) => line.text !== "")
    .map((line) => fitLine(line.text, line.scale, textMaxWidthMm, spec.minPixelScaleMm));
  const totalTextHeightMm =
    textLines.reduce((sum, line) => sum + GLYPH_HEIGHT * line.scale, 0) +
    Math.max(0, textLines.length - 1) * spec.lineGapMm;
  const textAreaHeightMm = spec.heightMm - 2 * spec.marginMm;
  let y = spec.marginMm + Math.max(0, (textAreaHeightMm - totalTextHeightMm) / 2);
  for (const line of textLines) {
    appendTextRects(markRects, line, spec.marginMm, y);
    y += GLYPH_HEIGHT * line.scale + spec.lineGapMm;
  }

  return {
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    baseThicknessMm: spec.baseThicknessMm,
    markingThicknessMm: spec.markingThicknessMm,
    cornerRadiusMm: spec.cornerRadiusMm,
    baseColorHexes,
    markingColor,
    markRects,
    textLines,
    qr: { x: qrX, y: qrY, sizeMm: spec.qrAreaMm, moduleCount, moduleSizeMm, ecLevel, inverted },
  };
}
