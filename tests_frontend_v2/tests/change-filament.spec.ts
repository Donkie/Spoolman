import { test, expect } from "./fixtures";
import { createSpoolViaModal, numberField, openApp, searchFor, unique } from "./helpers";

/**
 * Re-pointing a spool at a different filament (issue #1010).
 *
 * The whole point of the feature is what does *not* change: people who organise
 * their shelves by spool number replace the roll in slot #37 and need slot #37 to
 * still be slot #37 afterwards. So the assertions here are as much about the id
 * and location surviving as about the filament actually swapping.
 *
 * It also covers the weight decision the dialog puts in front of the user: a
 * spool created from a filament records that filament's full weight as its own,
 * and would otherwise keep the old figure forever — this client has no other
 * field for it.
 */
test("change which filament a spool holds, keeping the spool itself", async ({ page }) => {
  const vendorName = unique("Vendor");
  const oldFilament = unique("OldFilament");
  const newFilament = unique("NewFilament");
  const locationName = unique("Shelf");

  await openApp(page);

  // The spool under test: 1000 g net, 250 g of it already used (750 g left).
  await createSpoolViaModal(page, { vendorName, filamentName: oldFilament, locationName, weightG: 1000, usedG: 250 });
  // The filament it will be changed to, on a 750 g spool. Creating it through the
  // modal also creates a spool of its own, which this test simply ignores. It gets
  // its own manufacturer because the helper asserts the new-manufacturer hint.
  await createSpoolViaModal(page, {
    vendorName: unique("Vendor"),
    filamentName: newFilament,
    locationName: unique("Shelf"),
    weightG: 750,
  });

  // Open the first spool's inspector by searching for its location — the library
  // is paginated, so clicking a row found by search is the reliable way in.
  const panel = await searchFor(page, locationName);
  await panel.getByRole("link").filter({ hasText: locationName }).first().click();
  await expect(page).toHaveURL(/[?&]sel=spool(:|%3A)\d+/);

  const inspector = page.locator(".insp");
  await expect(inspector).toContainText(oldFilament);
  // The spool number this whole feature exists to preserve.
  const spoolId = (await inspector.locator(".idmono").first().innerText()).trim();
  expect(spoolId).toMatch(/^#\d+$/);

  await test.step("pick the new filament", async () => {
    await inspector.getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The spool's current filament is listed but not selectable — changing to
    // what it already holds is not a change.
    await expect(dialog.getByText("current", { exact: true })).toBeVisible();

    await dialog.locator("input.search-big").fill(newFilament);
    await dialog.locator(".res-item").filter({ hasText: newFilament }).first().click();

    // The spool recorded the old filament's 1000 g as its own full weight, so the
    // dialog offers to take the new filament's 750 g instead. Checked by default;
    // the 250 g already used is kept either way, leaving 500 g.
    const adopt = dialog.getByRole("checkbox");
    await expect(adopt).toBeChecked();
    await expect(dialog).toContainText("750 g");
    await expect(dialog).toContainText("500 g");

    await dialog.getByRole("button", { name: "Change filament", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("the spool is the same spool, holding the new filament", async () => {
    await expect(inspector).toContainText(newFilament);
    await expect(inspector).not.toContainText(oldFilament);
    // Same number, same shelf: nothing about the spool itself moved. Location is
    // an editable combobox in the inspector, so it is read as an input value.
    await expect(inspector.locator(".idmono").first()).toHaveText(spoolId);
    await expect(inspector.getByRole("combobox").first()).toHaveValue(locationName);
    // 750 g full, 250 g used.
    await expect(inspector.locator(".gauge")).toContainText("500");
    await expect(inspector.locator(".gauge")).toContainText("750 g");
  });

  await test.step("the change survives a reload", async () => {
    await page.reload();
    await expect(inspector).toContainText(newFilament);
    await expect(inspector.locator(".idmono").first()).toHaveText(spoolId);
  });
});

/**
 * Refilling a slot with a filament that isn't catalogued yet — the follow-up on
 * issue #1010, and the ordinary case for anyone whose spool numbers are shelf
 * positions: the roll that goes into slot #13 is usually one they have never
 * bought before. Without this path the only way through is to add a spool in
 * order to mint the filament and then delete it again, which hands out exactly
 * the new spool id the feature exists to avoid.
 *
 * So the load-bearing assertion is the count: the library still holds the one
 * spool we started with.
 */
test("create a brand-new filament while changing what a spool holds", async ({ page }) => {
  const vendorName = unique("Vendor");
  const oldFilament = unique("OldFilament");
  const locationName = unique("Shelf");
  // Entered nowhere else: these exist only in the change dialog's own form.
  const newVendor = unique("FreshVendor");
  const newFilament = unique("FreshFilament");

  await openApp(page);
  await createSpoolViaModal(page, { vendorName, filamentName: oldFilament, locationName, weightG: 1000, usedG: 250 });

  const countSpools = () => page.evaluate(async () => ((await (await fetch("/api/v1/spool")).json()) as []).length);
  const spoolsBefore = await countSpools();

  const panel = await searchFor(page, locationName);
  await panel.getByRole("link").filter({ hasText: locationName }).first().click();
  const inspector = page.locator(".insp");
  const spoolId = (await inspector.locator(".idmono").first().innerText()).trim();

  await test.step("describe a filament that exists in neither source", async () => {
    await inspector.getByRole("button", { name: "Change", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /^Create a new filament/ }).click();
    // The form replaces the picker rather than stacking on top of it.
    await expect(dialog.locator("input.search-big")).toBeHidden();

    // A form you just opened says nothing; pressing the button on an empty one
    // reveals what is outstanding and takes you to the first of it, rather than
    // going dead. Same contract as the add-spool form it shares its cards with.
    await expect(dialog.locator(".err")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Change filament", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".err").first()).toBeVisible();
    await expect(dialog.getByPlaceholder("e.g. PolyTerra Matte Sage")).toBeFocused();

    await dialog.getByPlaceholder("e.g. Polymaker").fill(newVendor);
    await dialog.getByPlaceholder("e.g. PolyTerra Matte Sage").fill(newFilament);
    await dialog.getByPlaceholder("PLA", { exact: true }).fill("ABS");
    await expect(dialog.getByText(`New manufacturer “${newVendor}” will be created`)).toBeVisible();

    // No spool is being created here, so the filament's own weight sits on this
    // form. 600 g of it, against the 250 g already used, leaves 350 g.
    await numberField(dialog, "Weight").fill("600");

    // Density is required, and must not depend on the SpoolmanDB lookup.
    await dialog.getByRole("button", { name: /^Advanced specs/ }).click();
    await numberField(dialog, "Density").fill("1.04");

    // The spool carries the old filament's 1000 g as its own full weight, so the
    // dialog offers the new figure instead and says what it leaves.
    await expect(dialog.getByRole("checkbox")).toBeChecked();
    await expect(dialog).toContainText("350 g");

    await dialog.getByRole("button", { name: "Change filament", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("the spool now holds it, and no second spool was minted", async () => {
    await expect(inspector).toContainText(newFilament);
    await expect(inspector).not.toContainText(oldFilament);
    await expect(inspector.locator(".idmono").first()).toHaveText(spoolId);
    await expect(inspector.locator(".gauge")).toContainText("350");
    expect(await countSpools()).toBe(spoolsBefore);
  });

  await test.step("the filament and its manufacturer became real records", async () => {
    await page.reload();
    await expect(inspector).toContainText(newFilament);
    // Reachable through the same search as everything else, i.e. it landed in the
    // catalog rather than living only on this spool.
    const results = await searchFor(page, newFilament);
    await expect(results.getByRole("link").filter({ hasText: newFilament }).first()).toBeVisible();
    const vendorResults = await searchFor(page, newVendor);
    await expect(vendorResults.getByRole("link").filter({ hasText: newVendor }).first()).toBeVisible();
  });
});
