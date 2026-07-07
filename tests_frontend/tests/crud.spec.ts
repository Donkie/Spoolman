import { test, expect } from "./fixtures";
import {
  clickCreate,
  fillAntdNumberByLabel,
  navSidebar,
  openApp,
  selectAntdOption,
  unique,
} from "./helpers";

/**
 * Core happy path a real user walks on first use: create a manufacturer
 * (vendor), a filament under it, and a spool of that filament. The whole flow
 * runs in one session and is driven entirely through the UI — the sidebar to
 * reach each list, the list's "Create" button to reach each form — so it also
 * verifies the app is navigable by buttons alone. Each entity is verified by
 * finding it back on its list page.
 */
test("create a vendor, filament and spool through the UI", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");

  await openApp(page);

  await test.step("create a manufacturer (vendor)", async () => {
    await navSidebar(page, "/vendor");
    await clickCreate(page, "/vendor");
    await page.getByLabel("Name", { exact: true }).fill(vendorName);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Saving redirects to the vendor list, where the new manufacturer is shown.
    await expect.poll(() => new URL(page.url()).pathname).toBe("/vendor");
    await expect(page.getByText(vendorName)).toBeVisible();
  });

  await test.step("create a filament under that manufacturer", async () => {
    await navSidebar(page, "/filament");
    await clickCreate(page, "/filament");
    await page.getByLabel("Name", { exact: true }).fill(filamentName);
    await selectAntdOption(page, "Manufacturer", vendorName);
    await page.getByLabel("Material").fill("PLA");
    await page.getByLabel("Density").fill("1.24");
    await page.getByLabel("Diameter").fill("1.75");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/filament");
    await expect(page.getByText(filamentName)).toBeVisible();
  });

  await test.step("create a spool of that filament", async () => {
    await navSidebar(page, "/spool");
    await clickCreate(page, "/spool");
    // The filament select option text embeds the filament name.
    await selectAntdOption(page, "Filament", filamentName);
    // "Used Weight" is the default weight-entry mode and is always enabled.
    await fillAntdNumberByLabel(page, "Used Weight", "250");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The spool's row shows its filament's name. Scope to the table row rather
    // than any text, since the list also has a filament filter that echoes it.
    await expect.poll(() => new URL(page.url()).pathname).toBe("/spool");
    await expect(page.getByRole("row").filter({ hasText: filamentName })).toBeVisible();
  });
});
