import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Error/empty branches (TESTING_STRATEGY "Remaining"): the 3DFP import failure
// toast on the filament create form, and the router-level 404 component.

test.describe("error branches", () => {
  test("3DFP import with a bogus profile id shows the failure message", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/filament/create`);

    // GET /api/v1/external/profile/{id} fails deterministically: the harness sets
    // EXTERNAL_3DFP_URL to loop back to this server, whose SPA fallback returns
    // HTML with no profile in it → backend 404 → the form surfaces the i18n'd
    // error toast. No live traffic to 3dfilamentprofiles.com. (The input sits in
    // a Space.Compact, which breaks the antd label-for association, so it is
    // addressed by placeholder.)
    await page.getByPlaceholder("e.g. 12875").fill("999999999");
    await page.getByRole("button", { name: "Fetch" }).click();
    await expect(page.getByText("Failed to fetch filament data from 3dfilamentprofiles.com")).toBeVisible();
  });

  test("unknown routes render the 404 error component", async ({ page }) => {
    await page.goto(`${APP_BASE_URL}/definitely-not-a-route`);
    await expect(page.getByText("Sorry, the page you visited does not exist.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Back Home/ })).toBeVisible();
  });
});
