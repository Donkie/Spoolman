import { useList } from "@refinedev/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorModeContext } from "../../contexts/color-mode";
import { IFilament } from "../filaments/model";
import { ISpool } from "../spools/model";
import { Home } from "./index";

// Mock at the boundaries: refine's data/i18n/navigation hooks and the settings-backed
// currency formatter. The router is real (MemoryRouter). This lets us drive the four
// render-state branches directly and assert what the USER sees — in particular that the
// error state is distinct from the empty-onboarding state (the bug fixed in PR #3).
vi.mock("@refinedev/core", () => ({
  useList: vi.fn(),
  useTranslate: () => (key: string, fallback?: string) => fallback ?? key,
  useNavigation: () => ({ showUrl: (resource: string, id: number) => `/${resource}/show/${id}` }),
}));
vi.mock("react-i18next", () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));
vi.mock("../../utils/settings", () => ({
  useCurrencyFormatter: () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
}));

const mockedUseList = vi.mocked(useList);

function filament(over: Partial<IFilament> = {}): IFilament {
  return { id: 1, registered: "2024-01-01", density: 1.24, diameter: 1.75, extra: {}, ...over };
}

let nextId = 1;
function spool(over: Partial<ISpool> = {}): ISpool {
  const { filament: fil, ...rest } = over;
  return {
    id: nextId++,
    registered: "2024-01-01T00:00:00Z",
    filament: fil ?? filament(),
    used_weight: 0,
    used_length: 0,
    archived: false,
    extra: {},
    ...rest,
  };
}

interface SpoolQueryState {
  data?: ISpool[];
  isLoading?: boolean;
  isError?: boolean;
  refetch?: () => void;
}

function setSpoolQuery({ data = [], isLoading = false, isError = false, refetch = vi.fn() }: SpoolQueryState) {
  // useList is called for "spool", "filament" and "vendor"; only the spool query drives
  // the render-state branches. filament/vendor just supply KPI totals.
  mockedUseList.mockImplementation(
    (opts) =>
      (opts?.resource === "spool"
        ? { result: { data, total: data.length }, query: { isLoading, isError, refetch } }
        : { result: { total: 0 }, query: { isLoading: false, isError: false } }) as unknown as ReturnType<
        typeof useList
      >,
  );
}

function renderHome() {
  return render(
    <MemoryRouter>
      <ColorModeContext.Provider value={{ mode: "dark", setMode: () => {} }}>
        <Home />
      </ColorModeContext.Provider>
    </MemoryRouter>,
  );
}

describe("Home render states", () => {
  beforeEach(() => {
    nextId = 1;
    mockedUseList.mockReset();
  });

  it("shows the loading state while spools are loading", () => {
    setSpoolQuery({ isLoading: true });
    renderHome();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows the error state (not onboarding) and refetches on refresh", async () => {
    const refetch = vi.fn();
    setSpoolQuery({ isError: true, refetch });
    renderHome();

    expect(screen.getByText("Failed to load spools")).toBeInTheDocument();
    // The fixed bug: an error must NOT fall through to the empty-hero onboarding.
    expect(screen.queryByText("home.welcome")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("buttons.refresh"));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows the empty-hero onboarding when there are no spools", () => {
    setSpoolQuery({ data: [] });
    renderHome();
    expect(screen.getByText("home.welcome")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load spools")).not.toBeInTheDocument();
  });

  it("renders the dashboard when spools exist", () => {
    setSpoolQuery({ data: [spool(), spool()] });
    renderHome();
    // The dashboard header is only present in the populated branch.
    expect(screen.getByText("home.home")).toBeInTheDocument();
    expect(screen.queryByText("home.welcome")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});

// A spool whose remaining fraction falls below the low-stock threshold.
function lowStockSpool(): ISpool {
  return spool({ remaining_weight: 30, initial_weight: 1000 });
}

describe("Home dashboard interactions", () => {
  beforeEach(() => {
    nextId = 1;
    mockedUseList.mockReset();
  });

  it("makes each KPI card a link to its resource list", () => {
    setSpoolQuery({ data: [spool()] });
    const { container } = renderHome();
    const hrefs = Array.from(container.querySelectorAll("a.kpi-card")).map((a) => a.getAttribute("href"));
    // Spools, Filaments, Manufacturers, Total Stock (spool-derived) in order.
    expect(hrefs).toEqual(["/spool", "/filament", "/vendor", "/spool"]);
  });

  it("shows no low-stock warning icon and defaults to the material tab when nothing is low", () => {
    setSpoolQuery({ data: [spool(), spool()] });
    renderHome();
    // No warning triangle anywhere (neither the KPI footer nor the tab label).
    expect(screen.queryByLabelText("warning")).not.toBeInTheDocument();
    // By Material is the active tab.
    expect(screen.getByRole("tab", { name: /home\.by_material/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /home\.low_stock/ })).toHaveAttribute("aria-selected", "false");
  });

  it("shows the low-stock warning icon and defaults to the low-stock tab when stock is low", () => {
    setSpoolQuery({ data: [lowStockSpool(), spool()] });
    renderHome();
    // At least one warning triangle is rendered (tab label + KPI footer).
    expect(screen.getAllByLabelText("warning").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /home\.low_stock/ })).toHaveAttribute("aria-selected", "true");
  });
});
