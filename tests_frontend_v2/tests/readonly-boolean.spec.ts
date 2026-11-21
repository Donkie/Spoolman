import { test, expect } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

test("the spool's readonly filament field distinguishes unset, false and true", async ({ page }) => {
  const key = `readonly_bool_${Date.now().toString(36)}`;
  const name = unique("Readonly Boolean");
  const locationName = unique("Readonly Shelf");
  const created = await page.request.post(`/api/v1/field/filament/${key}`, {
    data: { name, field_type: "boolean" },
  });
  expect(created.ok()).toBeTruthy();
  try {
    await openApp(page);
    await createSpoolViaModal(page, {
      vendorName: unique("Readonly Vendor"), filamentName: unique("Readonly Filament"), locationName,
    });
    const spools = await (await page.request.get("/api/v1/spool")).json();
    const spool = spools.find((item: { location: string }) => item.location === locationName);
    expect(spool).toBeTruthy();
    const panel = await searchFor(page, locationName);
    await panel.getByRole("link").filter({ hasText: locationName }).first().click();
    const readonlyValue = page.locator(".insp .k").filter({ hasText: name }).locator("xpath=following-sibling::*[1]");
    await expect(readonlyValue).toHaveText("—");
    await expect(readonlyValue.getByRole("switch")).toHaveCount(0);

    for (const [wireValue, display] of [["false", "No"], ["true", "Yes"]] as const) {
      const updated = await page.request.patch(`/api/v1/filament/${spool.filament.id}`, {
        data: { extra: { [key]: wireValue } },
      });
      expect(updated.ok()).toBeTruthy();
      await page.reload();
      await expect(readonlyValue).toHaveText(display);
      await expect(readonlyValue.getByRole("switch")).toHaveCount(0);
    }
  } finally {
    const removed = await page.request.delete(`/api/v1/field/filament/${key}`);
    expect(removed.ok()).toBeTruthy();
  }
});
