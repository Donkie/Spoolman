import { describe, expect, it } from "vitest";
import {
  MarkRect,
  SwatchInput,
  SwatchLayout,
  SwatchStyleSpec,
  buildSwatchLayout,
  formatDecimal,
  idWeightText,
  materialDiameterText,
  temperaturesText,
} from "./layout";
import { makeQrModules } from "./qr";

// A fixed spec so these tests are independent of the built-in style registry.
const TEST_SPEC: SwatchStyleSpec = {
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
};

const FULL_INPUT: SwatchInput = {
  id: 42,
  name: "Galaxy Black",
  vendorName: "Prusament",
  material: "PLA",
  diameterMm: 1.75,
  weightG: 1000,
  extruderTempC: 215,
  bedTempC: 60,
  colorHexes: ["e8e8e8"],
  qrPayload: "WEB+SPOOLMAN:F-42",
};

function containsPoint(rects: readonly MarkRect[], x: number, y: number): boolean {
  return rects.some((rect) => x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h);
}

/** Sample whether the marking covers the center of a QR grid cell (incl. quiet zone). */
function qrCellCovered(layout: SwatchLayout, gridRow: number, gridColumn: number): boolean {
  const size = layout.qr.moduleSizeMm;
  return containsPoint(layout.markRects, layout.qr.x + (gridColumn + 0.5) * size, layout.qr.y + (gridRow + 0.5) * size);
}

describe("text helpers", () => {
  it("formatDecimal trims trailing zeros", () => {
    expect(formatDecimal(1.75, 2)).toBe("1.75");
    expect(formatDecimal(3, 2)).toBe("3");
    expect(formatDecimal(2.849999, 2)).toBe("2.85");
  });

  it("composes the material line from the available parts", () => {
    expect(materialDiameterText(FULL_INPUT)).toBe("PLA 1.75mm");
    expect(materialDiameterText({ ...FULL_INPUT, material: undefined })).toBe("1.75mm");
    expect(materialDiameterText({ ...FULL_INPUT, material: undefined, diameterMm: undefined })).toBe("");
  });

  it("composes the temperature line with the degree sign", () => {
    expect(temperaturesText(FULL_INPUT)).toBe("E 215°C  B 60°C");
    expect(temperaturesText({ ...FULL_INPUT, bedTempC: undefined })).toBe("E 215°C");
    expect(temperaturesText({ ...FULL_INPUT, extruderTempC: undefined, bedTempC: undefined })).toBe("");
  });

  it("composes the id line with optional weight", () => {
    expect(idWeightText(FULL_INPUT)).toBe("#42  1000g");
    expect(idWeightText({ ...FULL_INPUT, weightG: undefined })).toBe("#42");
  });
});

describe("buildSwatchLayout", () => {
  it("is deterministic", () => {
    expect(buildSwatchLayout(FULL_INPUT, TEST_SPEC)).toEqual(buildSwatchLayout(FULL_INPUT, TEST_SPEC));
  });

  it("keeps every marking rect inside the margins", () => {
    const layout = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    for (const rect of layout.markRects) {
      expect(rect.x).toBeGreaterThanOrEqual(TEST_SPEC.marginMm - 1e-6);
      expect(rect.x + rect.w).toBeLessThanOrEqual(TEST_SPEC.widthMm - TEST_SPEC.marginMm + 1e-6);
      expect(rect.y).toBeGreaterThanOrEqual(TEST_SPEC.marginMm - 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(TEST_SPEC.heightMm - TEST_SPEC.marginMm + 1e-6);
    }
  });

  it("emits non-overlapping marking rects", () => {
    const { markRects } = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    const epsilon = 1e-9;
    for (let i = 0; i < markRects.length; i++) {
      for (let j = i + 1; j < markRects.length; j++) {
        const a = markRects[i];
        const b = markRects[j];
        const overlap =
          a.x + epsilon < b.x + b.w &&
          b.x + epsilon < a.x + a.w &&
          a.y + epsilon < b.y + b.h &&
          b.y + epsilon < a.y + a.h;
        expect(overlap, `rects ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it("renders the expected label lines for a fully populated filament", () => {
    const layout = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    expect(layout.textLines.map((line) => line.text)).toEqual([
      "Prusament",
      "Galaxy Black",
      "PLA 1.75mm",
      "E 215°C  B 60°C",
      "#42  1000g",
    ]);
    expect(layout.textLines.every((line) => !line.truncated)).toBe(true);
  });

  it("skips empty lines for sparse filaments", () => {
    const layout = buildSwatchLayout({ id: 3, colorHexes: [], qrPayload: "WEB+SPOOLMAN:F-3" }, TEST_SPEC);
    expect(layout.textLines.map((line) => line.text)).toEqual(["#3"]);
  });

  it("shrinks slightly-long lines and truncates extreme ones at the minimum scale", () => {
    const layout = buildSwatchLayout({ ...FULL_INPUT, name: "A Truly Unreasonably Long Filament Name" }, TEST_SPEC);
    const nameLine = layout.textLines[1];
    expect(nameLine.truncated).toBe(true);
    expect(nameLine.scale).toBe(TEST_SPEC.minPixelScaleMm);
    expect(nameLine.text.endsWith("..")).toBe(true);
    // and it still fits within the card
    for (const rect of layout.markRects) {
      expect(rect.x + rect.w).toBeLessThanOrEqual(TEST_SPEC.widthMm - TEST_SPEC.marginMm + 1e-6);
    }
  });

  it("normalizes the base colors and picks the marking color from them", () => {
    const light = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    expect(light.baseColorHexes).toEqual(["#e8e8e8"]);
    expect(light.markingColor).toBe("black");
    const dark = buildSwatchLayout({ ...FULL_INPUT, colorHexes: ["101010", "junk"] }, TEST_SPEC);
    expect(dark.baseColorHexes).toEqual(["#101010"]);
    expect(dark.markingColor).toBe("white");
  });

  it("raises exactly the dark QR modules on light filaments", () => {
    const layout = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    expect(layout.qr.inverted).toBe(false);
    const modules = makeQrModules(FULL_INPUT.qrPayload);
    const quiet = Math.round((layout.qr.sizeMm / layout.qr.moduleSizeMm - layout.qr.moduleCount) / 2);
    for (let row = 0; row < layout.qr.moduleCount; row++) {
      for (let column = 0; column < layout.qr.moduleCount; column++) {
        expect(qrCellCovered(layout, quiet + row, quiet + column)).toBe(modules[row][column]);
      }
    }
    // quiet zone stays flat
    expect(qrCellCovered(layout, 0, 0)).toBe(false);
  });

  it("raises the light modules and quiet zone on dark filaments (inverted polarity)", () => {
    const input = { ...FULL_INPUT, colorHexes: ["000000"] };
    const layout = buildSwatchLayout(input, TEST_SPEC);
    expect(layout.qr.inverted).toBe(true);
    const modules = makeQrModules(input.qrPayload);
    const quiet = Math.round((layout.qr.sizeMm / layout.qr.moduleSizeMm - layout.qr.moduleCount) / 2);
    for (let row = 0; row < layout.qr.moduleCount; row++) {
      for (let column = 0; column < layout.qr.moduleCount; column++) {
        expect(qrCellCovered(layout, quiet + row, quiet + column)).toBe(!modules[row][column]);
      }
    }
    // quiet zone is raised so the scanner sees a light border
    expect(qrCellCovered(layout, 0, 0)).toBe(true);
  });

  it("uses a larger QR version (smaller modules) for longer payloads", () => {
    const short = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    const long = buildSwatchLayout(
      { ...FULL_INPUT, qrPayload: "https://spoolman.example.com/base/path/filament/show/424242" },
      TEST_SPEC,
    );
    expect(short.qr.ecLevel).toBe("M");
    expect(long.qr.moduleCount).toBeGreaterThan(short.qr.moduleCount);
    expect(long.qr.moduleSizeMm).toBeLessThan(short.qr.moduleSizeMm);
  });

  it("drops to EC level L when level M modules would be too small to print", () => {
    // 135 bytes: level M needs a version whose modules undercut 0.4mm in a
    // 20mm QR area, while level L fits a smaller version that stays printable.
    const payload = `https://spoolman.example.com/${"a".repeat(90)}/filament/show/9`;
    const layout = buildSwatchLayout({ ...FULL_INPUT, qrPayload: payload }, TEST_SPEC);
    expect(layout.qr.ecLevel).toBe("L");
    expect(layout.qr.moduleSizeMm).toBeGreaterThanOrEqual(0.4);
  });
});
