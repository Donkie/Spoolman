import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Exercises the spool list's header controls (the biggest list component): archived
// toggle, clear filters, and the columns dropdown.

test.describe("spool list interactions", () => {
  test("archived toggle, clear filters, columns dropdown", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/spool`);
    await expect(page.getByRole("heading", { name: "Spools" })).toBeVisible();

    // Toggle archived visibility on and back off.
    await page.getByRole("button", { name: /Archived/ }).click();
    await page.getByRole("button", { name: /Archived/ }).click();

    // Clear filters resets the table state.
    await page.getByRole("button", { name: "Clear Filters" }).click();

    // Columns dropdown opens its menu.
    await page.getByRole("button", { name: /Columns/ }).click();
    await expect(page.locator(".ant-dropdown").first()).toBeVisible();
  });
});
