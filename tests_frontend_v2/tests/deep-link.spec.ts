import { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { unique } from "./helpers";

/**
 * Deep links into the Library: the URL a spool label's QR code carries
 * (`/spool/show/<id>`), a filament label's (`/filament/show/<id>`), and plain
 * `?sel=` links. They have to open the item whether or not the list happens to
 * have loaded it (#1243).
 *
 * The browser remembers a sort order here, as the reporter's did. Arriving on the
 * Library then rewrites the URL to spell that view out (`?dir=asc&sel=…`), and
 * that rewrite used to cancel the inspector's fetch of an item the list hadn't
 * loaded, leaving it on "Loading..." for good.
 */

const API_BASE =
  process.env.SPOOLMAN_API_URL ?? `${process.env.SPOOLMAN_BASE_URL ?? "http://localhost:8001"}/api/v1`;

async function post(request: APIRequestContext, path: string, data: object): Promise<number> {
  const res = await request.post(`${API_BASE}${path}`, { data });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "spoolman-v2-library-view",
      JSON.stringify({ group: "filament", sort: "last_used", asc: true }),
    ),
  );
});

test("a link to a spool past the first page opens it", async ({ page, request }) => {
  const filament = await post(request, "/filament", { name: unique("Filament"), density: 1.24, diameter: 1.75 });
  // More than a page of spools (20), so the newest is nowhere near what the list
  // loads first.
  let id = 0;
  for (let i = 0; i < 25; i++) id = await post(request, "/spool", { filament_id: filament });

  await page.goto(`/spool/show/${id}`);
  await expect(page).toHaveURL(new RegExp(`dir=asc.*sel=spool(:|%3A)${id}`));
  await expect(page.locator(".insp .idmono")).toHaveText(`#${id}`);
});

test("filament and manufacturer links open items the list never loads", async ({ page, request }) => {
  // Neither has a spool, so no list row or group ever puts them in the cache.
  const vendorName = unique("Vendor");
  const vendor = await post(request, "/vendor", { name: vendorName });
  const filamentName = unique("Filament");
  const filament = await post(request, "/filament", {
    name: filamentName,
    vendor_id: vendor,
    density: 1.24,
    diameter: 1.75,
  });

  await page.goto(`/filament/show/${filament}`);
  await expect(page.locator(".insp").getByText(filamentName).first()).toBeVisible();

  await page.goto(`/?sel=vendor:${vendor}`);
  await expect(page.locator(".insp").getByText(vendorName).first()).toBeVisible();
});

test("a link to a spool that no longer exists says so", async ({ page }) => {
  await page.goto("/spool/show/99999999");
  await expect(page.getByText("This item could not be found. It may have been deleted.")).toBeVisible();
  await expect(page.getByText("Loading...")).toHaveCount(0);
});
