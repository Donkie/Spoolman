import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Locations page rendering journey (TESTING_STRATEGY "Remaining"). The actual
// drag-and-drop is react-dnd HTML5Backend with hover-driven mutation handlers,
// which synthetic Playwright drag events cannot exercise reliably — the move
// itself (PATCH spool location) is covered here at the API level, and the page's
// grouping/rendering of the result is asserted through the UI.

test.describe("locations page", () => {
  test("spools render inside their location container; moving a spool regroups it", async ({ page, request }) => {
    const stamp = Date.now();
    const locA = `E2E Shelf A ${stamp}`;
    const locB = `E2E Shelf B ${stamp}`;
    const fil = await (
      await request.post(`${APP_BASE_URL}/api/v1/filament`, {
        data: { name: `Loc ${stamp}`, density: 1.24, diameter: 1.75, weight: 1000 },
      })
    ).json();
    const spool = await (
      await request.post(`${APP_BASE_URL}/api/v1/spool`, { data: { filament_id: fil.id, location: locA } })
    ).json();

    await page.goto(`${APP_BASE_URL}/locations`);
    const containerA = page.locator(".loc-container").filter({ hasText: locA });
    await expect(containerA).toBeVisible();
    // The seeded spool's card is grouped under its location, and the count badge agrees.
    await expect(containerA.locator(".spool").filter({ hasText: `#${spool.id}` })).toBeVisible();
    await expect(containerA.locator(".loc-spool-count")).toHaveText("1");

    // The move a drag would perform (PATCH location), then the page regroups it.
    const patch = await request.patch(`${APP_BASE_URL}/api/v1/spool/${spool.id}`, { data: { location: locB } });
    expect(patch.ok()).toBeTruthy();
    await page.reload();
    const containerB = page.locator(".loc-container").filter({ hasText: locB });
    await expect(containerB.locator(".spool").filter({ hasText: `#${spool.id}` })).toBeVisible();
    // A may disappear entirely (it only existed via the spool) or linger empty —
    // either way it must not still hold the card.
    await expect(page.locator(".loc-container").filter({ hasText: locA }).locator(".spool")).toHaveCount(0);
  });
});
