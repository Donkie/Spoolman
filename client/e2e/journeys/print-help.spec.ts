import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Printing dialog (label/QR) and the help page.

test.describe("printing + help journeys", () => {
  test("QR/label printing dialog renders for a preselected spool", async ({ page, request }) => {
    const fil = await (
      await request.post(`${APP_BASE_URL}/api/v1/filament`, {
        data: { name: `Print ${Date.now()}`, density: 1.24, diameter: 1.75, weight: 1000 },
      })
    ).json();
    const spool = await (await request.post(`${APP_BASE_URL}/api/v1/spool`, { data: { filament_id: fil.id } })).json();

    // ?spools=<id> jumps straight to the printing dialog (step 1).
    await page.goto(`${APP_BASE_URL}/spool/print?spools=${spool.id}`);
    await expect(page.getByRole("button", { name: /Print/ }).first()).toBeVisible();
  });

  test("help page renders", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/help`);
    await expect(page.getByRole("heading", { name: "Help" }).first()).toBeVisible();
  });
});
