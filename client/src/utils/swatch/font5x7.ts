// Classic fixed-width 5x7 (5x8 cell) bitmap font, CP437 glyph shapes as shipped
// with countless character-LCD/OLED controllers (this table matches the
// "classic" font of the BSD-licensed Adafruit-GFX-Library, glcdfont.c).
// Encoding: 5 column bytes per glyph; bit j (LSB first) of a column byte is the
// pixel in row j, counted from the top. Row 7 is only used by descenders.

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 8;
/** Horizontal advance per character in glyph pixels (glyph plus 1px spacing). */
export const CHAR_ADVANCE = GLYPH_WIDTH + 1;

const FIRST_CODE = 0x20; // space
const LAST_CODE = 0x7e; // tilde

// prettier-ignore
const GLYPH_DATA =
  "000000000000005f00000007000700147f147f14242a7f2a12231308646236495620500008070300001c22410000412" +
  "21c002a1c7f1c2a08083e080800807030000808080808000060600020100804023e5149453e00427f40007249494946" +
  "2141494d331814127f1027454545393c4a49493141211109073649494936464949291e0000140000004034000000081" +
  "422411414141414004122140802015909063e415d594e7c1211127c7f494949363e414141227f4141413e7f49494941" +
  "7f090909013e414151737f0808087f00417f41002040413f017f081422417f404040407f021c027f7f0408107f3e414" +
  "1413e7f090909063e4151215e7f09192946264949493203017f01033f4040403f1f2040201f3f4038403f6314081463" +
  "03047804036159494d43007f4141410204081020004141417f04020102044040404040000307080020545478407f284" +
  "444383844444428384444287f385454541800087e090218a4a49c787f0804047800447d40002040403d007f10284400" +
  "00417f40007c047804787c080404783844444438fc1824241818242418fc7c08040408485454542404043f44243c404" +
  "0207c1c2040201c3c4030403c44281028444c9090907c4464544c440008364100000077000000413608000201020402";

/** The degree sign is outside printable ASCII but needed for temperature lines. */
const DEGREE_GLYPH = "060f090f06";
export const DEGREE_SIGN = "\u00b0";

const FALLBACK_CODE = 0x3f; // '?'

function decodeColumns(hex: string, index: number): number[] {
  const columns: number[] = [];
  for (let i = 0; i < GLYPH_WIDTH; i++) {
    columns.push(parseInt(hex.substring(index + i * 2, index + i * 2 + 2), 16));
  }
  return columns;
}

/** Column bytes for a single character; unknown characters render as '?'. */
export function glyphColumns(char: string): number[] {
  if (char === DEGREE_SIGN) {
    return decodeColumns(DEGREE_GLYPH, 0);
  }
  let code = char.codePointAt(0) ?? FALLBACK_CODE;
  if (code < FIRST_CODE || code > LAST_CODE) {
    code = FALLBACK_CODE;
  }
  return decodeColumns(GLYPH_DATA, (code - FIRST_CODE) * GLYPH_WIDTH * 2);
}

/** Whether the pixel at (column, row from top) of a glyph is set. */
export function isGlyphPixelSet(columns: number[], column: number, row: number): boolean {
  return ((columns[column] >> row) & 1) === 1;
}

/** Width of a rendered string in glyph pixels (no trailing inter-character gap). */
export function textWidthPx(text: string): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  return chars.length * CHAR_ADVANCE - 1;
}
