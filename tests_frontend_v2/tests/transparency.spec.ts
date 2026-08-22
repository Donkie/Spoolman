import { test, expect } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

/**
 * Translucent filaments (#1059). The legacy client could set a filament's alpha
 * channel and client_v2 could not, even though the API and the database have
 * stored an 8-digit #RRGGBBAA code since the "color_hex alpha" migration. The
 * inspector's colour editor now has an opacity control per colour, and the
 * alpha has to survive the whole round trip: editor → PATCH → reload.
 */
test("a filament's colour can be made translucent, and stays translucent", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);
  await createSpoolViaModal(page, { vendorName, filamentName, locationName });

  await test.step("open the new filament in the inspector", async () => {
    // Reached through search rather than by looking for its group header in the
    // list: the library pages at 20 groups, and a brand-new filament is only on
    // the first page while the instance holds fewer than that. Every spec adds a
    // filament, so that assumption expires as the suite grows.
    const panel = await searchFor(page, filamentName);
    await panel.getByRole("link").filter({ hasText: filamentName }).first().click();
    // The inspector's title is a styled div, not a heading.
    await expect(page.locator(".head .title")).toContainText(filamentName);
  });

  // The colour editor: a native picker, the hex code, and the opacity slider
  // plus its percentage field. Both opacity controls carry the same accessible
  // name, so they are told apart by role.
  const colorRow = page.locator(".color-row").first();
  const hex = colorRow.getByPlaceholder("hex");
  const opacityPct = colorRow.getByRole("textbox", { name: "Opacity" });
  const opacitySlider = colorRow.getByRole("slider", { name: "Opacity" });

  await test.step("a plain colour starts out fully opaque", async () => {
    await hex.fill("1E90FF");
    await expect(opacityPct).toHaveValue("100");
    await expect(opacitySlider).toHaveValue("100");
  });

  await test.step("dialling the opacity down writes an alpha channel", async () => {
    // 40% of 255 is 102 (0x66). Typing in the percentage field commits on blur.
    const saved = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && /\/filament\/\d+$/.test(r.url()) && r.ok(),
    );
    await opacityPct.fill("40");
    await opacityPct.blur();
    await saved;
    await expect(hex).toHaveValue("1E90FF66");
  });

  await test.step("the swatch shows the transparency rather than a washed-out colour", async () => {
    // A translucent colour is layered over a checkerboard so it doesn't read as
    // a different, lighter colour.
    const swatch = page.locator(".swatch").first();
    await expect(swatch).toHaveAttribute("style", /conic-gradient/);
  });

  await test.step("the alpha survives a reload", async () => {
    await page.reload();
    await expect(page.locator(".head .title")).toContainText(filamentName);
    await expect(hex).toHaveValue("1E90FF66");
    await expect(opacityPct).toHaveValue("40");
  });

  await test.step("going back to full opacity drops the alpha channel again", async () => {
    const saved = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && /\/filament\/\d+$/.test(r.url()) && r.ok(),
    );
    await opacitySlider.fill("100");
    await saved;
    await expect(hex).toHaveValue("1E90FF");
    await page.reload();
    await expect(hex).toHaveValue("1E90FF");
  });
});
