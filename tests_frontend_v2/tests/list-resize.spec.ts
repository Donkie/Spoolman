import { test, expect } from "./fixtures";
import { openApp } from "./helpers";

/**
 * The Library's list/inspector splitter (#1034).
 *
 * The list column used to be a fixed 470px, which truncated longer filament
 * names with no way to see the rest. The divider between the two panes is now a
 * draggable, focusable separator, and the width it is left at is a per-browser
 * preference — so the things worth proving are that dragging it moves the pane,
 * that the width survives a reload, and that neither pane can be squeezed out of
 * existence by dragging to an extreme.
 */

const LIST_MIN = 340;
const DETAIL_MIN = 360;
const DEFAULT_WIDTH = 470;

const listPane = (page: import("@playwright/test").Page) => page.locator(".list-pane");
const splitter = (page: import("@playwright/test").Page) => page.getByRole("separator");

async function listWidth(page: import("@playwright/test").Page): Promise<number> {
  return listPane(page).evaluate((el) => el.getBoundingClientRect().width);
}

/** Drag the splitter by `dx` px and release. */
async function dragBy(page: import("@playwright/test").Page, dx: number): Promise<void> {
  const box = await splitter(page).boundingBox();
  if (!box) throw new Error("splitter has no box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  // In steps, so the page sees a real drag rather than one teleporting move.
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 10 });
  await page.mouse.up();
}

// Each test starts from a known width; the preference is per-browser and every
// test here changes it. Seeded only when absent, because an init script runs on
// every navigation — overwriting unconditionally would re-seed the default on
// the reloads these tests use to prove the width persists.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((w) => {
    if (window.localStorage.getItem("spoolman-v2-list-width") === null)
      window.localStorage.setItem("spoolman-v2-list-width", String(w));
  }, DEFAULT_WIDTH);
});

test("dragging the splitter resizes the list, and the width is remembered", async ({ page }) => {
  await openApp(page);
  await expect(listPane(page)).toHaveJSProperty("clientWidth", DEFAULT_WIDTH);

  await dragBy(page, 200);
  const widened = await listWidth(page);
  expect(widened).toBeGreaterThan(DEFAULT_WIDTH + 150);

  await page.reload();
  await expect(page).toHaveTitle("Library | Spoolman");
  expect(await listWidth(page)).toBe(widened);
});

test("neither pane can be dragged away", async ({ page }) => {
  await openApp(page);
  const available = await page.locator(".library").evaluate((el) => el.getBoundingClientRect().width);

  await test.step("dragging past the left edge stops at the list's minimum", async () => {
    await dragBy(page, -2000);
    expect(await listWidth(page)).toBe(LIST_MIN);
  });

  await test.step("dragging past the right edge leaves the inspector its minimum", async () => {
    await dragBy(page, 2000);
    expect(await listWidth(page)).toBe(available - DETAIL_MIN);
  });
});

test("the splitter is keyboard operable and double-clicks back to the default", async ({ page }) => {
  await openApp(page);
  const sep = splitter(page);

  // A focusable separator is the ARIA window splitter: it carries the width as a
  // range, which is what a screen reader announces while the arrows move it.
  await expect(sep).toHaveAttribute("aria-orientation", "vertical");
  await expect(sep).toHaveAttribute("aria-valuenow", String(DEFAULT_WIDTH));

  await sep.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await listWidth(page)).toBe(DEFAULT_WIDTH + 32);
  await page.keyboard.press("ArrowLeft");
  expect(await listWidth(page)).toBe(DEFAULT_WIDTH + 16);
  await expect(sep).toHaveAttribute("aria-valuenow", String(DEFAULT_WIDTH + 16));

  await page.keyboard.press("Home");
  expect(await listWidth(page)).toBe(LIST_MIN);

  await sep.dblclick();
  expect(await listWidth(page)).toBe(DEFAULT_WIDTH);
  await page.reload();
  await expect(page).toHaveTitle("Library | Spoolman");
  expect(await listWidth(page)).toBe(DEFAULT_WIDTH);
});

test("a width wider than the window is clamped for display, not overwritten", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("spoolman-v2-list-width", "5000"));
  await openApp(page);

  const available = await page.locator(".library").evaluate((el) => el.getBoundingClientRect().width);
  expect(await listWidth(page)).toBe(available - DETAIL_MIN);

  // The stored preference is untouched, so the same browser on a wider window
  // gets its chosen width back.
  expect(await page.evaluate(() => window.localStorage.getItem("spoolman-v2-list-width"))).toBe("5000");
});
