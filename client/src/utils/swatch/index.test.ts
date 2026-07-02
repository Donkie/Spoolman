import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFilamentSwatch, saveBinaryFile, swatchFilename, swatchInputFromFilament, swatchTitle } from "./index";

const FILAMENT = {
  id: 42,
  name: "Galaxy Black",
  material: "PLA",
  diameter: 1.75,
  weight: 1000,
  settings_extruder_temp: 215,
  settings_bed_temp: 60,
  article_number: "ART-42",
  color_hex: "aabbcc",
  multi_color_hexes: undefined,
  vendor: { name: "Prusament" },
};

describe("swatchInputFromFilament", () => {
  it("maps the filament fields", () => {
    const input = swatchInputFromFilament(FILAMENT, { qrPayload: "WEB+SPOOLMAN:F-42" });
    expect(input).toEqual({
      id: 42,
      name: "Galaxy Black",
      vendorName: "Prusament",
      material: "PLA",
      diameterMm: 1.75,
      weightG: 1000,
      extruderTempC: 215,
      bedTempC: 60,
      articleNumber: "ART-42",
      colorHexes: ["aabbcc"],
      qrPayload: "WEB+SPOOLMAN:F-42",
    });
  });

  it("prefers an explicit vendor name over the vendor object (collapsed rows)", () => {
    const input = swatchInputFromFilament(FILAMENT, { qrPayload: "x", vendorName: "Overridden" });
    expect(input.vendorName).toBe("Overridden");
    const withoutVendor = swatchInputFromFilament({ ...FILAMENT, vendor: undefined }, { qrPayload: "x" });
    expect(withoutVendor.vendorName).toBeUndefined();
  });

  it("splits multi-color filaments into their component colors", () => {
    const input = swatchInputFromFilament({ ...FILAMENT, multi_color_hexes: "112233,445566" }, { qrPayload: "x" });
    expect(input.colorHexes).toEqual(["112233", "445566"]);
  });

  it("turns empty strings into undefined", () => {
    const input = swatchInputFromFilament(
      { ...FILAMENT, name: "", material: "", article_number: "" },
      { qrPayload: "x" },
    );
    expect(input.name).toBeUndefined();
    expect(input.material).toBeUndefined();
    expect(input.articleNumber).toBeUndefined();
  });
});

describe("swatchTitle", () => {
  it("joins vendor and name", () => {
    expect(swatchTitle(swatchInputFromFilament(FILAMENT, { qrPayload: "x" }))).toBe("Prusament Galaxy Black");
  });

  it("falls back to the filament id", () => {
    expect(swatchTitle({ id: 7, colorHexes: [], qrPayload: "x" })).toBe("Filament #7");
  });
});

describe("swatchFilename", () => {
  const input = swatchInputFromFilament(FILAMENT, { qrPayload: "x" });

  it("builds a descriptive, safe filename including the style", () => {
    expect(swatchFilename(input)).toBe("swatch_classic_42_Prusament_Galaxy_Black.3mf");
    expect(swatchFilename(input, "compact")).toBe("swatch_compact_42_Prusament_Galaxy_Black.3mf");
  });

  it("strips unsafe characters and falls back to the default style for unknown keys", () => {
    const weird = { ...input, vendorName: "Über/Cool GmbH & Co.", name: 'Näme "quoted"' };
    expect(swatchFilename(weird, "no-such-style")).toBe("swatch_classic_42_berCool_GmbH__Co._Nme_quoted.3mf");
  });

  it("omits missing parts entirely", () => {
    expect(swatchFilename({ id: 7, colorHexes: [], qrPayload: "x" })).toBe("swatch_classic_7.3mf");
  });
});

describe("generateFilamentSwatch", () => {
  it("produces a non-empty 3MF and a matching filename", () => {
    const input = swatchInputFromFilament(FILAMENT, { qrPayload: "WEB+SPOOLMAN:F-42" });
    const { data, filename } = generateFilamentSwatch(input, "card");
    expect(data.length).toBeGreaterThan(1000);
    expect(filename).toBe("swatch_card_42_Prusament_Galaxy_Black.3mf");
  });
});

describe("saveBinaryFile", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("downloads via a temporary anchor and revokes the object URL", () => {
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let downloadName = "";
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
      expect(document.body.contains(this)).toBe(true);
    });

    saveBinaryFile(new Uint8Array([1, 2, 3]), "test.3mf");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloadName).toBe("test.3mf");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(document.querySelector("a")).toBeNull();
  });
});
