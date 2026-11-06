import { test, expect } from "./fixtures";
import { createSpoolViaModal, openAddSpoolModal, openApp, searchFor, unique } from "./helpers";
import type { Locator, Page, Route } from "@playwright/test";

// Keep the first local search in flight while the newer request completes.
// Local search has no AbortSignal, so the older response really can arrive late.
async function exerciseRace(page: Page, openDialog: () => Promise<Locator>) {
  let releaseOld!: () => void;
  let oldArrived!: () => void;
  let oldDelivered!: () => void;
  let releaseClosing: (() => void) | undefined;
  const oldHeld = new Promise<void>((resolve) => { oldArrived = resolve; });
  const oldFinished = new Promise<void>((resolve) => { oldDelivered = resolve; });
  const gate = new Promise<void>((resolve) => { releaseOld = resolve; });
  const oldQuery = "race-old-unique";
  const newQuery = "race-new-unique";
  const result = (name: string, id: number) => ({
    spools: [], vendors: [], is_color_query: false,
    filaments: [{ filament: { id, name, material: "PLA", weight: 1000 }, spools: [] }],
  });
  const routeSearch = async (route: Route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === oldQuery) {
      oldArrived();
      await gate;
      await route.fulfill({ json: result("Old race result", 991001) });
      oldDelivered();
    } else if (query === newQuery) {
      await route.fulfill({ json: result("New race result", 991002) });
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/v1/search?*", routeSearch);
  // Keep external catalog results deterministic and independent of the network.
  await page.route("**/api/v1/external/filament/search?*", (route) => route.fulfill({ json: [] }));
  try {
    let dialog = await openDialog();
    await dialog.locator("input.search-big").fill(oldQuery);
    await oldHeld;
    await dialog.locator("input.search-big").fill(newQuery);
    await expect(dialog.locator(".res-item").filter({ hasText: "New race result" })).toBeVisible();
    releaseOld();
    await oldFinished;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(dialog.locator(".res-item").filter({ hasText: "Old race result" })).toHaveCount(0);
    await expect(dialog.locator(".res-item").filter({ hasText: "New race result" })).toBeVisible();

    // A different pending query must also be invalidated when the dialog closes.
    let closingArrived!: () => void;
    let closingDelivered!: () => void;
    const closingHeld = new Promise<void>((resolve) => { closingArrived = resolve; });
    const closingFinished = new Promise<void>((resolve) => { closingDelivered = resolve; });
    const closingGate = new Promise<void>((resolve) => { releaseClosing = resolve; });
    await page.route("**/api/v1/search?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("q") !== "race-close-unique") return route.fallback();
      closingArrived();
      await closingGate;
      await route.fulfill({ json: result("Closed race result", 991003) });
      closingDelivered();
    });
    await dialog.locator("input.search-big").fill("race-close-unique");
    await closingHeld;
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    dialog = await openDialog();
    await dialog.locator("input.search-big").fill(newQuery);
    await expect(dialog.locator(".res-item").filter({ hasText: "New race result" })).toBeVisible();
    releaseClosing!();
    await closingFinished;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(dialog.locator(".res-item").filter({ hasText: "Closed race result" })).toHaveCount(0);
    await expect(dialog.locator(".res-item").filter({ hasText: "New race result" })).toBeVisible();
  } finally {
    releaseOld();
    releaseClosing?.();
  }
}

test("add-spool search ignores late results and results from a closed dialog", async ({ page }) => {
  await openApp(page);
  await exerciseRace(page, () => openAddSpoolModal(page));
});

test("change-filament search ignores late results and results from a closed dialog", async ({ page }) => {
  await openApp(page);
  const locationName = unique("RaceShelf");
  await createSpoolViaModal(page, { vendorName: unique("RaceVendor"), filamentName: unique("RaceFilament"), locationName });
  const panel = await searchFor(page, locationName);
  await panel.getByRole("link").filter({ hasText: locationName }).first().click();
  const openDialog = async () => {
    await page.locator(".insp").getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  };
  await exerciseRace(page, openDialog);
});
