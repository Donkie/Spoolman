import { describe, expect, it } from "vitest";
import { makeQrModules, pickQrMode } from "./qr";

describe("pickQrMode", () => {
  it("classifies payload charsets into the densest usable mode", () => {
    expect(pickQrMode("123456")).toBe("Numeric");
    expect(pickQrMode("WEB+SPOOLMAN:F-42")).toBe("Alphanumeric");
    expect(pickQrMode("A B$%*+-./:12")).toBe("Alphanumeric");
    // lowercase is not in the QR alphanumeric charset
    expect(pickQrMode("https://spool.example.com/filament/show/42")).toBe("Byte");
    expect(pickQrMode("WEB+SPOOLMAN:F-42é")).toBe("Byte");
    expect(pickQrMode("")).toBe("Byte");
  });
});

describe("makeQrModules", () => {
  it("packs the default swatch payload into a version-1 code via alphanumeric mode", () => {
    // byte mode would need version 2 (25 modules) for the same payload
    expect(makeQrModules("WEB+SPOOLMAN:F-42", "M")).toHaveLength(21);
  });

  it("returns a square matrix with the finder patterns in place", () => {
    const modules = makeQrModules("WEB+SPOOLMAN:F-42", "M");
    for (const row of modules) {
      expect(row).toHaveLength(modules.length);
    }
    // every finder pattern corner module is dark
    const last = modules.length - 1;
    expect(modules[0][0]).toBe(true);
    expect(modules[0][last]).toBe(true);
    expect(modules[last][0]).toBe(true);
  });

  it("still encodes payloads outside the alphanumeric charset in byte mode", () => {
    const modules = makeQrModules("https://spool.example.com/filament/show/42", "M");
    expect(modules.length).toBeGreaterThan(21);
  });
});
