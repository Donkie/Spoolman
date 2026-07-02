// Contract tests for the swatch style registry: every registered style —
// including future community-contributed ones — must produce printable
// geometry for the whole range of filament data. If you are adding a style and
// one of these fails, see the sizing tips in styles.ts.

import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertWatertight, meshBounds } from "../../test/meshHelpers";
import { SwatchInput, buildSwatchLayout } from "./layout";
import { DEFAULT_SWATCH_STYLE_KEY, SWATCH_STYLES, buildSwatchLayoutForStyle, getSwatchStyle } from "./styles";
import { buildSwatch3mf, buildSwatchMeshes } from "./threeMf";

const FIXTURES: [string, SwatchInput][] = [
  [
    "full data, light filament",
    {
      id: 42,
      name: "Galaxy Black",
      vendorName: "Prusament",
      material: "PLA",
      diameterMm: 1.75,
      weightG: 1000,
      extruderTempC: 215,
      bedTempC: 60,
      articleNumber: "ART-0042",
      colorHexes: ["e8e8e8"],
      qrPayload: "WEB+SPOOLMAN:F-42",
    },
  ],
  [
    "full data, dark multi-color filament",
    {
      id: 7,
      name: "Dual Nebula",
      vendorName: "Polymaker",
      material: "PETG",
      diameterMm: 2.85,
      weightG: 750,
      extruderTempC: 240,
      bedTempC: 80,
      articleNumber: "PM70877",
      colorHexes: ["1a1a2e", "2d0a4e"],
      qrPayload: "WEB+SPOOLMAN:F-7",
    },
  ],
  ["minimal data", { id: 3, colorHexes: [], qrPayload: "WEB+SPOOLMAN:F-3" }],
  [
    "hostile data: long strings and a long URL payload",
    {
      id: 999999,
      name: "An Extremely Long And Overly Descriptive Filament Name",
      vendorName: "The Longest Vendor Name In The Entire World",
      material: "PLA-CF15-SUPER",
      diameterMm: 1.75,
      weightG: 12345,
      extruderTempC: 260,
      bedTempC: 110,
      articleNumber: "XX-99999-YY-ZZZZZ",
      colorHexes: ["777777"],
      qrPayload: "https://spoolman.example.com/some/base/path/filament/show/999999",
    },
  ],
];

describe("swatch style registry", () => {
  it("has at least one style with unique, non-empty keys", () => {
    expect(SWATCH_STYLES.length).toBeGreaterThan(0);
    const keys = SWATCH_STYLES.map((style) => style.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const style of SWATCH_STYLES) {
      expect(style.key).not.toBe("");
      expect(style.name).not.toBe("");
    }
  });

  it("resolves the default key to a registered style", () => {
    expect(SWATCH_STYLES.some((style) => style.key === DEFAULT_SWATCH_STYLE_KEY)).toBe(true);
    expect(getSwatchStyle(DEFAULT_SWATCH_STYLE_KEY).key).toBe(DEFAULT_SWATCH_STYLE_KEY);
  });

  it("falls back to the default style for unknown, empty or unset keys", () => {
    expect(getSwatchStyle("does-not-exist").key).toBe(DEFAULT_SWATCH_STYLE_KEY);
    expect(getSwatchStyle("").key).toBe(DEFAULT_SWATCH_STYLE_KEY);
    expect(getSwatchStyle(undefined).key).toBe(DEFAULT_SWATCH_STYLE_KEY);
    expect(getSwatchStyle(null).key).toBe(DEFAULT_SWATCH_STYLE_KEY);
  });

  it("builds layouts with the dimensions of the requested style", () => {
    const input = FIXTURES[0][1];
    for (const style of SWATCH_STYLES) {
      const layout = buildSwatchLayoutForStyle(input, style.key);
      expect(layout.widthMm).toBe(style.spec.widthMm);
      expect(layout.heightMm).toBe(style.spec.heightMm);
    }
  });
});

describe.each(SWATCH_STYLES.map((style) => [style.key, style] as const))("style contract: %s", (_key, style) => {
  describe.each(FIXTURES)("with %s", (_label, input) => {
    const layout = buildSwatchLayout(input, style.spec);

    it("keeps all marking inside the card margins", () => {
      expect(layout.markRects.length).toBeGreaterThan(0);
      for (const rect of layout.markRects) {
        expect(rect.x).toBeGreaterThanOrEqual(style.spec.marginMm - 1e-6);
        expect(rect.x + rect.w).toBeLessThanOrEqual(style.spec.widthMm - style.spec.marginMm + 1e-6);
        expect(rect.y).toBeGreaterThanOrEqual(style.spec.marginMm - 1e-6);
        expect(rect.y + rect.h).toBeLessThanOrEqual(style.spec.heightMm - style.spec.marginMm + 1e-6);
      }
    });

    it("keeps text at a printable size", () => {
      for (const line of layout.textLines) {
        expect(line.scale).toBeGreaterThanOrEqual(style.spec.minPixelScaleMm - 1e-9);
      }
    });

    it("keeps QR modules printable with a 0.4mm nozzle", () => {
      expect(layout.qr.moduleSizeMm).toBeGreaterThanOrEqual(0.4);
    });

    it("builds watertight meshes with the marking exactly one layer above the base", () => {
      const { base, marking } = buildSwatchMeshes(layout);
      assertWatertight(base);
      assertWatertight(marking);
      const baseBounds = meshBounds(base);
      expect(baseBounds.min[2]).toBe(0);
      expect(baseBounds.max[2]).toBeCloseTo(style.spec.baseThicknessMm, 9);
      const markingBounds = meshBounds(marking);
      expect(markingBounds.min[2]).toBeCloseTo(style.spec.baseThicknessMm, 9);
      expect(markingBounds.max[2]).toBeCloseTo(style.spec.baseThicknessMm + style.spec.markingThicknessMm, 9);
      // the marking must sit on the card, not hang off it
      expect(markingBounds.min[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(markingBounds.max[0]).toBeLessThanOrEqual(style.spec.widthMm + 1e-6);
      expect(markingBounds.min[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(markingBounds.max[1]).toBeLessThanOrEqual(style.spec.heightMm + 1e-6);
    });

    it("packages as a parseable 3MF archive", () => {
      const data = buildSwatch3mf(layout, { title: "contract test" });
      const files = unzipSync(data);
      expect(Object.keys(files).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
      const doc = new DOMParser().parseFromString(strFromU8(files["3D/3dmodel.model"]), "application/xml");
      expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
      expect(doc.documentElement.getAttribute("unit")).toBe("millimeter");
    });
  });
});
