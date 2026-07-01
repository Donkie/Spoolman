import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Locations management page + the new-location modal.

test.describe("locations journey", () => {
  test("renders and opens the new-location modal", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/locations`);
    await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();

    await page.getByRole("button", { name: /New Location/ }).click();
    await expect(page.locator(".ant-modal-content")).toBeVisible();
  });
});
