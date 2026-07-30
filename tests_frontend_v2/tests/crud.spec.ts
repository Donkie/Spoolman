import { test, expect } from "./fixtures";
import { navTab, numberField, openAddSpoolModal, openApp, unique } from "./helpers";

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

  await test.step("fill in a brand-new filament", async () => {
    const dialog = await openAddSpoolModal(page);

    // Step 1 offers the local catalog and SpoolmanDB; we take the third path and
    // describe a filament that exists in neither.
    await dialog.getByRole("button", { name: /^Create a new filament/ }).click();

    // The new-filament fields have no label/input association usable by
    // getByLabel (the <label> wraps a custom Combobox and hint text), so they are
    // located by their placeholders.
    await dialog.getByPlaceholder("e.g. Polymaker").fill(vendorName);
    await dialog.getByPlaceholder("e.g. PolyTerra Matte Sage").fill(filamentName);
    await dialog.getByPlaceholder("PLA", { exact: true }).fill("PLA");

    // A manufacturer that doesn't exist yet is created along with the filament.
    await expect(dialog.getByText(`New manufacturer “${vendorName}” will be created`)).toBeVisible();

    // Density is required. Picking a known material auto-fills it from
    // SpoolmanDB's material list, but the tests must not depend on that external
    // lookup, so set it explicitly under "Advanced specs".
    await dialog.getByRole("button", { name: /^Advanced specs/ }).click();
    await numberField(dialog, "Density").fill("1.24");
    await expect(numberField(dialog, "Diameter")).toHaveValue("1.75");
  });

  await test.step("fill in the spool details and submit", async () => {
    const dialog = page.getByRole("dialog");

    await expect(numberField(dialog, "Count")).toHaveValue("1");
    await numberField(dialog, "Weight").fill("1000");
    await dialog.getByPlaceholder("e.g. Shelf A").fill(locationName);

    // "Full" is the default fill level; switch to entering how much has already
    // been used. Its input is the only one in the modal with a "0" placeholder.
    await dialog.getByRole("button", { name: "Used Weight", exact: true }).click();
    await dialog.getByPlaceholder("0", { exact: true }).fill("250");

    await dialog.getByRole("button", { name: "Add 1 spool", exact: true }).click();

    // A successful submit closes the modal.
    await expect(dialog).toBeHidden();
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
