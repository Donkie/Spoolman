import { test, expect, type Page } from "./fixtures";
import {
  createSpoolViaModal,
  numberField,
  openAddSpoolModal,
  openApp,
  searchFor,
  unique,
} from "./helpers";

function patched(page: Page, entity: "spool" | "filament"): Promise<unknown> {
  return page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes(`/${entity}/`),
  );
}

test("adding a spool preserves an explicit zero tare while a blank inherits the filament tare", async ({
  page,
}) => {
  const filamentName = unique("Filament");
  await openApp(page);
  await createSpoolViaModal(page, {
    vendorName: unique("Vendor"),
    filamentName,
    locationName: unique("Shelf"),
  });

  const results = await searchFor(page, filamentName);
  await results
    .getByRole("link")
    .filter({ hasText: filamentName })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]sel=filament(:|%3A)\d+/);
  const filamentTare = page
    .locator(".insp")
    .getByRole("textbox", { name: "Spool Weight" });
  const saved = patched(page, "filament");
  await filamentTare.fill("250");
  await filamentTare.blur();
  await saved;

  for (const [input, expected] of [
    ["0", 0],
    ["", 250],
  ] as const) {
    const dialog = await openAddSpoolModal(page);
    await dialog.locator("input.search-big").fill(filamentName);
    await dialog
      .locator("button.res-item")
      .filter({ hasText: filamentName })
      .first()
      .click();
    const tare = numberField(dialog, "Spool Weight");
    await expect(tare).toHaveValue("250");
    await tare.fill(input);
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && /\/api\/v1\/spool$/.test(r.url()),
    );
    await dialog
      .getByRole("button", { name: "Add 1 spool", exact: true })
      .click();
    const response = await created;
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).spool_weight).toBe(expected);
    await expect(dialog).toBeHidden();
  }
});

