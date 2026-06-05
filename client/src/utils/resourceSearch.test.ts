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

  it("matches keywords in user-visible resource fields", () => {
    expect(resourceSearchMatches(greenBambuSpool, "green")).toBe(true);
    expect(resourceSearchMatches(greenBambuSpool, "Bambu")).toBe(true);
    expect(resourceSearchMatches(greenBambuSpool, "AMS")).toBe(true);
  });

  it("does not search hidden metadata fields or field names", () => {
    expect(resourceSearchMatches(greenBambuSpool, "purchase")).toBe(false);
    expect(resourceSearchMatches(greenBambuSpool, "official")).toBe(false);
    expect(resourceSearchMatches(greenBambuSpool, "color hex")).toBe(false);
    expect(resourceSearchMatches(greenBambuSpool, "00aa44")).toBe(false);
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
      {
        id: 4,
        filament: { name: "Matte Ash Gray", vendor: { name: "Bambu Lab" } },
      },
    ];

    expect(filterByResourceSearch(resources, "bambu green")).toEqual([resources[0]]);
    expect(filterByResourceSearch(resources, "bambu")).toEqual([resources[0], resources[2], resources[3]]);
  });

  it("does not match AMS tray metadata when searching for gray", () => {
    const resources = [
      {
        id: 1,
        filament: { name: "Black", vendor: { name: "Sunlu" } },
        extra: { active_tray: { ams: "00600A531520425", tray: 1 } },
      },
      {
        id: 2,
        filament: { name: "Bambu Green", vendor: { name: "Bambu Lab" } },
        extra: { active_tray: { ams: "00600A531520425", tray: 2 } },
      },
      {
        id: 3,
        filament: { name: "Jade White", vendor: { name: "Bambu Lab" } },
        extra: { active_tray: { ams: "00600A531520425", tray: 4 } },
      },
      {
        id: 4,
        filament: { name: "Matte Ash Gray", vendor: { name: "Bambu Lab" } },
        extra: { active_tray: { ams: "00600A531520425", tray: 3 } },
      },
    ];

    expect(filterByResourceSearch(resources, "gray")).toEqual([resources[3]]);
    expect(filterByResourceSearch(resources, "grey")).toEqual([resources[3]]);
    expect(filterByResourceSearch(resources, "active tray")).toEqual([]);
    expect(filterByResourceSearch(resources, "00600A531520425")).toEqual([]);
  });
});
