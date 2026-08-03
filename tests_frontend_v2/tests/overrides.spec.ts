import { test, expect, type Page } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

/**
 * Values a spool can hold instead of inheriting them from its filament (#1013).
 *
 * The bug this covers is a silent one. Every spool the API creates from a
 * filament is given a copy of that filament's tare weight, and until this client
 * could show or edit it, correcting the *filament* looked like it had worked —
 * the spool panel displayed the new figure — while "adjust by measured weight"
 * went on subtracting the old one. A reporter's empty 261 g spool came out with
 * 129 g still on it, exactly the difference between the two.
 *
 * So the assertions are as much about the panel telling the truth about which
 * value applies as about the field existing at all.
 */

/**
 * The inspector's edits are debounced, so waiting on the request itself is what
 * makes "and then it was saved" a fact rather than a sleep.
 */
function patched(page: Page, entity: "spool" | "filament"): Promise<unknown> {
  return page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(`/${entity}/`));
}

test("a spool keeps a tare weight of its own, and says when it overrides the filament", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);
  await createSpoolViaModal(page, { vendorName, filamentName, locationName, weightG: 1000 });

  const panel = await searchFor(page, locationName);
  await panel.getByRole("link").filter({ hasText: locationName }).first().click();
  await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);

  const inspector = page.locator(".insp");
  const spoolTare = inspector.getByRole("spinbutton", { name: "Spool Weight" });

  await test.step("give this spool a tare weight of its own", async () => {
    const saved = patched(page, "spool");
    await spoolTare.fill("132");
    await spoolTare.blur();
    await saved;
    await page.reload();
    await expect(spoolTare).toHaveValue("132");
  });

  await test.step("correcting the filament leaves this spool on its own figure", async () => {
    await inspector.getByRole("link", { name: /Open filament/ }).click();
    await expect(page).toHaveURL(/[?&]sel=filament(:|%3A)\d+/);
    const filamentTare = inspector.getByRole("spinbutton", { name: "Spool Weight" });
    const saved = patched(page, "filament");
    await filamentTare.fill("261");
    await filamentTare.blur();
    await saved;

    await page.goBack();
    await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);

    // The spool is unmoved, and now says so at both ends rather than showing the
    // filament's 261 g while quietly measuring against 132 g.
    await expect(spoolTare).toHaveValue("132");
    await expect(inspector).toContainText("Overrides filament · 261 g");
    await expect(inspector).toContainText("Overridden by this spool · 132 g");
  });

  await test.step("clearing the field hands the tare weight back to the filament", async () => {
    const saved = patched(page, "spool");
    await spoolTare.fill("");
    await spoolTare.blur();
    await saved;
    await page.reload();

    await expect(spoolTare).toHaveValue("");
    // The value that applies now, offered as the placeholder instead.
    await expect(spoolTare).toHaveAttribute("placeholder", "261 · filament default");
    await expect(inspector).not.toContainText("Overrides filament");
    await expect(inspector).not.toContainText("Overridden by this spool");
  });
});
