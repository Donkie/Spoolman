import { describe, expect, it } from "vitest";
import { parseStringSettingValue } from "./querySettings";

// Behavioral tests for parseStringSettingValue, which is used to read string-typed
// settings that the backend stores as JSON-encoded values.
// Oracle: the documented contract — JSON-parse the value and return the parsed
// string, else the fallback; return the fallback for undefined; and return the raw
// value when JSON parsing throws — not the implementation.
describe("parseStringSettingValue", () => {
  it("returns the decoded string for a JSON string value", () => {
    expect(parseStringSettingValue('"http://x"')).toBe("http://x");
  });

  it("returns an empty string for an empty JSON string value", () => {
    expect(parseStringSettingValue('""')).toBe("");
  });

  it("returns the default empty fallback for undefined", () => {
    expect(parseStringSettingValue(undefined)).toBe("");
  });

  it("returns a custom fallback for undefined", () => {
    expect(parseStringSettingValue(undefined, "default")).toBe("default");
  });

  it("returns the raw value when it is not valid JSON", () => {
    expect(parseStringSettingValue("abc")).toBe("abc");
  });

  it("returns the raw value on a parse error even when a fallback is provided", () => {
    // Parse errors short-circuit to the raw value, so the fallback is ignored here.
    expect(parseStringSettingValue("abc", "default")).toBe("abc");
  });

  it("returns the fallback when the parsed value is a JSON number", () => {
    expect(parseStringSettingValue("5")).toBe("");
    expect(parseStringSettingValue("5", "default")).toBe("default");
  });

  it("returns the fallback when the parsed value is a JSON boolean", () => {
    expect(parseStringSettingValue("true", "default")).toBe("default");
  });

  it("returns the fallback when the parsed value is JSON null", () => {
    expect(parseStringSettingValue("null", "default")).toBe("default");
  });

  it("returns the fallback when the parsed value is a JSON object", () => {
    expect(parseStringSettingValue('{"a":1}', "default")).toBe("default");
  });

  it("returns the fallback when the parsed value is a JSON array", () => {
    expect(parseStringSettingValue("[1,2,3]", "default")).toBe("default");
  });
});
