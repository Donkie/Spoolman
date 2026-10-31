import { test, expect } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

/**
 * Typing into an inspector field must not lose keystrokes (#1307). The inspector
 * autosaves a debounced PATCH, and its response carries the text as it was when
 * the request went out. If that response lands while the user is still typing,
 * writing it back into the box eats every character typed since.
 *
 * The PATCH is held back here so the response reliably arrives mid-typing, the
 * way a slow server or a laggy connection makes it arrive in real use.
 */
test("a slow autosave doesn't overwrite what is still being typed", async ({ page }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);
  await createSpoolViaModal(page, { vendorName, filamentName, locationName });

  const panel = await searchFor(page, filamentName);
  await panel.getByRole("link").filter({ hasText: filamentName }).first().click();
  await expect(page.locator(".head .title")).toContainText(filamentName);

  await page.route("**/api/v1/filament/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await new Promise((r) => setTimeout(r, 1000));
    await route.fallback();
  });

  const name = page.locator(".insp").getByRole("textbox", { name: "Name", exact: true });
  const renamed = `${filamentName} renamed`;

  await test.step("type, pause long enough for the autosave, then keep typing", async () => {
    await name.fill("");
    await name.pressSequentially(`${filamentName} re`);
    // Past the 500 ms debounce: the first PATCH goes out and is now in flight.
    const firstSave = page.waitForResponse((r) => r.request().method() === "PATCH");
    await page.waitForTimeout(700);
    await name.pressSequentially("named", { delay: 300 });
    await firstSave;
    await expect(name).toHaveValue(renamed);
  });

  await test.step("and the full text is what gets saved", async () => {
    const lastSave = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && (r.request().postData() ?? "").includes(renamed),
    );
    await name.blur();
    await lastSave;
    await page.reload();
    await expect(name).toHaveValue(renamed);
  });
});
