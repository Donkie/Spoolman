import { test, expect } from "./fixtures";
import {
  expectAppShell,
  navTab,
  numberField,
  openAddSpoolModal,
  openApp,
  searchFor,
  unique,
} from "./helpers";

/**
 * Every number in Spoolman — weights, diameters, densities, temperatures, prices —
 * is typed into the same numeric input. Two things about it are easy to break and
 * invisible until a user in a comma-decimal locale hits them:
 *
 *  - "1,24" has to mean 1.24, not 124 and not "nothing at all",
 *  - and letters must never make it into a field that will be sent as a number.
 *
 * The fields are text inputs (not `type="number"`) precisely so both hold, so the
 * assertions below type with real key events rather than `fill()`, which would set
 * the value straight onto the element and skip the keystroke filter entirely.
 */

test("a decimal comma is accepted everywhere a number is typed", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);

  await test.step("describe a filament using comma decimals", async () => {
    const dialog = await openAddSpoolModal(page);
    await dialog.getByRole("button", { name: /^Create a new filament/ }).click();
    await dialog.getByPlaceholder("e.g. Polymaker").fill(vendorName);
    await dialog.getByPlaceholder("e.g. PolyTerra Matte Sage").fill(filamentName);
    await dialog.getByPlaceholder("PLA", { exact: true }).fill("PLA");

    await dialog.getByRole("button", { name: /^Advanced specs/ }).click();
    // Density is pre-filled from the material's SpoolmanDB entry, so clear it first.
    const density = numberField(dialog, "Density");
    await density.fill("");
    await density.pressSequentially("1,24");
    // The separator the user typed stays on screen; only what's sent is canonical.
    await expect(density).toHaveValue("1,24");

    const diameter = numberField(dialog, "Diameter");
    await diameter.fill("");
    await diameter.pressSequentially("1,75");
    await expect(diameter).toHaveValue("1,75");

    const weight = numberField(dialog, "Weight");
    await weight.fill("");
    await weight.pressSequentially("1000,5");

    await dialog.getByPlaceholder("e.g. Shelf A").fill(locationName);

    // A field that had been read as empty or as 124 would block the submit here:
    // density is required and must be > 0, and the weight must not exceed it.
    await dialog.getByRole("button", { name: "Add 1 spool", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("the values were stored as decimals, not as whole numbers", async () => {
    // The group subtitle comes back from the API, so 1,75 mm survived the round trip.
    await expect(page.getByText(`${vendorName} · 1.75 mm`)).toBeVisible();

    const panel = await searchFor(page, filamentName);
    await panel.getByRole("link").filter({ hasText: filamentName }).first().click();
    await expect(page).toHaveURL(/[?&]sel=filament(:|%3A)\d+/);

    // Numeric fields are textboxes now that they are no longer type="number".
    await expect(page.getByRole("textbox", { name: "Density" })).toHaveValue("1.24");
    await expect(page.getByRole("textbox", { name: "Diameter" })).toHaveValue("1.75");
    await expect(page.getByRole("textbox", { name: "Weight", exact: true })).toHaveValue("1000.5");
  });
});

test("numeric fields refuse anything that isn't part of a number", async ({ page }) => {
  await openApp(page);
  const dialog = await openAddSpoolModal(page);
  await dialog.getByRole("button", { name: /^Create a new filament/ }).click();

  const weight = numberField(dialog, "Weight");

  await test.step("letters and exponents are dropped as they are typed", async () => {
    // Filtering happens per keystroke, so the digits around the rejected ones are
    // still accepted — what matters is that none of "e", "x" or "g" gets in.
    await weight.fill("");
    await weight.pressSequentially("1e2x5g");
    await expect(weight).toHaveValue("125");
  });

  await test.step("only the first decimal separator is taken", async () => {
    await weight.fill("");
    await weight.pressSequentially("1,5.5");
    await expect(weight).toHaveValue("1,55");
  });

  await test.step("a minus is refused where negatives make no sense", async () => {
    await weight.fill("");
    await weight.pressSequentially("-5");
    await expect(weight).toHaveValue("5");
  });

  await test.step("the arrow keys still step the value", async () => {
    const count = numberField(dialog, "Count");
    await count.click();
    await count.press("ArrowUp");
    await expect(count).toHaveValue("2");
    await count.press("ArrowDown");
    await expect(count).toHaveValue("1");
    // Steps stop at the field's minimum rather than running past it.
    await count.press("ArrowDown");
    await expect(count).toHaveValue("1");
  });

  await dialog.getByRole("button", { name: "Close" }).click();
});

test("a comma typed into an extra field is stored as a decimal", async ({ page }) => {
  const fieldKey = `test_num_field_${Date.now().toString(36)}`;
  const fieldName = unique("Shore");
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);

  try {
    await test.step("define a decimal extra field for spools", async () => {
      await navTab(page, "Settings", "Settings | Spoolman");
      await page.getByRole("button", { name: "Add Spool field" }).click();
      await page.getByPlaceholder("lower_snake_case").fill(fieldKey);
      await page.getByPlaceholder("Display name").fill(fieldName);
      await page.getByRole("combobox", { name: "Type" }).selectOption("float");
      await page.getByRole("button", { name: "Save field" }).click();
      await expect(page.getByText(fieldKey, { exact: true })).toBeVisible();
    });

    await test.step("type a comma decimal into it on a spool", async () => {
      await navTab(page, "Library", "Library | Spoolman");
      const dialog = await openAddSpoolModal(page);
      await dialog.getByRole("button", { name: /^Create a new filament/ }).click();
      await dialog.getByPlaceholder("e.g. Polymaker").fill(vendorName);
      await dialog.getByPlaceholder("e.g. PolyTerra Matte Sage").fill(filamentName);
      await dialog.getByPlaceholder("PLA", { exact: true }).fill("PLA");
      await dialog.getByRole("button", { name: /^Advanced specs/ }).click();
      await numberField(dialog, "Density").fill("1.24");
      await numberField(dialog, "Weight").fill("1000");
      await dialog.getByPlaceholder("e.g. Shelf A").fill(locationName);

      const extra = dialog.getByLabel(fieldName, { exact: true });
      await extra.click();
      await extra.pressSequentially("2,5");
      await expect(extra).toHaveValue("2,5");

      await dialog.getByRole("button", { name: "Add 1 spool", exact: true }).click();
      await expect(dialog).toBeHidden();
    });

    await test.step("the spool came back from the API holding 2.5", async () => {
      const spoolRow = page.getByRole("link").filter({ hasText: locationName });
      await spoolRow.first().click();
      await expect(page.getByLabel(fieldName, { exact: true })).toHaveValue("2.5");
    });
  } finally {
    // Deleting a field takes its data with it, so the UI asks first.
    await navTab(page, "Settings", "Settings | Spoolman");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".table .row", { hasText: fieldKey })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByText(fieldKey, { exact: true })).toHaveCount(0);
  }
});

/**
 * The low-stock threshold is the one numeric field outside the add modal and the
 * inspectors — it lives on the settings page, is stored in localStorage rather
 * than on the server, and keeps its own draft of what was typed.
 */
test("the low-stock threshold takes a comma decimal and keeps it over a reload", async ({ page }) => {
  await openApp(page);
  await navTab(page, "Settings", "Settings | Spoolman");

  const threshold = page.getByRole("textbox", { name: "Low-stock threshold" });
  await threshold.fill("");
  await threshold.pressSequentially("12abc,5");
  await expect(threshold).toHaveValue("12,5");

  await page.reload();
  await expectAppShell(page);
  // Stored canonically, so it comes back as 12.5 rather than 125 or 0.
  await expect(page.getByRole("textbox", { name: "Low-stock threshold" })).toHaveValue("12.5");
});
