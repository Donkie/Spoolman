import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";
import { atPath, saveButton } from "../helpers";

// Settings journey: the general settings form is backed by the settings API.

test.describe("settings journey", () => {
  test("general settings: render, edit currency, save", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/settings`);
    const currency = page.getByLabel("Currency");
    await expect(currency).toBeVisible();
    await expect(page.getByLabel("Base URL")).toBeVisible();

    await currency.fill("EUR");
    await saveButton(page).click();

    // The form persists on the settings page with the edited value applied.
    await expect(page).toHaveURL(atPath("/settings"));
    await expect(currency).toHaveValue("EUR");
  });

  test("extra-fields settings page renders for spools", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/settings/extra/spool`);
    await expect(page).toHaveURL(atPath("/settings/extra/spool"));
    await expect(page.getByRole("button").first()).toBeVisible();
  });
});
