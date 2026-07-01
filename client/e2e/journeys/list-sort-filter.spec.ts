import { APP_BASE_URL } from "../constants";
import { expect, test } from "../fixtures";

// Spool-list sort + filter journey (TESTING_STRATEGY "Remaining"). The journey
// suite shares one backend DB, so every assertion is scoped to spools seeded with
// a unique material; sorting asserts relative order of the seeded ids only.

test.describe("spool list sort and filter", () => {
  test("filter by material, then sort by id in both directions", async ({ page, request }) => {
    const material = `E2EMAT${Date.now()}`;
    const fil = await (
      await request.post(`${APP_BASE_URL}/api/v1/filament`, {
        data: { name: `List ${Date.now()}`, material, density: 1.24, diameter: 1.75, weight: 1000 },
      })
    ).json();
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const spool = await (
        await request.post(`${APP_BASE_URL}/api/v1/spool`, { data: { filament_id: fil.id } })
      ).json();
      ids.push(spool.id as number);
    }

    await page.goto(`${APP_BASE_URL}/spool`);
    await expect(page.getByRole("heading", { name: "Spools" })).toBeVisible();
    await page.getByRole("button", { name: "Clear Filters" }).click();

    // Material filter: enumerated checkbox dropdown, options fetched lazily on
    // open. antd renders a hidden measure row that duplicates header cells, so
    // take the first (visible) match.
    await page.locator("th", { hasText: "Material" }).locator(".ant-table-filter-trigger").first().click();
    const dropdown = page.locator(".ant-table-filter-dropdown:visible");
    await dropdown.getByText(material, { exact: true }).click();
    await dropdown.getByRole("button", { name: "OK" }).click();

    // Only the three seeded spools remain.
    const firstCol = page.locator(".ant-table-tbody tr.ant-table-row td:first-child");
    await expect(firstCol).toHaveCount(3);

    // Sort by ID descending (default restored by Clear Filters is id asc).
    const rowIds = async () => (await firstCol.allInnerTexts()).map((t) => Number(t));
    expect(await rowIds()).toEqual([...ids].sort((a, b) => a - b));

    await page.locator("th", { hasText: /^ID/ }).locator(".ant-table-column-sorters").first().click();
    await expect.poll(rowIds).toEqual([...ids].sort((a, b) => b - a));
  });
});
