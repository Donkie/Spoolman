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

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Material").fill("PLA");
    await page.getByLabel("Density").fill("1.24");
    await page.getByLabel("Diameter").fill("1.75");
    await page.getByLabel("Weight").first().fill("1000");
    const id = await saveAndGetId(page, "filament");
    await expect(page).toHaveURL(atPath("/filament"));

    // Show
    await page.goto(`${APP_BASE_URL}/filament/show/${id}`);
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    // Edit → change material
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(atPath(`/filament/edit/${id}`));
    await page.getByLabel("Material").fill("PETG");
    await saveButton(page).click();
    await expect(page).toHaveURL(atPath("/filament"));

    // Clone
    await page.goto(`${APP_BASE_URL}/filament/clone/${id}`);
    await page.getByLabel("Name").fill(`${name} Clone`);
    const cloneId = await saveAndGetId(page, "filament");
    expect(cloneId).not.toBe(id);
  });
});
