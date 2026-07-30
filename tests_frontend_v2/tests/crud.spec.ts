import { test, expect } from "./fixtures";
import { createSpoolViaModal, navTab, openApp, unique } from "./helpers";

/**
 * The core happy path a real user walks on first use. client_v2 folds what the
 * legacy client spread over three create forms into one "Add spools" modal: a
 * brand-new manufacturer, filament and spool are all created by a single
 * submit. The flow is driven entirely through the UI — only the initial "open
 * the app" uses a direct URL — and every entity is verified by finding it back
 * in the library afterwards.
 */
test("create a manufacturer, filament and spool through the add-spool modal", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);

  await test.step("fill in a brand-new filament and spool, then submit", async () => {
    await createSpoolViaModal(page, { vendorName, filamentName, locationName, weightG: 1000, usedG: 250 });
  });

  await test.step("find the new spool back in the library", async () => {
    // The library groups by filament, so the new filament becomes a group header
    // showing its name and — as the subtitle — its manufacturer and diameter.
    const groupHeader = page.getByText(filamentName, { exact: true });
    await expect(groupHeader).toBeVisible();
    await expect(page.getByText(`${vendorName} · 1.75 mm`)).toBeVisible();

    // The spool itself renders as a row under that header, showing where it is
    // and how much filament is left (1000 g net minus the 250 g used).
    const spoolRow = page.getByRole("link").filter({ hasText: locationName });
    await expect(spoolRow).toHaveCount(1);
    await expect(spoolRow).toContainText("750");
  });

  await test.step("see the spool's location on the dashboard", async () => {
    // The dashboard groups by location out of the box, so the new location is a card
    // of its own — this is the page the old Locations one became.
    await navTab(page, "Dashboard", "Dashboard | Spoolman");
    await expect(page.getByText(locationName, { exact: true })).toBeVisible();
  });
});
