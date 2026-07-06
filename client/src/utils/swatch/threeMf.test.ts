import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertWatertight, meshBounds, meshVolume } from "../../test/meshHelpers";
import { Mesh } from "./geometry";
import { SwatchInput } from "./layout";
import { buildSwatchLayoutForStyle } from "./styles";
import { buildSwatch3mf, buildSwatchMeshes, MARKING_EMBED_MM } from "./threeMf";

const INPUT: SwatchInput = {
  id: 42,
  name: "Galaxy Black",
  vendorName: "Prusament",
  material: "PLA",
  diameterMm: 1.75,
  weightG: 1000,
  extruderTempC: 215,
  bedTempC: 60,
  colorHexes: ["e8e8e8"],
  qrPayload: "WEB+SPOOLMAN:F-42",
};

const MODEL_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const MATERIAL_NS = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02";

function parseModel(data: Uint8Array): Document {
  const files = unzipSync(data);
  const doc = new DOMParser().parseFromString(strFromU8(files["3D/3dmodel.model"]), "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

/** Direct child elements with a given local name (jsdom's live tag collections are too slow for big meshes). */
function childElements(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === localName) result.push(child);
  }
  return result;
}

/**
 * The parts of the single mesh object, split by the per-triangle color
 * property: triangles without p1 are the base, p1="1" is the marking. Both
 * share the full vertex list, which is fine for the mesh helpers (they only
 * look at vertices referenced by triangles).
 */
function meshPartsFromObjectElement(object: Element): { base: Mesh; marking: Mesh } {
  const vertices: number[] = [];
  const meshElement = childElements(object, "mesh")[0];
  for (const vertex of childElements(childElements(meshElement, "vertices")[0], "vertex")) {
    vertices.push(Number(vertex.getAttribute("x")), Number(vertex.getAttribute("y")), Number(vertex.getAttribute("z")));
  }
  const base: Mesh = { vertices, triangles: [] };
  const marking: Mesh = { vertices, triangles: [] };
  for (const triangle of childElements(childElements(meshElement, "triangles")[0], "triangle")) {
    const target = triangle.getAttribute("p1") === "1" ? marking : base;
    target.triangles.push(
      Number(triangle.getAttribute("v1")),
      Number(triangle.getAttribute("v2")),
      Number(triangle.getAttribute("v3")),
    );
  }
  return { base, marking };
}

function meshObject(doc: Document): Element {
  const objects = [...doc.getElementsByTagNameNS(MODEL_NS, "object")];
  expect(objects).toHaveLength(1);
  return objects[0];
}

describe("buildSwatchMeshes", () => {
  it("emits one box shell per marking rect", () => {
    const layout = buildSwatchLayoutForStyle(INPUT);
    const { marking } = buildSwatchMeshes(layout);
    expect(marking.vertices).toHaveLength(layout.markRects.length * 8 * 3);
    expect(marking.triangles).toHaveLength(layout.markRects.length * 12 * 3);
  });

  it("mirrors the 2D y-axis so the layout is not printed mirrored", () => {
    const layout = buildSwatchLayoutForStyle(INPUT);
    const { marking } = buildSwatchMeshes(layout);
    // the topmost 2D rect (smallest y) must become the largest 3D y
    const topRect = layout.markRects.reduce((a, b) => (a.y < b.y ? a : b));
    let maxY = -Infinity;
    for (let i = 1; i < marking.vertices.length; i += 3) {
      maxY = Math.max(maxY, marking.vertices[i]);
    }
    expect(maxY).toBeCloseTo(layout.heightMm - topRect.y, 6);
  });

  it("sinks the marking into the base so the parts strictly overlap", () => {
    const layout = buildSwatchLayoutForStyle(INPUT);
    const { marking } = buildSwatchMeshes(layout);
    const bounds = meshBounds(marking);
    expect(bounds.min[2]).toBeCloseTo(layout.baseThicknessMm - MARKING_EMBED_MM, 9);
    expect(bounds.max[2]).toBeCloseTo(layout.baseThicknessMm + layout.markingThicknessMm, 9);
  });
});

describe("buildSwatch3mf", () => {
  const layout = buildSwatchLayoutForStyle(INPUT);
  const data = buildSwatch3mf(layout, { title: "Test swatch", description: "How to print it" });

  it("contains the three OPC package files", () => {
    const files = unzipSync(data);
    expect(strFromU8(files["[Content_Types].xml"])).toContain("3dmanufacturing-3dmodel+xml");
    expect(strFromU8(files["_rels/.rels"])).toContain('Target="/3D/3dmodel.model"');
  });

  it("declares the 3MF core and material namespaces and millimeter unit", () => {
    const doc = parseModel(data);
    expect(doc.documentElement.namespaceURI).toBe(MODEL_NS);
    expect(doc.documentElement.getAttribute("unit")).toBe("millimeter");
    expect(doc.documentElement.getAttribute("xmlns:m")).toBe(MATERIAL_NS);
  });

  it("carries title and description metadata", () => {
    const doc = parseModel(data);
    const metadata = [...doc.getElementsByTagNameNS(MODEL_NS, "metadata")];
    const byName = Object.fromEntries(metadata.map((m) => [m.getAttribute("name"), m.textContent]));
    expect(byName.Title).toBe("Test swatch");
    expect(byName.Description).toBe("How to print it");
    expect(byName.Application).toBe("Spoolman");
  });

  it("defines a color group with the base and marking colors", () => {
    const doc = parseModel(data);
    const groups = [...doc.getElementsByTagNameNS(MATERIAL_NS, "colorgroup")];
    expect(groups).toHaveLength(1);
    const colors = [...groups[0].getElementsByTagNameNS(MATERIAL_NS, "color")];
    expect(colors.map((color) => color.getAttribute("color"))).toEqual(["#e8e8e8", "#000000"]);
  });

  it("builds a single mesh object that defaults to the base color and is referenced by the build", () => {
    const doc = parseModel(data);
    const object = meshObject(doc);
    expect(object.getElementsByTagNameNS(MODEL_NS, "components")).toHaveLength(0);
    const groupId = [...doc.getElementsByTagNameNS(MATERIAL_NS, "colorgroup")][0].getAttribute("id");
    expect(object.getAttribute("pid")).toBe(groupId);
    expect(object.getAttribute("pindex")).toBe("0");
    expect(object.getAttribute("name")).toBe("Test swatch");
    const items = [...doc.getElementsByTagNameNS(MODEL_NS, "item")];
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute("objectid")).toBe(object.getAttribute("id"));
  });

  it("face-colors exactly the marking triangles with the second color", () => {
    const doc = parseModel(data);
    const { base, marking } = meshPartsFromObjectElement(meshObject(doc));
    const meshes = buildSwatchMeshes(layout);
    expect(marking.triangles.length).toBe(meshes.marking.triangles.length);
    expect(base.triangles.length).toBe(meshes.base.triangles.length);
  });

  it("round-trips watertight part meshes with plausible volumes", () => {
    const doc = parseModel(data);
    const { base, marking } = meshPartsFromObjectElement(meshObject(doc));
    assertWatertight(base);
    assertWatertight(marking);
    // base: 75x34x2.4 minus rounded corners => a bit below 6120 mm^3
    expect(meshVolume(base)).toBeGreaterThan(5900);
    expect(meshVolume(base)).toBeLessThan(75 * 34 * 2.4);
    expect(meshVolume(marking)).toBeGreaterThan(0);
    // the marking overlaps the base instead of merely touching it
    expect(meshBounds(marking).min[2]).toBeLessThan(meshBounds(base).max[2]);
  });

  it("uses a neutral base display color when the filament color is unknown", () => {
    const gray = buildSwatch3mf(buildSwatchLayoutForStyle({ ...INPUT, colorHexes: [] }), { title: "t" });
    const doc = parseModel(gray);
    const colors = [...doc.getElementsByTagNameNS(MATERIAL_NS, "color")];
    expect(colors[0].getAttribute("color")).toBe("#d9d9d9");
  });

  it("escapes XML metacharacters in metadata and object names", () => {
    const evil = buildSwatch3mf(layout, { title: 'Vendor <&> "Sons"' });
    const doc = parseModel(evil);
    const metadata = [...doc.getElementsByTagNameNS(MODEL_NS, "metadata")];
    const title = metadata.find((m) => m.getAttribute("name") === "Title");
    expect(title?.textContent).toBe('Vendor <&> "Sons"');
    expect(meshObject(doc).getAttribute("name")).toBe('Vendor <&> "Sons"');
  });

  it("switches to a white marking color on dark filaments", () => {
    const dark = buildSwatchLayoutForStyle({ ...INPUT, colorHexes: ["000000"] });
    const doc = parseModel(buildSwatch3mf(dark, { title: "t" }));
    const colors = [...doc.getElementsByTagNameNS(MATERIAL_NS, "color")];
    expect(colors.map((color) => color.getAttribute("color"))).toEqual(["#000000", "#ffffff"]);
  });
});
