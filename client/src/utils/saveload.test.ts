import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSavedState } from "./saveload";

// Oracle: the OBSERVABLE state of localStorage and the value the next mount reads
// — never which storage method was called. These are regression tests for the
// "undefined poisons localStorage" bug (PR #27); each one fails against the old
// code and passes against the fix.
describe("useSavedState", () => {
  const key = (id: string) => `savedStates-${id}`;

  it("returns the default when nothing is stored", () => {
    const { result } = renderHook(() => useSavedState("empty", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("persists a value and restores it on a fresh mount", () => {
    const first = renderHook(() => useSavedState("roundtrip", "init"));
    act(() => first.result.current[1]("chosen"));
    expect(JSON.parse(localStorage.getItem(key("roundtrip"))!)).toBe("chosen");

    // A brand-new hook instance (simulates a page reload) reads it back.
    const second = renderHook(() => useSavedState("roundtrip", "init"));
    expect(second.result.current[0]).toBe("chosen");
  });

  it("removes the key instead of writing the string 'undefined' when set to undefined", () => {
    const { result } = renderHook(() => useSavedState<string | undefined>("clearable", "start"));
    act(() => result.current[1]("value"));
    expect(localStorage.getItem(key("clearable"))).toBe('"value"');

    act(() => result.current[1](undefined));
    // The bug wrote the literal string "undefined"; the fix removes the key.
    expect(localStorage.getItem(key("clearable"))).toBeNull();
    expect(localStorage.getItem(key("clearable"))).not.toBe("undefined");
  });

  it("heals a key already poisoned with the string 'undefined' and returns the default", () => {
    // Simulate storage left behind by an older build.
    localStorage.setItem(key("poisoned"), "undefined");

    const { result } = renderHook(() => useSavedState("poisoned", "healthy"));
    // Must fall back to the default rather than throw on JSON.parse("undefined").
    expect(result.current[0]).toBe("healthy");

    // ...and the poisoned value must not survive as-is.
    expect(localStorage.getItem(key("poisoned"))).not.toBe("undefined");
  });

  it("falls back to the default for any unparseable stored value", () => {
    localStorage.setItem(key("garbage"), "{not valid json");
    const { result } = renderHook(() => useSavedState("garbage", 42));
    expect(result.current[0]).toBe(42);
  });

  it.each([
    ["a string", "hi"],
    ["the number zero", 0],
    ["false", false],
    ["an empty string", ""],
    ["an object", { a: 1, b: [2, 3] }],
  ])("round-trips %s without dropping it", (_label, value) => {
    const first = renderHook(() => useSavedState<unknown>("valid", "def"));
    act(() => first.result.current[1](value));
    const second = renderHook(() => useSavedState<unknown>("valid", "def"));
    expect(second.result.current[0]).toEqual(value);
  });
});
