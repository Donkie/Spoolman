import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";
import { atPath, saveAndGetId, saveButton } from "../helpers";

// Whole-app journey against the REAL backend (API + temp SQLite). Vendors are
// labelled "Manufacturer" in the UI. The created id is read from the POST response
// so show/edit/clone navigate deterministically regardless of list sort/pagination.

test.describe("vendor (manufacturer) journey", () => {
  test("create → show → edit → clone", async ({ page }) => {
    const name = `Acme ${Date.now()}`;

    // List renders, then Create
    await page.goto(`${APP_BASE_URL}/vendor`);
    await expect(page.getByRole("heading", { name: "Manufacturers" })).toBeVisible();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(atPath("/vendor/create"));

    // Fill and save; capture the new id from the create request
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Comment").fill("made in e2e");
    await page.getByLabel("Empty Spool Weight").fill("120");
    const id = await saveAndGetId(page, "vendor");
    await expect(page).toHaveURL(atPath("/vendor"));

    // Show page renders the created record
    await page.goto(`${APP_BASE_URL}/vendor/show/${id}`);
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
    await expect(page.getByText("120")).toBeVisible();

    // Edit (header button on the show page) → change the empty spool weight
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(atPath(`/vendor/edit/${id}`));
    await page.getByLabel("Empty Spool Weight").fill("240");
    await saveButton(page).click();
    await expect(page).toHaveURL(atPath("/vendor"));

    // Clone into a new manufacturer
    const cloneName = `${name} Clone`;
    await page.goto(`${APP_BASE_URL}/vendor/clone/${id}`);
    await page.getByLabel("Name").fill(cloneName);
    const cloneId = await saveAndGetId(page, "vendor");
    expect(cloneId).not.toBe(id);
    await expect(page).toHaveURL(atPath("/vendor"));
  });
});
