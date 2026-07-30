import { test, expect } from "./fixtures";
import { navTab, onlyVisible, openApp, openToolbarMenu, unique } from "./helpers";

/**
 * The settings page. Two different persistence models meet here and the page
 * gives no visual clue which is which, so both need covering:
 *
 * - Currency, price rounding and the base URL are *server* settings (they change
 *   what QR codes encode and how prices read for everyone), written through
 *   `PUT /api/v1/setting/<key>`.
 * - Theme, language and the low-stock threshold are per-browser and live in
 *   localStorage.
 *
 * The extra-fields manager is the third thing on this page, and the most
 * consequential: a field defined here shows up on every entity form, in the
 * library's sort and filter menus, and in the API. It is covered end to end,
 * including the cleanup, because a stray field would change what later runs see.
 */

test("server-backed settings survive a reload", async ({ page }) => {
  await openApp(page);
  await navTab(page, "Settings", "Settings | Spoolman");

  const currency = page.getByLabel("Currency");
  const baseUrl = page.getByLabel("Base URL");
  const roundPrices = page.getByLabel("Round prices");

  // Put everything back afterwards: these are instance-wide, so a leftover
  // currency or base URL would follow into every later test and every rerun.
  const originalCurrency = await currency.inputValue();
  const originalBaseUrl = await baseUrl.inputValue();
  const originalRounding = (await roundPrices.getAttribute("aria-checked")) === "true";

  try {
    await test.step("change them", async () => {
      // Every control saves on change; the page has no save button.
      await currency.fill("SEK");
      await baseUrl.fill("https://spoolman.test");
      await roundPrices.click();
      await expect(roundPrices).toHaveAttribute("aria-checked", String(!originalRounding));
    });

    await test.step("they come back from the server", async () => {
      await page.reload();
      await expect(page.getByLabel("Currency")).toHaveValue("SEK");
      await expect(page.getByLabel("Base URL")).toHaveValue("https://spoolman.test");
      await expect(page.getByLabel("Round prices")).toHaveAttribute("aria-checked", String(!originalRounding));
    });
  } finally {
    await page.getByLabel("Currency").fill(originalCurrency);
    await page.getByLabel("Base URL").fill(originalBaseUrl);
    const toggle = page.getByLabel("Round prices");
    if ((await toggle.getAttribute("aria-checked")) !== String(originalRounding)) await toggle.click();
  }
});

test("the theme choice is a browser preference and is applied before first paint", async ({ page }) => {
  await openApp(page);
  await navTab(page, "Settings", "Settings | Spoolman");

  const themeGroup = page.getByRole("group", { name: "Theme" });

  // The runner's browser reports a light color scheme, so "Dark" is the choice
  // that has to override it — picking "Light" would pass without doing anything.
  await themeGroup.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // The preference is re-applied by the inline script in app.html, which runs
  // before the app bundle: on reload there must be no flash of the wrong theme,
  // and the attribute is already right by the time anything is visible.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await themeGroup.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("an extra field can be added, is offered as a library filter, and can be removed", async ({ page }) => {
  const fieldKey = `test_field_${Date.now().toString(36)}`;
  const fieldName = unique("Bin");

  await openApp(page);
  await navTab(page, "Settings", "Settings | Spoolman");

  await test.step("define a spool text field", async () => {
    // Spools are the entity tab the page opens on.
    await page.getByRole("button", { name: "Add Spool field" }).click();
    await page.getByPlaceholder("lower_snake_case").fill(fieldKey);
    await page.getByPlaceholder("Display name").fill(fieldName);
    await page.getByRole("button", { name: "Save field" }).click();

    // The editor closes and the field joins the table, keyed as typed.
    await expect(page.getByRole("button", { name: "Save field" })).toHaveCount(0);
    await expect(page.getByText(fieldKey, { exact: true })).toBeVisible();
    await expect(page.getByText(fieldName, { exact: true })).toBeVisible();
  });

  await test.step("the library offers it as a filter", async () => {
    // The toolbar builds its filter menu from the same field metadata, so this is
    // the round trip through `GET /api/v1/field/spool` that makes an extra field
    // useful rather than merely stored.
    await navTab(page, "Library", "Library | Spoolman");
    const menu = await openToolbarMenu(page, "Filter");
    await expect(menu.getByRole("button", { name: fieldName, exact: true })).toBeVisible();
    // Close the menu again so it isn't covering the toolbar for the next step.
    await onlyVisible(page.getByRole("button", { name: /^Filter$/ })).click();
    await expect(menu).toBeHidden();
  });

  await test.step("delete it again", async () => {
    await navTab(page, "Settings", "Settings | Spoolman");

    // Deleting a field also deletes its data on every spool, so the UI asks first.
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(fieldName);
      return dialog.accept();
    });
    await page
      .locator(".table .row", { hasText: fieldKey })
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    await expect(page.getByText(fieldKey, { exact: true })).toHaveCount(0);
  });
});
