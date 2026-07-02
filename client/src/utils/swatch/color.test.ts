import { describe, expect, it } from "vitest";
import { BLACK_MARKING_LUMINANCE_THRESHOLD, normalizeHexColor, pickMarkingColor, relativeLuminance } from "./color";

describe("normalizeHexColor", () => {
  it("normalizes case and adds the hash", () => {
    expect(normalizeHexColor("AABBCC")).toBe("#aabbcc");
    expect(normalizeHexColor("#123abc")).toBe("#123abc");
  });

  it("drops an alpha channel", () => {
    expect(normalizeHexColor("12345678")).toBe("#123456");
  });

  it("rejects invalid values", () => {
    expect(normalizeHexColor(undefined)).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("12345")).toBeNull();
    expect(normalizeHexColor("zzzzzz")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance("ffffff")).toBeCloseTo(1, 10);
    expect(relativeLuminance("000000")).toBeCloseTo(0, 10);
  });

  it("is null for invalid colors", () => {
    expect(relativeLuminance("not-a-color")).toBeNull();
    expect(relativeLuminance(undefined)).toBeNull();
  });

  it("weights green highest, matching WCAG", () => {
    const g = relativeLuminance("00ff00");
    const r = relativeLuminance("ff0000");
    const b = relativeLuminance("0000ff");
    expect(g).toBeGreaterThan(r ?? 1);
    expect(r).toBeGreaterThan(b ?? 1);
  });
});

describe("pickMarkingColor", () => {
  it("puts black markings on light filaments", () => {
    expect(pickMarkingColor(["ffffff"])).toBe("black");
    expect(pickMarkingColor(["ffee00"])).toBe("black");
    expect(pickMarkingColor(["e8e8e8"])).toBe("black");
  });

  it("puts white markings on dark filaments", () => {
    expect(pickMarkingColor(["000000"])).toBe("white");
    expect(pickMarkingColor(["1a1a2e"])).toBe("white");
    expect(pickMarkingColor(["555555"])).toBe("white");
  });

  it("matches the WCAG contrast crossover threshold", () => {
    expect(BLACK_MARKING_LUMINANCE_THRESHOLD).toBeCloseTo(0.1791, 3);
  });

  it("judges multi-color filaments by their average luminance", () => {
    // black + white averages to a mid gray, which is above the ~0.18 threshold
    expect(pickMarkingColor(["000000", "ffffff"])).toBe("black");
    // two dark colors stay dark
    expect(pickMarkingColor(["000000", "222222"])).toBe("white");
  });

  it("ignores invalid entries and defaults to black when no color is known", () => {
    expect(pickMarkingColor([])).toBe("black");
    expect(pickMarkingColor([undefined])).toBe("black");
    expect(pickMarkingColor(["junk"])).toBe("black");
    // the valid dark entry wins over the invalid one
    expect(pickMarkingColor(["junk", "000000"])).toBe("white");
  });
});
