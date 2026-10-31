import { test, expect } from "./fixtures";
import { createSpoolViaModal, openApp, searchFor, unique } from "./helpers";

const API_BASE =
  process.env.SPOOLMAN_API_URL ?? `${process.env.SPOOLMAN_BASE_URL ?? "http://localhost:8001"}/api/v1`;

/**
 * Typing into an inspector field must not lose keystrokes (#1307). The inspector
 * autosaves a debounced PATCH, and its response carries the text as it was when
 * the request went out. Spool lists refetched while typing embed the filament
 * with whatever name the server had then. If either lands while the user is
 * still typing, writing it back into the box eats every character typed since.
 *
 * The PATCH is held back here so the response reliably arrives mid-typing, the
 * way a slow server or a laggy connection makes it arrive in real use, and a
 * spool is added over the API so the lists refetch with the old name.
 */
test("a slow autosave doesn't overwrite what is still being typed", async ({ page, request }) => {
  const vendorName = unique("Vendor");
  const filamentName = unique("Filament");
  const locationName = unique("Shelf");

  await openApp(page);
  await createSpoolViaModal(page, { vendorName, filamentName, locationName });

  const panel = await searchFor(page, filamentName);
  await panel.getByRole("link").filter({ hasText: filamentName }).first().click();
  await expect(page.locator(".head .title")).toContainText(filamentName);

  const filaments = await request.get(`${API_BASE}/filament`, { params: { name: filamentName } });
  const [{ id: filamentId }] = await filaments.json();

  await page.route("**/api/v1/filament/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await new Promise((r) => setTimeout(r, 1000));
    await route.fallback();
  });

  const name = page.locator(".insp").getByRole("textbox", { name: "Name", exact: true });
  const renamed = `${filamentName} renamed`;

  await test.step("type, pause long enough for the autosave, then keep typing", async () => {
    await name.fill("");
    // Every value the box shows from here on, frame by frame: a reset can flash the
    // old name and settle again before an assertion would look.
    await name.evaluate((el: HTMLInputElement) => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      const tick = () => {
        if (seen.at(-1) !== el.value) seen.push(el.value);
        requestAnimationFrame(tick);
      };
      tick();
    });
    // Another change while the box holds unsaved text: its live update and the
    // spool lists it refetches bring the filament back with its old name.
    const refetched = page.waitForResponse((r) => r.url().includes(`filament.id=${filamentId}`));
    await request.post(`${API_BASE}/spool`, { data: { filament_id: filamentId } });
    await refetched;
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([""]);
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
