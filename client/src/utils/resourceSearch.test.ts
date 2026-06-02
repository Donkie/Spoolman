import { describe, expect, it } from "vitest";
import { filterByResourceSearch, resourceSearchMatches } from "./resourceSearch";

describe("resourceSearchMatches", () => {
  const greenBambuSpool = {
    id: 12,
    lot_nr: "BAMBU-GRN-001",
    comment: "Great for dragon prints",
    location: "AMS slot 1",
    filament: {
      name: "Matte Green",
      material: "PLA",
      color_hex: "00aa44",
      vendor: {
        name: "Bambu Lab",
      },
    },
    extra: {
      purchase_store: "Bambu official store",
    },
  };

  it("matches a keyword anywhere in nested resource metadata", () => {
    expect(resourceSearchMatches(greenBambuSpool, "green")).toBe(true);
    expect(resourceSearchMatches(greenBambuSpool, "Bambu")).toBe(true);
    expect(resourceSearchMatches(greenBambuSpool, "AMS")).toBe(true);
  });

  it("requires every search keyword to match at least one metadata value", () => {
    expect(resourceSearchMatches(greenBambuSpool, "bambu green pla")).toBe(true);
    expect(resourceSearchMatches(greenBambuSpool, "bambu red pla")).toBe(false);
  });

  it("is case-insensitive and tolerates small typos", () => {
    expect(resourceSearchMatches(greenBambuSpool, "bambu gren")).toBe(true);
    expect(resourceSearchMatches(greenBambuSpool, "mat grn")).toBe(true);
  });

  it("treats blank search as a match", () => {
    expect(resourceSearchMatches(greenBambuSpool, "   ")).toBe(true);
  });
});

describe("filterByResourceSearch", () => {
  it("keeps only records matching all search keywords", () => {
    const resources = [
      {
        id: 1,
        filament: { name: "Matte Green", vendor: { name: "Bambu Lab" } },
      },
      {
        id: 2,
        filament: { name: "Galaxy Black", vendor: { name: "Prusament" } },
      },
      {
        id: 3,
        name: "Bambu Blue PLA",
      },
    ];

    expect(filterByResourceSearch(resources, "bambu green")).toEqual([resources[0]]);
    expect(filterByResourceSearch(resources, "bambu")).toEqual([resources[0], resources[2]]);
  });
});
