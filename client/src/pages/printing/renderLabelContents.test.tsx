import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderLabelContents } from "./printing";

// The label template engine (TESTING_CANDIDATES row 77), generalised from ISpool to
// any object in PR #4. Oracle: the rendered text/markup for hand-written templates —
// asserted through the DOM output, not the implementation. Covers tag substitution,
// nested lookups, extra-field JSON, conditional blocks, bold and newlines.
function textOf(template: string, obj: Record<string, unknown>): string {
  const { container } = render(renderLabelContents(template, obj as never));
  return container.textContent ?? "";
}

describe("renderLabelContents", () => {
  it("substitutes a simple {tag}", () => {
    expect(textOf("Name: {name}", { name: "PLA", extra: {} })).toBe("Name: PLA");
  });

  it("renders a missing tag as '?'", () => {
    expect(textOf("{material}", { extra: {} })).toBe("?");
  });

  it("resolves a nested {vendor.name}", () => {
    expect(textOf("{vendor.name}", { vendor: { name: "Acme" }, extra: {} })).toBe("Acme");
  });

  it("renders '?' for a missing nested field", () => {
    expect(textOf("{vendor.name}", { vendor: {}, extra: {} })).toBe("?");
  });

  it("JSON-decodes an {extra.*} value", () => {
    expect(textOf("{extra.color}", { extra: { color: '"Red"' } })).toBe("Red");
    // A numeric extra decodes to its number.
    expect(textOf("{extra.diameter}", { extra: { diameter: "1.75" } })).toBe("1.75");
  });

  it("keeps a conditional block when the inner tag resolves", () => {
    expect(textOf("{Diameter: {diameter} mm}", { diameter: 1.75, extra: {} })).toBe("Diameter: 1.75 mm");
  });

  it("drops a conditional block entirely when the inner tag is missing", () => {
    expect(textOf("{Diameter: {diameter} mm}", { extra: {} })).toBe("");
  });

  it("bolds **text** into a <b> element", () => {
    const { container } = render(renderLabelContents("**Bold** rest", { extra: {} } as never));
    const bold = container.querySelector("b");
    expect(bold?.textContent).toBe("Bold");
    expect(container.textContent).toBe("Bold rest");
  });

  it("turns a newline into a <br>", () => {
    const { container } = render(renderLabelContents("a\nb", { extra: {} } as never));
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.textContent).toBe("ab");
  });
});
