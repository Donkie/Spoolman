import { test, expect } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

test("vendor tare stays blank, zero, and cleared across reloads", async ({ page }) => {
  const vendorName = unique("TareVendor");
  await openApp(page);
  await createSpoolViaModal(page, {
    vendorName, filamentName: unique("TareFilament"), locationName: unique("TareShelf"),
  });
  const results = await searchFor(page, vendorName);
  await results.locator('a[href*="sel=vendor"]').filter({ hasText: vendorName }).first().click();
  await expect(page).toHaveURL(/[?&]sel=vendor(:|%3A)\d+/);
  const tare = page.locator(".insp").getByRole("textbox", { name: "Empty Spool Weight" });
  await expect(tare).toHaveValue("");
  await page.reload();
  await expect(tare).toHaveValue("");

  for (const value of ["0", "250", ""]) {
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/vendor/"));
    await tare.fill(value);
    await tare.blur();
    expect((await saved).ok()).toBeTruthy();
    await page.reload();
    await expect(tare).toHaveValue(value);
  }
});
