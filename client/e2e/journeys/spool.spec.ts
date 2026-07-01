import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";
import { atPath, saveAndGetId, saveButton } from "../helpers";

// Spool journey. A filament is seeded through the API so the UI test focuses on the
// spool create form (searchable filament Select + weight entry), show, edit, adjust
// and archive.

async function seedFilament(
  request: import("@playwright/test").APIRequestContext,
): Promise<{ id: number; name: string }> {
  const name = `Seed ${Date.now()}`;
  const res = await request.post(`${APP_BASE_URL}/api/v1/filament`, {
    data: { name, density: 1.24, diameter: 1.75, weight: 1000 },
  });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id, name };
}

test.describe("spool journey", () => {
  test("create (select filament) → show → edit", async ({ page, request }) => {
    const filament = await seedFilament(request);

    await page.goto(`${APP_BASE_URL}/spool/create`);
    await expect(page).toHaveURL(atPath("/spool/create"));

    // Searchable filament Select: open, type the seeded name, pick the antd option.
    const filamentSelect = page.getByLabel("Filament");
    await filamentSelect.click();
    await filamentSelect.pressSequentially(filament.name);
    await page.locator(".ant-select-item-option").filter({ hasText: filament.name }).first().click();

    // used_weight defaults to 0 and initial_weight auto-fills from the filament, so a
    // comment is enough to make an identifiable, editable spool.
    await page.getByLabel("Comment").fill("e2e spool");

    const id = await saveAndGetId(page, "spool");
    await expect(page).toHaveURL(atPath("/spool"));

    // Show — the linked filament name is rendered
    await page.goto(`${APP_BASE_URL}/spool/show/${id}`);
    await expect(page.getByText(filament.name, { exact: false }).first()).toBeVisible();

    // Edit → change the comment
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(atPath(`/spool/edit/${id}`));
    await page.getByLabel("Comment").fill("e2e spool edited");
    await saveButton(page).click();
    await expect(page).toHaveURL(atPath("/spool"));
  });

  test("create multiple spools via the quantity stepper", async ({ page, request }) => {
    const filament = await seedFilament(request);

    await page.goto(`${APP_BASE_URL}/spool/create`);
    const filamentSelect = page.getByLabel("Filament");
    await filamentSelect.click();
    await filamentSelect.pressSequentially(filament.name);
    await page.locator(".ant-select-item-option").filter({ hasText: filament.name }).first().click();

    // Bump the quantity to 3 with the + stepper (the button right after the
    // quantity input's antd wrapper), then create the batch.
    const plus = page.locator(".ant-input-number:has(#qty-input) + button");
    await plus.click();
    await plus.click();
    await expect(page.locator("#qty-input")).toHaveValue("3");

    let posts = 0;
    page.on("response", (r) => {
      if (/\/api\/v1\/spool$/.test(r.url()) && r.request().method() === "POST") posts += 1;
    });
    await page
      .locator("button")
      .filter({ hasText: /^Save$/ })
      .click();
    await expect(page).toHaveURL(atPath("/spool"));
    // The batch fires one create per unit; they settle just after the redirect.
    await expect.poll(() => posts, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  });

  test("adjust filament usage → archive", async ({ page, request }) => {
    const filament = await seedFilament(request);
    const spoolRes = await request.post(`${APP_BASE_URL}/api/v1/spool`, {
      data: { filament_id: filament.id, initial_weight: 1000, used_weight: 200 },
    });
    const spoolId = (await spoolRes.json()).id;

    await page.goto(`${APP_BASE_URL}/spool/show/${spoolId}`);

    // Adjust: open the modal, consume 100 g by weight, submit → PUT /use.
    await page.getByRole("button", { name: /Adjust Spool Filament/ }).click();
    const modal = page.locator(".ant-modal-content");
    await expect(modal.getByText("Adjust Spool Filament").first()).toBeVisible();
    await modal.getByText("Weight", { exact: true }).click();
    await modal.getByLabel("Consume Amount").fill("100");
    const [useRes] = await Promise.all([
      page.waitForResponse((r) => /\/spool\/\d+\/use$/.test(r.url()) && r.request().method() === "PUT"),
      page.getByRole("button", { name: "OK" }).click(),
    ]);
    expect(useRes.ok()).toBeTruthy();

    // Archive: header button → confirm dialog (remaining > 0) → PATCH archived=true.
    await page
      .locator("button")
      .filter({ hasText: /^Archive$/ })
      .click();
    const [archiveRes] = await Promise.all([
      page.waitForResponse((r) => /\/spool\/\d+$/.test(r.url()) && r.request().method() === "PATCH"),
      page.locator(".ant-modal-confirm .ant-btn-primary").click(),
    ]);
    expect(archiveRes.ok()).toBeTruthy();
    // The header now offers to unarchive.
    await expect(page.locator("button").filter({ hasText: /^Unarchive$/ })).toBeVisible();
  });
});
