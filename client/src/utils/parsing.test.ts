import { describe, expect, it } from "vitest";
import {
  formatLength,
  formatNumberWithSpaceSeparator,
  formatWeight,
  numberFormatter,
  numberParser,
  numberParserAllowEmpty,
} from "./parsing";

// Behavioral tests for the pure formatting/parsing helpers. The oracle is the
// documented input -> output contract (hand-computed expected strings/numbers),
// not a re-implementation of the code.
//
// Locale note: numberFormatter relies on Number.prototype.toLocaleString, whose
// decimal separator is locale-dependent. The Vitest/jsdom environment resolves
// to en-US (period decimal separator), so the expectations below assume a period
// decimal separator. The thousands separator is always a blank space because the
// helper disables grouping and re-inserts spaces manually, so that part is
// locale-stable.

describe("formatNumberWithSpaceSeparator", () => {
  it("inserts a blank-space thousands separator into the integer part", () => {
    expect(formatNumberWithSpaceSeparator("1234567")).toBe("1 234 567");
  });

  it("keeps a period decimal separator and only groups the integer part", () => {
    expect(formatNumberWithSpaceSeparator("1234.56")).toBe("1 234.56");
  });

  it("keeps a comma decimal separator when the input uses one", () => {
    expect(formatNumberWithSpaceSeparator("1234,56")).toBe("1 234,56");
  });

  it("leaves short numbers untouched", () => {
    expect(formatNumberWithSpaceSeparator("12")).toBe("12");
    expect(formatNumberWithSpaceSeparator("999")).toBe("999");
  });

  it("groups a negative integer without splitting the sign", () => {
    expect(formatNumberWithSpaceSeparator("-1234")).toBe("-1 234");
  });
});

describe("numberFormatter", () => {
  // Regression (TESTING_CANDIDATES 58b): a legitimate 0 must render as "0",
  // not blank. Truthiness checks would have blanked it out.
  it('renders a legitimate 0 as "0", not a blank field', () => {
    expect(numberFormatter(0)).toBe("0");
    expect(numberFormatter("0")).toBe("0");
  });

  it("returns an empty string for undefined and empty-string input", () => {
    expect(numberFormatter(undefined)).toBe("");
    expect(numberFormatter("")).toBe("");
  });

  it("formats a normal integer with blank-space thousands separators", () => {
    expect(numberFormatter(1234567)).toBe("1 234 567");
    expect(numberFormatter(42)).toBe("42");
  });

  it("formats a negative decimal, grouping the integer part only", () => {
    expect(numberFormatter(-1234.5)).toBe("-1 234.5");
  });

  it("accepts numeric strings equivalently to numbers", () => {
    expect(numberFormatter("1234567")).toBe("1 234 567");
  });

  it("returns an empty string for non-finite / non-numeric values", () => {
    expect(numberFormatter(NaN)).toBe("");
    expect(numberFormatter(Infinity)).toBe("");
    expect(numberFormatter("abc")).toBe("");
  });
});

describe("numberParser", () => {
  it("parses a formatted string (spaces + comma decimal) back to a number", () => {
    expect(numberParser("1 234,5")).toBe(1234.5);
  });

  it("parses a plain dotted decimal string", () => {
    expect(numberParser("1234.5")).toBe(1234.5);
  });

  it("parses negative numbers", () => {
    expect(numberParser("-42")).toBe(-42);
  });

  it("always returns a valid number, defaulting to 0 for empty/undefined/garbage", () => {
    expect(numberParser("")).toBe(0);
    expect(numberParser(undefined)).toBe(0);
    expect(numberParser("abc")).toBe(0);
  });
});

describe("numberParserAllowEmpty", () => {
  it("parses a formatted string back to a number like numberParser", () => {
    expect(numberParserAllowEmpty("1 234,5")).toBe(1234.5);
    expect(numberParserAllowEmpty("-42")).toBe(-42);
  });

  it("returns an empty string (not 0) for empty and undefined input", () => {
    expect(numberParserAllowEmpty("")).toBe("");
    expect(numberParserAllowEmpty(undefined)).toBe("");
  });

  it("returns an empty string for input that reduces to nothing after stripping", () => {
    // "abc" has no digits, so it collapses to "" and is treated as empty.
    expect(numberParserAllowEmpty("abc")).toBe("");
  });
});

describe("formatWeight", () => {
  it("keeps sub-kilogram weights in grams", () => {
    expect(formatWeight(500)).toBe("500 g");
    expect(formatWeight(999)).toBe("999 g");
    expect(formatWeight(0)).toBe("0 g");
  });

  it("switches to kilograms at and above 1000 g and trims trailing zeros", () => {
    expect(formatWeight(1000)).toBe("1 kg");
    expect(formatWeight(1500)).toBe("1.5 kg");
    expect(formatWeight(1250)).toBe("1.25 kg");
  });

  it("respects the precision argument", () => {
    expect(formatWeight(1234, 3)).toBe("1.234 kg");
    // Default precision is 2, so 1234 g rounds to 1.23 kg.
    expect(formatWeight(1234)).toBe("1.23 kg");
  });
});

describe("formatLength", () => {
  it("keeps sub-meter lengths in millimeters (unrounded)", () => {
    expect(formatLength(500)).toBe("500 mm");
    expect(formatLength(999)).toBe("999 mm");
  });

  it("switches to meters at and above 1000 mm and trims trailing zeros", () => {
    expect(formatLength(1000)).toBe("1 m");
    expect(formatLength(1500)).toBe("1.5 m");
    // Default precision is 2, so 1234 mm rounds to 1.23 m.
    expect(formatLength(1234)).toBe("1.23 m");
  });

  it("respects the precision argument", () => {
    expect(formatLength(2500, 3)).toBe("2.5 m");
  });
});
