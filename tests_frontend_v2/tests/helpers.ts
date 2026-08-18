import { Locator, Page, expect } from "@playwright/test";

/**
 * Generate a unique-ish suffix so repeated runs against the same (persistent)
 * database don't collide. Includes a non-ASCII marker, matching the repo's
 * habit of using åäö as an encoding canary in text fields.
 */
export function unique(prefix: string): string {
  return `${prefix}-åäö-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Narrow a locator to the one element that is actually rendered.
 *
 * The top bar renders its navigation twice — a desktop row and a mobile row —
 * and hides one with CSS, so nav links and the add button each match twice. The
 * tests run at a desktop viewport, so exactly one of each is visible.
 */
export function onlyVisible(locator: Locator): Locator {
  return locator.locator("visible=true");
}

/**
 * Assert that the app shell has rendered rather than the page having crashed or
 * stalled on the SPA fallback. The logo is present on every route and carries a
 * stable, untranslated accessible name.
 */
export async function expectAppShell(page: Page): Promise<void> {
  await expect(page.getByRole("link", { name: "Spoolman home" })).toBeVisible();
}

/**
 * Open the application at its root. This is the single entry point; every other
 * page is reached by clicking through the UI (see navTab / openAddSpoolModal).
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expectAppShell(page);
  await expect(page).toHaveTitle("Library | Spoolman");
}

/**
 * Click a top-bar navigation tab and wait for its page to take over.
 *
 * Each route sets its own <title> from `documentTitle.*`, which is the cheapest
 * proof that the new page component actually mounted (rather than the tab
 * merely being highlighted).
 */
export async function navTab(page: Page, label: string, title: string): Promise<void> {
  await onlyVisible(page.getByRole("link", { name: label, exact: true })).click();
  await expect(page).toHaveTitle(title);
  await expectAppShell(page);
}

/**
 * Open the "Add spools" modal from the top bar and return the dialog.
 *
 * Scoped to the header because an empty library also renders an "Add spools"
 * call-to-action in the list body.
 */
export async function openAddSpoolModal(page: Page): Promise<Locator> {
  await onlyVisible(page.locator("header").getByRole("button", { name: "Add spools" })).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Locate a numeric input in the add-spool modal by its field label.
 *
 * NumberInput renders a bare <input> wrapped in a <label> together with stepper
 * buttons and an optional help toggle, so its accessible name picks up that
 * extra furniture and `getByLabel` can't match it exactly. We instead find the
 * form item whose label text *starts with* the given label — anchoring at the
 * start keeps "Weight" from also matching "Spool Weight".
 */
export function numberField(dialog: Locator, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return dialog
    .locator("label")
    .filter({ hasText: new RegExp(`^\\s*${escaped}\\b`) })
    .first()
    .locator("input")
    .first();
}

/**
 * The row of roll-size shortcuts under the add-spool modal's Weight field.
 *
 * They are plain buttons inside the field's <label>, grouped and named so they
 * can be reached without depending on the modal's markup.
 */
export function weightPresets(dialog: Locator): Locator {
  return dialog.getByRole("group", { name: "Common roll sizes" });
}

/** A spool to create through the add-spool modal, together with its filament and vendor. */
export interface NewSpool {
  vendorName: string;
  filamentName: string;
  locationName: string;
  /** Material name. Kept to real ones so the SpoolmanDB density lookup behaves. */
  material?: string;
  /** Net filament weight, in grams. */
  weightG?: number;
  /**
   * Set the weight by clicking one of the roll-size shortcuts under the field
   * (e.g. "500 g", "1 kg") instead of typing it. Must name the same size as
   * `weightG`, which is still what the result is asserted against.
   */
  weightPreset?: string;
  /** How much of it has already been used, in grams. Omit for a full spool. */
  usedG?: number;
  /** Values for the filament's extra fields, keyed by their display name. */
  filamentExtra?: Record<string, string>;
  /** How many identical spools of the filament to create. Defaults to one. */
  count?: number;
}

/**
 * Create a brand-new manufacturer, filament and spool in one pass of the
 * add-spool modal, exactly as a user would.
 *
 * client_v2 folds what the legacy client spread over three create forms into
 * this single flow, so it is the only way to get data into the app through the
 * UI — which makes it the shared setup step for every spec that needs
 * something in the library. The few assertions in here are invariants of the
 * modal itself (the new-manufacturer hint, the default diameter); the specs add
 * their own on top.
 */
export async function createSpoolViaModal(page: Page, spool: NewSpool): Promise<void> {
  const {
    vendorName,
    filamentName,
    locationName,
    material = "PLA",
    weightG = 1000,
    weightPreset,
    usedG,
    filamentExtra,
    count = 1,
  } = spool;

  const dialog = await openAddSpoolModal(page);

  // Step 1 offers the local catalog and SpoolmanDB; we take the third path and
  // describe a filament that exists in neither.
  await dialog.getByRole("button", { name: /^Create a new filament/ }).click();

  // The new-filament fields have no label/input association usable by getByLabel
  // (the <label> wraps a custom Combobox and hint text), so they are located by
  // their placeholders.
  await dialog.getByPlaceholder("e.g. Polymaker").fill(vendorName);
  await dialog.getByPlaceholder("e.g. PolyTerra Matte Sage").fill(filamentName);
  await dialog.getByPlaceholder("PLA", { exact: true }).fill(material);

  // A manufacturer that doesn't exist yet is created along with the filament.
  await expect(dialog.getByText(`New manufacturer “${vendorName}” will be created`)).toBeVisible();

  // Density is required. Picking a known material auto-fills it from SpoolmanDB's
  // material list, but the tests must not depend on that external lookup, so set
  // it explicitly under "Advanced specs".
  await dialog.getByRole("button", { name: /^Advanced specs/ }).click();
  await numberField(dialog, "Density").fill("1.24");
  await expect(numberField(dialog, "Diameter")).toHaveValue("1.75");

  // Extra fields defined for filaments get their own section in the same form.
  // Their inputs carry the field's display name as an aria-label.
  for (const [name, value] of Object.entries(filamentExtra ?? {})) {
    await dialog.getByLabel(name, { exact: true }).fill(value);
  }

  await expect(numberField(dialog, "Count")).toHaveValue("1");
  if (count !== 1) await numberField(dialog, "Count").fill(String(count));
  if (weightPreset) {
    await weightPresets(dialog).getByRole("button", { name: weightPreset, exact: true }).click();
    await expect(numberField(dialog, "Weight")).toHaveValue(String(weightG));
  } else {
    await numberField(dialog, "Weight").fill(String(weightG));
  }
  await dialog.getByPlaceholder("e.g. Shelf A").fill(locationName);

  if (usedG !== undefined) {
    // "Full" is the default fill level; switch to entering how much has already
    // been used. Its input is the only one in the modal with a "0" placeholder.
    await dialog.getByRole("button", { name: "Used Weight", exact: true }).click();
    await dialog.getByPlaceholder("0", { exact: true }).fill(String(usedG));
  }

  const submitLabel = count === 1 ? "Add 1 spool" : `Add ${count} spools`;
  await dialog.getByRole("button", { name: submitLabel, exact: true }).click();

  // A successful submit closes the modal.
  await expect(dialog).toBeHidden();
}

/**
 * Type into the top-bar search box and return its results panel.
 *
 * The box is rendered twice (a desktop field and a mobile overlay), so it needs
 * the same visible-only narrowing as the nav. Results are debounced and fetched
 * from `GET /api/v1/search`, so callers must assert on the panel's contents
 * rather than on the panel merely appearing.
 */
export async function searchFor(page: Page, query: string): Promise<Locator> {
  await onlyVisible(page.getByRole("textbox", { name: "Search" })).fill(query);
  return page.getByRole("listbox", { name: "Search" });
}

/**
 * Open one of the library toolbar's dropdowns and return it.
 *
 * The toolbar closes any open menu on a window click, so the menus can't be
 * left open across steps — reopen per interaction.
 */
export async function openToolbarMenu(page: Page, name: "Filter" | "Group" | "Sort"): Promise<Locator> {
  const pattern = name === "Filter" ? /^Filter$/ : new RegExp(`^${name}`);
  await onlyVisible(page.getByRole("button", { name: pattern })).click();
  const menu = page.locator(".toolbar .menu");
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Add one library filter through the two-level Filter menu, and wait for its
 * chip to appear.
 *
 * Besides being what a user does, filtering is how a test pins the list down to
 * its own spools: the library is paginated, so on an instance with real data an
 * unfiltered assertion about a particular row is a coin toss.
 */
export async function addFilter(page: Page, property: string, value: string): Promise<void> {
  const menu = await openToolbarMenu(page, "Filter");
  await menu.getByRole("button", { name: property, exact: true }).click();
  // A value is a checkbox rather than a plain entry: it carries whether it is
  // already applied, and picking one leaves the menu open so several can be
  // picked in a row (#1090, #1089).
  await menu.getByRole("menuitemcheckbox", { name: value, exact: true }).click();
  await expect(page.getByRole("button", { name: `${property}: ${value}` })).toBeVisible();
  // Which means this has to close it again: every caller expects to be handed a
  // toolbar with nothing covering it, and two of these calls run back to back.
  await onlyVisible(page.getByRole("button", { name: /^Filter$/ })).click();
  await expect(menu).toBeHidden();
}
