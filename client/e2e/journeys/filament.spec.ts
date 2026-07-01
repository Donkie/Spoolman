import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";
import { atPath, saveAndGetId, saveButton } from "../helpers";

// Filament CRUD journey through the UI. Only density + diameter are required.

test.describe("filament journey", () => {
  test("create → show → edit → clone", async ({ page }) => {
    const name = `PLA ${Date.now()}`;

    await page.goto(`${APP_BASE_URL}/filament`);
    await expect(page.getByRole("heading", { name: "Filaments" })).toBeVisible();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(atPath("/filament/create"));

    // Role-based locators: after the Create click the list (with its sortable
    // <th aria-label="Name">) is still mounted while the create chunk loads, so
    // getByLabel can grab the header cell — same flake as vendor.spec.
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("textbox", { name: "Material" }).fill("PLA");
    await page.getByRole("spinbutton", { name: "Density" }).fill("1.24");
    await page.getByRole("spinbutton", { name: "Diameter" }).fill("1.75");
    await page.getByRole("spinbutton", { name: "Weight" }).first().fill("1000");
    const id = await saveAndGetId(page, "filament");
    await expect(page).toHaveURL(atPath("/filament"));

    // Show
    await page.goto(`${APP_BASE_URL}/filament/show/${id}`);
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    // Edit → change material
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(atPath(`/filament/edit/${id}`));
    await page.getByRole("textbox", { name: "Material" }).fill("PETG");
    await saveButton(page).click();
    await expect(page).toHaveURL(atPath("/filament"));

    // Clone
    await page.goto(`${APP_BASE_URL}/filament/clone/${id}`);
    await page.getByRole("textbox", { name: "Name" }).fill(`${name} Clone`);
    const cloneId = await saveAndGetId(page, "filament");
    expect(cloneId).not.toBe(id);
  });
});
