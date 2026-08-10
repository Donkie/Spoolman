import { test, expect } from "./fixtures";
import {
  createSpoolViaModal,
  navTab,
  numberField,
  openAddSpoolModal,
  openApp,
  searchFor,
  unique,
  weightPresets,
} from "./helpers";

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

/**
 * Nearly every spool is one of a handful of roll sizes, so the weight field
 * offers them as one-click shortcuts rather than making everyone type four
 * digits (#1051). The picked size has to reach the created spool, and the row
 * has to keep saying which size is currently in the field.
 */
test("a roll size can be picked from the weight field's shortcuts", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);

  const dialog = await openAddSpoolModal(page);
  await dialog.getByRole("button", { name: /^Create a new filament/ }).click();
  const presets = weightPresets(dialog);

  await test.step("the row reflects the weight the field starts on", async () => {
    // A new filament starts at the size that dominates the catalog, so that
    // shortcut — and only it — is marked as the one in play.
    await expect(numberField(dialog, "Weight")).toHaveValue("1000");
    await expect(presets.getByRole("button", { name: "1 kg", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(presets.getByRole("button", { name: "500 g", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  await test.step("typing a size of its own leaves no shortcut marked", async () => {
    await numberField(dialog, "Weight").fill("1234");
    await expect(presets.getByRole("button", { name: "1 kg", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  await test.step("clicking a shortcut creates the spool at that size", async () => {
    // Start over from a clean modal — the checks above left a made-up weight in
    // the field — and go through it with the weight set only by the click, so
    // the library row proves the picked size was what got submitted.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await createSpoolViaModal(page, {
      vendorName,
      filamentName,
      locationName,
      weightG: 500,
      weightPreset: "500 g",
    });

    const spoolRow = page.getByRole("link").filter({ hasText: locationName });
    await expect(spoolRow).toHaveCount(1);
    await expect(spoolRow).toContainText("500");
  });
});

/**
 * Extra fields defined for filaments have to be fillable *while* the filament is
 * being created, not only afterwards in the inspector — the add-spool modal is
 * the only filament create form client_v2 has (#988).
 */
test("a filament's extra fields can be filled in while creating it", async ({ page }) => {
  const fieldKey = `test_fil_field_${Date.now().toString(36)}`;
  const fieldName = unique("Batch");
  const fieldValue = unique("Lot");
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);

  try {
    await test.step("define a filament text field", async () => {
      await navTab(page, "Settings", "Settings | Spoolman");
      // The manager opens on the spool tab; each entity has its own field list.
      await page.locator(".tabs").getByRole("button", { name: "Filament", exact: true }).click();
      await page.getByRole("button", { name: "Add Filament field" }).click();
      await page.getByPlaceholder("lower_snake_case").fill(fieldKey);
      await page.getByPlaceholder("Display name").fill(fieldName);
      await page.getByRole("button", { name: "Save field" }).click();
      await expect(page.getByText(fieldKey, { exact: true })).toBeVisible();
    });

    await test.step("fill it in on the new-filament form", async () => {
      await navTab(page, "Library", "Library | Spoolman");
      await createSpoolViaModal(page, {
        vendorName,
        filamentName,
        locationName,
        filamentExtra: { [fieldName]: fieldValue },
      });
    });

    await test.step("the value is on the created filament", async () => {
      // Straight from the API on a fresh view of the filament, so this proves the
      // value was sent with the create rather than merely typed into the form.
      const panel = await searchFor(page, filamentName);
      await panel.getByRole("link").filter({ hasText: filamentName }).first().click();
      await expect(page).toHaveURL(/[?&]sel=filament(:|%3A)\d+/);
      await expect(page.getByLabel(fieldName, { exact: true })).toHaveValue(fieldValue);
    });
  } finally {
    // Field definitions are instance-wide, so this one has to go whatever happened
    // above — otherwise every later spec sees an extra section in the modal.
    await navTab(page, "Settings", "Settings | Spoolman");
    await page.locator(".tabs").getByRole("button", { name: "Filament", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".table .row", { hasText: fieldKey })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByText(fieldKey, { exact: true })).toHaveCount(0);
  }
});
