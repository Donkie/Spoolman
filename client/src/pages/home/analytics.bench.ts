import { bench, describe } from "vitest";
import { IFilament } from "../filaments/model";
import { ISpool } from "../spools/model";
import {
  lowStockSpools,
  materialBreakdown,
  locationBreakdown,
  recentSpools,
  registeredWithinDays,
  totalRemainingWeight,
  totalValue,
  vendorBreakdown,
} from "./analytics";

// Scale check for the client-side dashboard aggregation (FORK_ASSESSMENT P2 #17):
// the home page runs every function below over the full spool list on each render.
// Run with `npm run bench`. Not part of the regular test suite.

const MATERIALS = ["PLA", "PETG", "ABS", "ASA", "TPU", "PC", "Nylon"];
const LOCATIONS = ["Shelf A", "Shelf B", "Dry box 1", "Dry box 2", "Printer", ""];
const VENDORS = ["Prusament", "Polymaker", "eSun", "Sunlu", "Bambu Lab", "3D-Fuel"];

// Deterministic pseudo-random generator so runs are comparable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeInventory(count: number): ISpool[] {
  const rand = mulberry32(42);
  const spools: ISpool[] = [];
  for (let i = 0; i < count; i++) {
    const filament: IFilament = {
      id: i % 500,
      registered: "2024-01-01",
      density: 1.24,
      diameter: 1.75,
      weight: 1000,
      material: MATERIALS[i % MATERIALS.length],
      color_hex: "ff8800",
      vendor: {
        id: i % VENDORS.length,
        registered: "2024-01-01",
        name: VENDORS[i % VENDORS.length],
        extra: {},
      },
      extra: {},
    };
    const initial = 500 + Math.floor(rand() * 1500);
    spools.push({
      id: i,
      registered: `2026-0${1 + (i % 6)}-15T12:00:00Z`,
      last_used: rand() > 0.3 ? `2026-06-${1 + (i % 28)}T12:00:00Z` : undefined,
      filament,
      price: rand() > 0.5 ? 20 + rand() * 30 : undefined,
      initial_weight: initial,
      remaining_weight: Math.floor(rand() * initial),
      used_weight: 0,
      used_length: 0,
      location: LOCATIONS[i % LOCATIONS.length],
      archived: false,
      extra: {},
    });
  }
  return spools;
}

for (const size of [1_000, 5_000, 10_000]) {
  const inventory = makeInventory(size);
  describe(`dashboard aggregation over ${size} spools`, () => {
    bench("all home-page aggregations combined", () => {
      totalRemainingWeight(inventory);
      totalValue(inventory);
      lowStockSpools(inventory);
      recentSpools(inventory);
      materialBreakdown(inventory);
      locationBreakdown(inventory, "No location");
      vendorBreakdown(inventory);
      registeredWithinDays(inventory, 30);
    });
    bench("lowStockSpools (filter + sort)", () => {
      lowStockSpools(inventory);
    });
    bench("recentSpools (dayjs-parse heavy)", () => {
      recentSpools(inventory);
    });
  });
}
