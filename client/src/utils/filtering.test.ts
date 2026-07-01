import { CrudFilter } from "@refinedev/core";
import { describe, expect, it } from "vitest";
import {
  getCustomFieldFilters,
  getFiltersForField,
  removeUndefined,
  searchMatches,
  serializeFilterValues,
  typeFilters,
} from "./filtering";

// Behavioral tests for the pure filter helpers in filtering.ts.
// Oracle: the documented contract (JSDoc) plus refine's CrudFilter shape
// (LogicalFilter = { field, operator, value }; ConditionalFilter = { key?, operator: "or"|"and", value: [] }).
// The "extra." prefix is the custom-field convention shared with queryFields.ts.

describe("getCustomFieldFilters", () => {
  it("returns only the custom (extra.*) filters, keyed by the stripped field key", () => {
    const filters: CrudFilter[] = [
      { field: "material", operator: "eq", value: ["PLA"] },
      { field: "extra.spool_type", operator: "eq", value: ["cardboard"] },
      { field: "vendor.name", operator: "contains", value: ["Acme"] },
      { field: "extra.color_family", operator: "in", value: ["red", "blue"] },
    ];

    expect(getCustomFieldFilters(filters)).toEqual({
      spool_type: ["cardboard"],
      color_family: ["red", "blue"],
    });
  });

  it("returns an empty object for an empty filter list", () => {
    expect(getCustomFieldFilters([])).toEqual({});
  });

  it("returns an empty object when no custom fields are present", () => {
    const filters: CrudFilter[] = [
      { field: "material", operator: "eq", value: ["PLA"] },
      { field: "location", operator: "eq", value: ["Shelf A"] },
    ];
    expect(getCustomFieldFilters(filters)).toEqual({});
  });

  it("keeps multiple distinct custom fields", () => {
    const filters: CrudFilter[] = [
      { field: "extra.a", operator: "eq", value: ["1"] },
      { field: "extra.b", operator: "eq", value: ["2"] },
      { field: "extra.c", operator: "eq", value: ["3"] },
    ];
    expect(getCustomFieldFilters(filters)).toEqual({
      a: ["1"],
      b: ["2"],
      c: ["3"],
    });
  });

  it("lets the last value win when the same custom field key appears twice", () => {
    // Documents current behaviour: the result is a plain object, so a repeated key overwrites.
    const filters: CrudFilter[] = [
      { field: "extra.dupe", operator: "eq", value: ["first"] },
      { field: "extra.dupe", operator: "eq", value: ["second"] },
    ];
    expect(getCustomFieldFilters(filters)).toEqual({ dupe: ["second"] });
  });

  it("skips conditional (or/and) filters that have no field property", () => {
    const filters: CrudFilter[] = [
      {
        operator: "or",
        value: [
          { field: "extra.nested", operator: "eq", value: ["x"] },
          { field: "material", operator: "eq", value: ["PLA"] },
        ],
      },
      { field: "extra.top", operator: "eq", value: ["y"] },
    ];
    // Only the top-level extra.* field is collected; nested filters inside the "or" are ignored.
    expect(getCustomFieldFilters(filters)).toEqual({ top: ["y"] });
  });

  it("preserves the raw value verbatim (does not inspect the operator)", () => {
    const filters: CrudFilter[] = [{ field: "extra.count", operator: "between", value: ["10", "20"] }];
    expect(getCustomFieldFilters(filters)).toEqual({ count: ["10", "20"] });
  });
});

describe("getFiltersForField", () => {
  it("collects and flattens all values for the matching field", () => {
    const filters = typeFilters([
      { field: "material", operator: "in", value: ["PLA", "PETG"] },
      { field: "location", operator: "eq", value: ["Shelf A"] },
      { field: "material", operator: "in", value: ["ABS"] },
    ]);
    expect(getFiltersForField(filters, "material")).toEqual(["PLA", "PETG", "ABS"]);
  });

  it("returns an empty array when no filter matches the field", () => {
    const filters = typeFilters([{ field: "material", operator: "eq", value: ["PLA"] }]);
    expect(getFiltersForField(filters, "location")).toEqual([]);
  });

  it("returns an empty array for an empty filter list", () => {
    expect(getFiltersForField(typeFilters([]), "material")).toEqual([]);
  });

  it("matches custom (extra.*) fields by their full field name", () => {
    const filters = typeFilters([{ field: "extra.color", operator: "eq", value: ["red"] }]);
    expect(getFiltersForField(filters, "extra.color")).toEqual(["red"]);
  });
});

describe("typeFilters", () => {
  it("returns the same array reference (identity cast)", () => {
    const filters: CrudFilter[] = [{ field: "material", operator: "eq", value: ["PLA"] }];
    expect(typeFilters(filters)).toBe(filters);
  });
});

describe("removeUndefined", () => {
  it("removes undefined entries", () => {
    expect(removeUndefined([1, undefined, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it("returns an empty array for an empty input", () => {
    expect(removeUndefined([])).toEqual([]);
  });

  it("keeps falsy-but-defined values (null, 0, empty string, false)", () => {
    expect(removeUndefined([null, 0, "", false, undefined])).toEqual([null, 0, "", false]);
  });

  it("returns an empty array when every value is undefined", () => {
    expect(removeUndefined([undefined, undefined])).toEqual([]);
  });
});

describe("searchMatches", () => {
  it("matches a single word case-insensitively", () => {
    expect(searchMatches("PLA", "Acme black pla filament")).toBe(true);
    expect(searchMatches("pla", "Acme Black PLA Filament")).toBe(true);
  });

  it("requires every query word to be present (AND semantics)", () => {
    expect(searchMatches("acme pla", "Acme black PLA filament")).toBe(true);
    expect(searchMatches("acme petg", "Acme black PLA filament")).toBe(false);
  });

  it("matches substrings, not just whole words", () => {
    expect(searchMatches("fil", "filament")).toBe(true);
  });

  it("returns false when a query word is absent", () => {
    expect(searchMatches("green", "Acme black PLA")).toBe(false);
  });

  it("returns true for an empty query (splits to a single empty word, included everywhere)", () => {
    // "".split(" ") === [""] and every string includes "", so an empty query always matches.
    expect(searchMatches("", "anything")).toBe(true);
    expect(searchMatches("", "")).toBe(true);
  });
});

describe("serializeFilterValues", () => {
  it("joins values with commas", () => {
    expect(serializeFilterValues(["a", "b", "c"])).toBe("a,b,c");
  });

  it("maps the '<empty>' sentinel to a real empty value", () => {
    expect(serializeFilterValues(["<empty>"])).toBe("");
    expect(serializeFilterValues(["a", "<empty>", "b"])).toBe("a,,b");
  });

  it("returns an empty string for an empty list", () => {
    expect(serializeFilterValues([])).toBe("");
  });
});
