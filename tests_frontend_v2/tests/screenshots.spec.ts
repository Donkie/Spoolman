import { argosScreenshot } from "@argos-ci/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { expectAppShell } from "./helpers";

/**
 * Visual snapshots of the main pages, uploaded to Argos CI (argos-ci.com) which
 * diffs them against master and posts the changed ones on the pull request.
 *
 * Runs as its own Playwright project, before the functional specs, against an
 * empty database: it seeds a fixed dataset so ids, names and numbers come out
 * the same every run. Any drift between runs shows up as a false diff, so keep
 * the seed free of anything time- or order-dependent.
 *
 * Without CI set the reporter does not upload; the images land in
 * ./screenshots/ for a local look.
 */

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

// Fixed timestamps so "last used" style fields never depend on when CI ran.
const USED_AT = "2025-01-15T12:00:00Z";

async function post<T = { id: number }>(request: APIRequestContext, path: string, data: object): Promise<T> {
  const res = await request.post(`/api/v1/${path}`, { data });
  expect(res.ok(), `POST ${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function seed(request: APIRequestContext): Promise<void> {
  const prusa = await post(request, "vendor", { name: "Prusament", empty_spool_weight: 193 });
  const polymaker = await post(request, "vendor", { name: "Polymaker", empty_spool_weight: 140 });

  const filaments = [
    { vendor_id: prusa.id, name: "Galaxy Black", material: "PLA", color_hex: "1A1A1A", density: 1.24 },
    { vendor_id: prusa.id, name: "Jet Orange", material: "PETG", color_hex: "F26722", density: 1.27 },
    { vendor_id: polymaker.id, name: "PolyTerra Sakura Pink", material: "PLA", color_hex: "F4A7B9", density: 1.24 },
    { vendor_id: polymaker.id, name: "PolyLite Teal", material: "ABS", color_hex: "008080", density: 1.04 },
    {
      vendor_id: polymaker.id,
      name: "Dual Silk Sunrise",
      material: "PLA",
      multi_color_hexes: "FFD700,C0392B",
      multi_color_direction: "coaxial",
      density: 1.24,
    },
  ];

  const ids: number[] = [];
  for (const f of filaments) {
    ids.push((await post(request, "filament", { diameter: 1.75, weight: 1000, ...f })).id);
  }

  const spools = [
    { filament_id: ids[0], used_weight: 0, location: "Shelf A" },
    { filament_id: ids[0], used_weight: 640, location: "Printer 1", first_used: USED_AT, last_used: USED_AT },
    { filament_id: ids[1], used_weight: 120, location: "Shelf A", first_used: USED_AT, last_used: USED_AT },
    { filament_id: ids[2], used_weight: 910, location: "Dry box", first_used: USED_AT, last_used: USED_AT },
    { filament_id: ids[3], used_weight: 0, location: "Shelf B" },
    { filament_id: ids[4], used_weight: 300, location: "Printer 2", first_used: USED_AT, last_used: USED_AT },
  ];
  for (const s of spools) await post(request, "spool", s);
}

async function snap(page: Page, name: string): Promise<void> {
  // "Registered" is the server-side creation time, which the API can't set, so
  // it would change every day. Blank out its value (Field renders the label as a
  // `.k` cell with the value as its next sibling).
  await page.evaluate(() => {
    document.querySelectorAll(".k").forEach((k) => {
      if (k.textContent?.trim() === "Registered") {
        k.nextElementSibling?.setAttribute("data-visual-test", "transparent");
      }
    });
  });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await argosScreenshot(page, `${name} (${colorScheme})`, { viewports: VIEWPORTS });
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await seed(request);
});

const PAGES = [
  { path: "/", name: "library" },
  { path: "/dashboard", name: "dashboard" },
  { path: "/labels", name: "labels" },
  { path: "/settings", name: "settings" },
  { path: "/filament/show/1", name: "filament detail" },
  { path: "/spool/show/2", name: "spool detail" },
];

for (const { path, name } of PAGES) {
  test(`screenshot: ${name}`, async ({ page }) => {
    await page.goto(path);
    await expectAppShell(page);
    await snap(page, name);
  });
}
