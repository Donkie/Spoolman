import { readFile, stat } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { createSpoolViaModal, navTab, onlyVisible, openApp, unique } from "./helpers";

/**
 * The label/QR subsystem — the single largest piece of new code in client_v2 and,
 * until now, the least covered. It replaces the legacy client's print-preset
 * dialog with a canvas designer whose designs are stored server-side (in the
 * `label_designs` setting) and a print panel that rasterizes them through Konva.
 *
 * Two things here can only be proven against a real deployment: that a design
 * survives a round trip through the backend, and that the renderer actually
 * produces a file for a real spool (QR encoding, template substitution, the logo
 * and the mm→pixel maths all run for that one click). We exercise the "Files"
 * output rather than "Print" on purpose — printing opens the browser's print
 * dialog, which would block the session.
 */

const spool = {
  vendorName: unique("LabelVendor"),
  filamentName: unique("LabelFilament"),
  locationName: unique("LabelShelf"),
};
const designName = unique("Design");

test.describe.configure({ mode: "serial" });

/** Delete the design this spec created, so repeated runs don't pile them up. */
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => window.localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await openApp(page);
    await navTab(page, "Labels", "Labels | Spoolman");

    const select = page.getByLabel("Select label design");
    if ((await select.locator(`option:text-is("${designName}")`).count()) === 0) return;

    await select.selectOption({ label: designName });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(select.locator(`option:text-is("${designName}")`)).toHaveCount(0);
  } finally {
    await page.close();
  }
});

test("create a label design and persist it to the server", async ({ page }) => {
  await openApp(page);

  // A spool of our own to print, so the spec doesn't depend on what other specs
  // happen to have left in the database.
  await createSpoolViaModal(page, spool);

  await navTab(page, "Labels", "Labels | Spoolman");

  await test.step("create and name a design", async () => {
    await page.getByRole("button", { name: "New", exact: true }).click();

    // A fresh design starts from a working template rather than a blank canvas.
    const nameField = page.getByPlaceholder("Design name");
    await expect(nameField).toHaveValue("Untitled label");
    await nameField.fill(designName);

    // The save button doubles as the dirty indicator: "Save" while there are
    // unsaved edits, "Saved" once the server has them.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  });

  await test.step("the design comes back after a reload", async () => {
    // Designs live in a server setting, not localStorage, so they follow the user
    // to another browser. A reload is the cheapest proof they were written.
    await page.reload();
    await expect(page.getByLabel("Select label design")).toBeVisible();
    await expect(page.getByLabel("Select label design").locator(`option:text-is("${designName}")`)).toHaveCount(
      1,
    );
  });
});

test("render a label for a real spool and download it as a PNG and an AML file", async ({ page }) => {
  await openApp(page);
  await navTab(page, "Labels", "Labels | Spoolman");

  await page.getByLabel("Select label design").selectOption({ label: designName });
  await page.getByRole("button", { name: "Print", exact: true }).click();

  await test.step("select the spool to print", async () => {
    // The list is long on a seeded instance; narrow it to ours first.
    await page.getByPlaceholder("Search spools...").fill(spool.filamentName);
    await page.getByRole("checkbox", { name: new RegExp(spool.filamentName) }).check();
    await expect(page.getByText("1 spool selected")).toBeVisible();
  });

  // "Files" writes straight to disk. The other two modes go through
  // window.print(), whose dialog would stall the browser session.
  await page.getByRole("button", { name: "Files", exact: true }).click();

  await test.step("export it as a PNG", async () => {
    await page.getByLabel("File format").selectOption({ label: "PNG image" });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save as PNG" }).click();
    const download = await downloadPromise;

    // One file per selected spool, named after the spool it belongs to.
    expect(download.suggestedFilename()).toMatch(/^spoolman-spool-label-\d+\.png$/);

    // A non-trivial PNG: the renderer really drew the QR code, the swatch and the
    // text, rather than handing back an empty canvas.
    const path = await download.path();
    expect(path).not.toBeNull();
    const { size } = await stat(path!);
    expect(size).toBeGreaterThan(1000);

    // The resolution the layout asked for is stamped into the file, so the label
    // lands at its designed physical size instead of being read back as 96 dpi.
    const png = await readFile(path!);
    const phys = png.indexOf("pHYs");
    expect(phys).toBeGreaterThan(0);
    // pHYs payload: pixels per metre on X, then Y. 300 dpi = 11811 px/m.
    expect(png.readUInt32BE(phys + 4)).toBe(11811);
    expect(png.readUInt32BE(phys + 8)).toBe(11811);
  });

  await test.step("export the same label as an AML file", async () => {
    await page.getByLabel("File format").selectOption({ label: "AML label file" });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save as AML" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^spoolman-spool-label-\d+\.aml$/);

    const path = await download.path();
    expect(path).not.toBeNull();
    const aml = await readFile(path!, "utf8");

    // The document the printer apps expect, carrying the label's physical size in
    // mm and the rendered raster as one embedded image.
    expect(aml).toContain('<LPAPI version="1.3">');
    expect(aml).toMatch(/<labelWidth>[\d.]+<\/labelWidth>/);
    expect(aml).toMatch(/<labelHeight>[\d.]+<\/labelHeight>/);
    const content = /<content>([A-Za-z0-9+/=]+)<\/content>/.exec(aml);
    expect(content, "AML should embed the label raster").not.toBeNull();
    expect(content![1].length).toBeGreaterThan(1000);
  });
});

test("the label designer and print panel render without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${page.url()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`${page.url()}: ${err.message}`));

  await openApp(page);
  await navTab(page, "Labels", "Labels | Spoolman");
  await page.getByLabel("Select label design").selectOption({ label: designName });

  // The designer mounts a Konva stage; a broken canvas layer shows up here and
  // nowhere else.
  await expect(onlyVisible(page.locator("canvas")).first()).toBeVisible();

  // Switching to filament labels rebuilds the design's elements (spool-only
  // fields are dropped and the QR retargets), which is the riskiest state
  // transition on the page.
  await page.getByRole("button", { name: "Filament", exact: true }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByPlaceholder("Search filaments...")).toBeVisible();

  expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
});
