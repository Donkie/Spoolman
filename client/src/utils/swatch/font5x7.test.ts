import { describe, expect, it } from "vitest";
import {
  CHAR_ADVANCE,
  DEGREE_SIGN,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  glyphColumns,
  isGlyphPixelSet,
  textWidthPx,
} from "./font5x7";

function renderGlyph(char: string): string[] {
  const columns = glyphColumns(char);
  const rows: string[] = [];
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    let line = "";
    for (let column = 0; column < GLYPH_WIDTH; column++) {
      line += isGlyphPixelSet(columns, column, row) ? "#" : ".";
    }
    rows.push(line);
  }
  return rows;
}

describe("glyphColumns", () => {
  it("renders the classic 'A' shape", () => {
    expect(renderGlyph("A")).toEqual(["..#..", ".#.#.", "#...#", "#...#", "#####", "#...#", "#...#", "....."]);
  });

  it("has a degree-sign glyph confined to the top rows", () => {
    const rows = renderGlyph(DEGREE_SIGN);
    expect(rows.slice(0, 4).join("")).toContain("#");
    expect(rows.slice(4).join("")).not.toContain("#");
  });

  it("provides five sane column bytes for every printable ASCII character", () => {
    for (let code = 0x20; code <= 0x7e; code++) {
      const columns = glyphColumns(String.fromCharCode(code));
      expect(columns).toHaveLength(5);
      for (const byte of columns) {
        expect(Number.isInteger(byte)).toBe(true);
        expect(byte).toBeGreaterThanOrEqual(0);
        expect(byte).toBeLessThanOrEqual(0xff);
      }
    }
  });

  it("falls back to '?' for characters outside the font", () => {
    expect(glyphColumns("€")).toEqual(glyphColumns("?"));
    expect(glyphColumns("\n")).toEqual(glyphColumns("?"));
  });
});

describe("textWidthPx", () => {
  it("is zero for the empty string", () => {
    expect(textWidthPx("")).toBe(0);
  });

  it("omits the trailing inter-character gap", () => {
    expect(textWidthPx("A")).toBe(GLYPH_WIDTH);
    expect(textWidthPx("AB")).toBe(2 * CHAR_ADVANCE - 1);
  });
});
