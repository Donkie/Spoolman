import { render, screen } from "@testing-library/react";
import i18n from "i18next";
import { MemoryRouter } from "react-router";
import { initReactI18next } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";
import en from "../../../public/locales/en/common.json";
import { Help } from "./index";

// TESTING_STRATEGY "Remaining": real-<Trans> rendering. Unlike the dashboard tests
// (which stub Trans to print the key), this initializes real i18next with the real
// English resource so the interpolated components inside help.description — router
// links, the external README link, and the embedded resources <List> — actually
// render. This is the contract a translator can break: a locale dropping the
// component tags would ship a help page with dead links.

vi.mock("@refinedev/antd", () => ({
  // The refine List layout needs a full refine context; the Help page only uses it
  // as a titled wrapper, so a passthrough keeps the test focused on the content.
  List: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@refinedev/core", async () => {
  const { default: i18next } = await import("i18next");
  return {
    useTranslate: () => (key: string, fallback?: string) => {
      const value = i18next.t(key);
      return value === key && fallback !== undefined ? fallback : value;
    },
  };
});

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    ns: "common",
    defaultNS: "common",
    resources: { en: { common: en } },
    interpolation: { escapeValue: false },
  });
});

describe("help page <Trans> interpolation", () => {
  it("renders the description with working create-links and the README link", () => {
    render(
      <MemoryRouter>
        <Help />
      </MemoryRouter>,
    );

    expect(screen.getByText("Here are some tips to get you started.")).toBeInTheDocument();

    // The component tags in help.description become real links.
    expect(screen.getByRole("link", { name: "Filament" })).toHaveAttribute("href", "/filament/create");
    expect(screen.getByRole("link", { name: "Spool" })).toHaveAttribute("href", "/spool/create");
    expect(screen.getByRole("link", { name: "Manufacturer" })).toHaveAttribute("href", "/vendor/create");
    expect(screen.getByRole("link", { name: "Spoolman README" })).toHaveAttribute(
      "href",
      "https://github.com/sherrmann/Spoolman#integrations",
    );

    // The self-closing <itemsHelp/> tag renders the embedded resources list.
    expect(screen.getByText("Individual physical spools of a specific filament.")).toBeInTheDocument();
    expect(screen.getByText("The companies that make the filament.")).toBeInTheDocument();
  });
});
