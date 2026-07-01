import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Home dashboard journey. Seed a filament + a low-stock spool through the API so the
// dashboard (KPIs, low-stock, breakdowns) renders instead of the empty-hero state.

test.describe("home dashboard journey", () => {
  test("renders KPI cards and breakdowns when there are spools", async ({ page, request }) => {
    const fil = await (
      await request.post(`${APP_BASE_URL}/api/v1/filament`, {
        data: { name: `Home ${Date.now()}`, material: "PLA", density: 1.24, diameter: 1.75, weight: 1000 },
      })
    ).json();
    const spoolRes = await request.post(`${APP_BASE_URL}/api/v1/spool`, {
      data: { filament_id: fil.id, initial_weight: 1000, used_weight: 950, location: "Shelf Z" },
    });
    expect(spoolRes.ok()).toBeTruthy();

    await page.goto(`${APP_BASE_URL}/`);

    // Dashboard markers prove the KPI/breakdown view rendered (not the empty-hero).
    await expect(page.getByText(/total stock/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recently Used" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "By Location" })).toBeVisible();
  });
});
