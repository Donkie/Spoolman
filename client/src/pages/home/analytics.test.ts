import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { IFilament } from "../filaments/model";
import { ISpool } from "../spools/model";
import { IVendor } from "../vendors/model";
import {
  DEFAULT_TOTAL_WEIGHT,
  getColorHex,
  getSpoolName,
  getWeightPct,
  locationBreakdown,
  lowStockSpools,
  materialBreakdown,
  recentSpools,
  registeredWithinDays,
  spoolStockWeight,
  topVendor,
  totalRemainingWeight,
  totalValue,
  vendorBreakdown,
} from "./analytics";

// --- Fixtures ---------------------------------------------------------------

function vendor(name: string): IVendor {
  return { id: 1, registered: "2024-01-01", name, extra: {} };
}

function filament(over: Partial<IFilament> = {}): IFilament {
  return { id: 1, registered: "2024-01-01", density: 1.24, diameter: 1.75, extra: {}, ...over };
}

let nextId = 1;
function spool(over: Partial<ISpool> = {}): ISpool {
  const { filament: fil, ...rest } = over;
  return {
    id: nextId++,
    registered: "2024-01-01T00:00:00Z",
    filament: fil ?? filament(),
    used_weight: 0,
    used_length: 0,
    archived: false,
    extra: {},
    ...rest,
  };
}

// --- spoolStockWeight: the fallback chain that already caused a bug ----------

describe("spoolStockWeight", () => {
  it("prefers remaining over initial over filament weight", () => {
    expect(spoolStockWeight(spool({ remaining_weight: 1, initial_weight: 2, filament: filament({ weight: 3 }) }))).toBe(
      1,
    );
    expect(spoolStockWeight(spool({ initial_weight: 2, filament: filament({ weight: 3 }) }))).toBe(2);
    expect(spoolStockWeight(spool({ filament: filament({ weight: 3 }) }))).toBe(3);
  });

  it("is 0 when no weight information exists", () => {
    expect(spoolStockWeight(spool({ filament: filament() }))).toBe(0);
  });
});

describe("totalRemainingWeight", () => {
  it("is 0 for an empty inventory", () => {
    expect(totalRemainingWeight([])).toBe(0);
  });

  it("sums the effective stock weight across mixed fallback cases", () => {
    const spools = [
      spool({ remaining_weight: 500 }),
      spool({ initial_weight: 800 }),
      spool({ filament: filament({ weight: 1000 }) }),
      spool({ filament: filament() }), // contributes 0
    ];
    expect(totalRemainingWeight(spools)).toBe(500 + 800 + 1000 + 0);
  });
});

describe("totalValue", () => {
  it("sums prices and ignores spools without a price", () => {
    expect(totalValue([spool({ price: 10 }), spool({}), spool({ price: 5.5 })])).toBe(15.5);
  });

  it("is 0 for an empty inventory", () => {
    expect(totalValue([])).toBe(0);
  });
});

describe("lowStockSpools", () => {
  it("uses a strict threshold: exactly 15% is NOT low stock", () => {
    const at15 = spool({ initial_weight: 1000, remaining_weight: 150 });
    const below = spool({ initial_weight: 1000, remaining_weight: 149 });
    const result = lowStockSpools([at15, below]);
    expect(result).toEqual([below]);
  });

  it("orders results most-depleted first", () => {
    const a = spool({ initial_weight: 1000, remaining_weight: 100 }); // 10%
    const b = spool({ initial_weight: 1000, remaining_weight: 20 }); //  2%
    const c = spool({ initial_weight: 1000, remaining_weight: 140 }); // 14%
    const result = lowStockSpools([a, b, c]);
    expect(result.map((s) => s.remaining_weight)).toEqual([20, 100, 140]);
  });

  it("does not flag a spool that has no weight information at all", () => {
    // total falls back to DEFAULT_TOTAL_WEIGHT and remaining defaults to total → ratio 1.0.
    expect(lowStockSpools([spool({ filament: filament() })])).toEqual([]);
  });

  it("excludes a spool whose total resolves to 0 (ratio is NaN/Infinity, never < threshold)", () => {
    // Documents the current edge behaviour for initial_weight === 0.
    expect(lowStockSpools([spool({ initial_weight: 0, remaining_weight: 0 })])).toEqual([]);
  });

  it("falls back to filament.weight for the total when initial_weight is absent", () => {
    // No initial_weight → the total must come from filament.weight (800g), not the
    // nominal DEFAULT_TOTAL_WEIGHT. 130/800 = 16.25% is NOT low; if the fallback were
    // wrong and used 1000, 130/1000 = 13% would (incorrectly) flag it as low stock.
    const notLow = spool({ remaining_weight: 130, filament: filament({ weight: 800 }) });
    expect(lowStockSpools([notLow])).toEqual([]);
    // Below 15% of its own 800g total → genuinely low stock.
    const low = spool({ remaining_weight: 100, filament: filament({ weight: 800 }) }); // 12.5%
    expect(lowStockSpools([low])).toEqual([low]);
  });

  it("ranks by depletion ratio using the per-spool filament.weight fallback denominator", () => {
    // Neither spool has initial_weight, so each total comes from its own filament.weight.
    // Ordering must apply that fallback per spool: 5% is more depleted than 10%.
    const big = spool({ remaining_weight: 100, filament: filament({ weight: 2000 }) }); //  5%
    const small = spool({ remaining_weight: 100, filament: filament({ weight: 1000 }) }); // 10%
    expect(lowStockSpools([small, big])).toEqual([big, small]);
  });

  it("ranks three fallback-total spools strictly by ratio (both comparator operands use the fallback)", () => {
    // Three spools, all relying on the filament.weight fallback for their total. Fed in
    // reverse of the expected order so the comparator must recompute *both* operands'
    // denominators from filament.weight — not just the first one — to sort correctly.
    const s1 = spool({ remaining_weight: 100, filament: filament({ weight: 4000 }) }); // 2.5%
    const s2 = spool({ remaining_weight: 100, filament: filament({ weight: 2000 }) }); // 5%
    const s3 = spool({ remaining_weight: 100, filament: filament({ weight: 1000 }) }); // 10%
    expect(lowStockSpools([s3, s2, s1])).toEqual([s1, s2, s3]);
  });

  it("returns only spools from the input (subset invariant)", () => {
    const spools = [
      spool({ initial_weight: 1000, remaining_weight: 10 }),
      spool({ initial_weight: 1000, remaining_weight: 900 }),
    ];
    const result = lowStockSpools(spools);
    result.forEach((s) => expect(spools).toContain(s));
  });
});

describe("recentSpools", () => {
  it("returns most-recently-used first and excludes never-used spools", () => {
    const old = spool({ last_used: "2024-01-01T00:00:00Z" });
    const mid = spool({ last_used: "2024-03-01T00:00:00Z" });
    const recent = spool({ last_used: "2024-06-01T00:00:00Z" });
    const never = spool({});
    const result = recentSpools([old, never, recent, mid]);
    expect(result).toEqual([recent, mid, old]);
  });

  it("caps the list at the given limit (default 5)", () => {
    const many = Array.from({ length: 7 }, (_, i) => spool({ last_used: `2024-06-0${i + 1}T00:00:00Z` }));
    expect(recentSpools(many)).toHaveLength(5);
    expect(recentSpools(many, 2)).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const input = [spool({ last_used: "2024-01-01T00:00:00Z" }), spool({ last_used: "2024-06-01T00:00:00Z" })];
    const snapshot = [...input];
    recentSpools(input);
    expect(input).toEqual(snapshot);
  });
});

describe("materialBreakdown", () => {
  it("groups by material, counts and sums weight, heaviest first", () => {
    const spools = [
      spool({ remaining_weight: 300, filament: filament({ material: "PLA" }) }),
      spool({ remaining_weight: 200, filament: filament({ material: "PLA" }) }),
      spool({ remaining_weight: 900, filament: filament({ material: "PETG" }) }),
    ];
    expect(materialBreakdown(spools)).toEqual([
      ["PETG", { count: 1, weight: 900 }],
      ["PLA", { count: 2, weight: 500 }],
    ]);
  });

  it("buckets spools without a material under 'Unknown'", () => {
    const result = materialBreakdown([spool({ remaining_weight: 100, filament: filament() })]);
    expect(result).toEqual([["Unknown", { count: 1, weight: 100 }]]);
  });

  it("preserves the invariants: counts sum to spool count, weights sum to total", () => {
    const spools = [
      spool({ remaining_weight: 300, filament: filament({ material: "PLA" }) }),
      spool({ initial_weight: 200, filament: filament({ material: "ABS" }) }),
      spool({ filament: filament({ material: "PLA", weight: 400 }) }),
    ];
    const breakdown = materialBreakdown(spools);
    const countSum = breakdown.reduce((n, [, s]) => n + s.count, 0);
    const weightSum = breakdown.reduce((w, [, s]) => w + s.weight, 0);
    expect(countSum).toBe(spools.length);
    expect(weightSum).toBe(totalRemainingWeight(spools));
  });
});

describe("locationBreakdown", () => {
  it("groups by location, most-populated first, with a fallback bucket for empty", () => {
    // Distinct counts (3/2/1) so the descending sort order is actually exercised.
    const spools = [
      spool({ location: "Shelf A" }),
      spool({ location: "Shelf A" }),
      spool({ location: "Shelf A" }),
      spool({ location: "Shelf B" }),
      spool({ location: "" }),
      spool({}),
    ];
    expect(locationBreakdown(spools, "No location")).toEqual([
      ["Shelf A", 3],
      ["No location", 2],
      ["Shelf B", 1],
    ]);
  });

  it("counts sum to the spool count (invariant)", () => {
    const spools = [spool({ location: "A" }), spool({ location: "B" }), spool({ location: "A" })];
    const total = locationBreakdown(spools, "None").reduce((n, [, c]) => n + c, 0);
    expect(total).toBe(spools.length);
  });
});

describe("vendorBreakdown / topVendor", () => {
  it("groups by vendor name (missing -> '?'), most-populated first", () => {
    // Distinct counts (3/2/1) AND an input order that is the reverse of the sorted
    // order, so simply dropping the sort (or a no-op comparator) is caught.
    const spools = [
      spool({ filament: filament({ vendor: vendor("Globex") }) }),
      spool({ filament: filament() }),
      spool({ filament: filament() }),
      spool({ filament: filament({ vendor: vendor("Acme") }) }),
      spool({ filament: filament({ vendor: vendor("Acme") }) }),
      spool({ filament: filament({ vendor: vendor("Acme") }) }),
    ];
    expect(vendorBreakdown(spools)).toEqual([
      ["Acme", 3],
      ["?", 2],
      ["Globex", 1],
    ]);
  });

  it("topVendor picks the busiest vendor, and is '-' for an empty inventory", () => {
    const spools = [
      spool({ filament: filament({ vendor: vendor("Acme") }) }),
      spool({ filament: filament({ vendor: vendor("Globex") }) }),
      spool({ filament: filament({ vendor: vendor("Acme") }) }),
    ];
    expect(topVendor(spools)).toBe("Acme");
    expect(topVendor([])).toBe("-");
  });
});

describe("registeredWithinDays", () => {
  const now = dayjs("2024-06-15T12:00:00Z");

  it("counts spools registered inside the window and excludes older ones", () => {
    const spools = [
      spool({ registered: "2024-06-10T12:00:00Z" }), // 5 days ago → in
      spool({ registered: "2024-01-01T12:00:00Z" }), // months ago → out
    ];
    expect(registeredWithinDays(spools, 30, now)).toBe(1);
  });

  it("treats the exact cutoff as outside the window (strict isAfter)", () => {
    const exactly30 = spool({ registered: now.subtract(30, "day").toISOString() });
    expect(registeredWithinDays([exactly30], 30, now)).toBe(0);
  });

  it("defaults 'now' to the current time when omitted", () => {
    // Exercises the default-parameter branch; empty input keeps it clock-independent.
    expect(registeredWithinDays([], 30)).toBe(0);
    // A spool registered in the far past is never within a 30-day window of "now".
    expect(registeredWithinDays([spool({ registered: "2000-01-01T00:00:00Z" })], 30)).toBe(0);
  });
});

describe("presentation helpers", () => {
  it("getColorHex normalises to a single leading '#' and defaults to grey", () => {
    expect(getColorHex(spool({ filament: filament({ color_hex: "ff8800" }) }))).toBe("#ff8800");
    expect(getColorHex(spool({ filament: filament({ color_hex: "#ff8800" }) }))).toBe("#ff8800");
    expect(getColorHex(spool({ filament: filament() }))).toBe("#555555");
  });

  it("getSpoolName combines vendor and name, falling back to name then id", () => {
    expect(getSpoolName(spool({ filament: filament({ vendor: vendor("Acme"), name: "Red" }) }))).toBe("Acme - Red");
    expect(getSpoolName(spool({ filament: filament({ name: "Red" }) }))).toBe("Red");
    expect(getSpoolName(spool({ filament: filament({ id: 77 }) }))).toBe("77");
  });

  it("getWeightPct clamps to 0–100 and applies the weight fallback", () => {
    expect(getWeightPct(spool({ initial_weight: 1000, remaining_weight: 500 }))).toBe(50);
    // initial_weight takes precedence over filament.weight for the total: 500/1000 = 50%,
    // not 500/500 = 100%. Locks the precedence order of the ?? fallback chain.
    expect(
      getWeightPct(spool({ initial_weight: 1000, remaining_weight: 500, filament: filament({ weight: 500 }) })),
    ).toBe(50);
    expect(getWeightPct(spool({ initial_weight: 1000, remaining_weight: 2000 }))).toBe(100); // clamped
    expect(getWeightPct(spool({ initial_weight: 1000, remaining_weight: 0 }))).toBe(0);
    // No weights → total defaults to DEFAULT_TOTAL_WEIGHT and remaining defaults to total → 100%.
    expect(getWeightPct(spool({ filament: filament() }))).toBe(100);
    expect(DEFAULT_TOTAL_WEIGHT).toBe(1000);
  });
});
