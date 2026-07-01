import { describe, expect, it } from "vitest";
import { parseInputNumberValue, parseValue } from "./inputNumberRange";

// Pure parsing helpers behind the number-range input (TESTING_CANDIDATES row 58).
describe("parseInputNumberValue", () => {
  it("passes numbers through unchanged", () => {
    expect(parseInputNumberValue(5)).toBe(5);
    expect(parseInputNumberValue(0)).toBe(0);
    expect(parseInputNumberValue(-3.5)).toBe(-3.5);
  });

  it("parses numeric strings", () => {
    expect(parseInputNumberValue("5")).toBe(5);
    expect(parseInputNumberValue("-2.5")).toBe(-2.5);
  });

  it("treats null and empty string as a deliberate clear (null)", () => {
    expect(parseInputNumberValue(null)).toBeNull();
    expect(parseInputNumberValue("")).toBeNull();
  });

  it("returns null for non-numeric strings rather than NaN", () => {
    expect(parseInputNumberValue("abc")).toBeNull();
  });
});

describe("parseValue", () => {
  it("returns [null, null] for undefined or malformed input", () => {
    expect(parseValue(undefined)).toEqual([null, null]);
    expect(parseValue([1])).toEqual([null, null]);
    expect(parseValue([1, 2, 3])).toEqual([null, null]);
  });

  it("returns the [min, max] pair for a valid two-element array", () => {
    expect(parseValue([1, 9])).toEqual([1, 9]);
    expect(parseValue([null, 9])).toEqual([null, 9]);
    expect(parseValue([1, null])).toEqual([1, null]);
  });
});
