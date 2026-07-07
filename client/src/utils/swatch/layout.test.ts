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
    // Collect violations and assert once: an expect() per rect pair adds O(n²)
    // assertion overhead, enough to blow the 5s timeout on a loaded parallel run.
    const overlaps: string[] = [];
    for (let i = 0; i < markRects.length; i++) {
      for (let j = i + 1; j < markRects.length; j++) {
        const a = markRects[i];
        const b = markRects[j];
        const overlap =
          a.x + epsilon < b.x + b.w &&
          b.x + epsilon < a.x + a.w &&
          a.y + epsilon < b.y + b.h &&
          b.y + epsilon < a.y + a.h;
        if (overlap) {
          overlaps.push(`rects ${i} and ${j} overlap`);
        }
      }
    }
    expect(overlaps).toEqual([]);
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

  it("snaps QR modules to a whole multiple of the 0.4mm nozzle width", () => {
    const layout = buildSwatchLayout(FULL_INPUT, TEST_SPEC);
    // WEB+SPOOLMAN:F-42 is alphanumeric, so it fits a version-1 code:
    // 21 modules + 2x2 quiet in a 20mm area snap to exactly 0.8mm.
    expect(layout.qr.moduleCount).toBe(21);
    expect(layout.qr.moduleSizeMm).toBeCloseTo(0.8, 9);
    expect(layout.qr.sizeMm).toBeCloseTo(20, 9);
  });

  it("centers a snapped-down QR grid within the reserved area", () => {
    // Byte-mode payload at version 3: 29 modules + 4 quiet snap from ~0.61mm
    // down to 0.4mm, leaving a 13.2mm grid centered in the 20mm area.
    const layout = buildSwatchLayout(
      { ...FULL_INPUT, qrPayload: "https://spool.example.com/filament/show/42" },
      TEST_SPEC,
    );
    expect(layout.qr.moduleCount).toBe(29);
    expect(layout.qr.moduleSizeMm).toBeCloseTo(0.4, 9);
    expect(layout.qr.sizeMm).toBeCloseTo(13.2, 9);
    const areaLeftMm = TEST_SPEC.widthMm - TEST_SPEC.marginMm - TEST_SPEC.qrAreaMm;
    expect(layout.qr.x).toBeCloseTo(areaLeftMm + (TEST_SPEC.qrAreaMm - layout.qr.sizeMm) / 2, 9);
    expect(layout.qr.y).toBeCloseTo((TEST_SPEC.heightMm - layout.qr.sizeMm) / 2, 9);
  });

  it("does not floor away a whole nozzle width when the area is an exact grid multiple", () => {
    // 26.4mm / 33 grid cells is exactly 0.8mm, but floats make it
    // 0.7999999999999999 — the snap must not floor that down to 0.4mm.
    const layout = buildSwatchLayout(
      { ...FULL_INPUT, qrPayload: "https://spool.example.com/filament/show/42" },
      { ...TEST_SPEC, qrAreaMm: 26.4 },
    );
    expect(layout.qr.moduleCount).toBe(29);
    expect(layout.qr.moduleSizeMm).toBeCloseTo(0.8, 9);
  });

  it("prefers the error-correction level whose snapped modules print larger", () => {
    // 21 alphanumeric chars: version 2 at level M but version 1 at level L.
    // Version 1 snaps to 0.8mm modules, version 2 only to 0.4mm, so L wins.
    const layout = buildSwatchLayout({ ...FULL_INPUT, qrPayload: "WEB+SPOOLMAN:F-999999" }, TEST_SPEC);
    expect(layout.qr.ecLevel).toBe("L");
    expect(layout.qr.moduleCount).toBe(21);
    expect(layout.qr.moduleSizeMm).toBeCloseTo(0.8, 9);
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

describe("keychain hole support", () => {
  const HOLE = { cx: 6, cy: 17, r: 2.4 };
  const HOLE_SPEC: SwatchStyleSpec = { ...TEST_SPEC, hole: HOLE };

  it("passes the hole through to the layout", () => {
    expect(buildSwatchLayout(FULL_INPUT, HOLE_SPEC).hole).toEqual(HOLE);
    expect(buildSwatchLayout(FULL_INPUT, TEST_SPEC).hole).toBeUndefined();
  });

  it("starts the text block right of the hole rim", () => {
    const layout = buildSwatchLayout(FULL_INPUT, HOLE_SPEC);
    const textRects = layout.markRects.filter((rect) => rect.x + rect.w < layout.qr.x);
    expect(textRects.length).toBeGreaterThan(0);
    for (const rect of textRects) {
      // hole rim (8.4mm) plus the 2mm clearance
      expect(rect.x).toBeGreaterThanOrEqual(HOLE.cx + HOLE.r + 2 - 1e-9);
    }
  });

  it("keeps every marking rect clear of the hole disc", () => {
    const layout = buildSwatchLayout(FULL_INPUT, HOLE_SPEC);
    for (const rect of layout.markRects) {
      const nearestX = Math.min(Math.max(HOLE.cx, rect.x), rect.x + rect.w);
      const nearestY = Math.min(Math.max(HOLE.cy, rect.y), rect.y + rect.h);
      expect(Math.hypot(nearestX - HOLE.cx, nearestY - HOLE.cy)).toBeGreaterThanOrEqual(HOLE.r);
    }
  });
});

describe("hanger tab support", () => {
  const TAB = { cx: 37.5, outerR: 5.5, holeR: 2.5 };
  const TAB_SPEC: SwatchStyleSpec = { ...TEST_SPEC, hangerTab: TAB };

  it("passes the hanger tab through to the layout", () => {
    expect(buildSwatchLayout(FULL_INPUT, TAB_SPEC).hangerTab).toEqual(TAB);
    expect(buildSwatchLayout(FULL_INPUT, TEST_SPEC).hangerTab).toBeUndefined();
  });

  it("keeps the marking clear of the nail hole dipping into the card", () => {
    const layout = buildSwatchLayout(FULL_INPUT, TAB_SPEC);
    for (const rect of layout.markRects) {
      const nearestX = Math.min(Math.max(TAB.cx, rect.x), rect.x + rect.w);
      const nearestY = Math.min(Math.max(0, rect.y), rect.y + rect.h);
      expect(Math.hypot(nearestX - TAB.cx, nearestY - 0)).toBeGreaterThanOrEqual(TAB.holeR);
    }
  });
});
