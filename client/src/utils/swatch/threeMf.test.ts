import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertWatertight, meshVolume } from "../../test/meshHelpers";
import { Mesh } from "./geometry";
import { SwatchInput } from "./layout";
import { buildSwatchLayoutForStyle } from "./styles";
import { buildSwatch3mf, buildSwatchMeshes } from "./threeMf";

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

function meshFromObjectElement(object: Element): Mesh {
  const mesh: Mesh = { vertices: [], triangles: [] };
  const meshElement = childElements(object, "mesh")[0];
  for (const vertex of childElements(childElements(meshElement, "vertices")[0], "vertex")) {
    mesh.vertices.push(
      Number(vertex.getAttribute("x")),
      Number(vertex.getAttribute("y")),
      Number(vertex.getAttribute("z")),
    );
  }
  for (const triangle of childElements(childElements(meshElement, "triangles")[0], "triangle")) {
    mesh.triangles.push(
      Number(triangle.getAttribute("v1")),
      Number(triangle.getAttribute("v2")),
      Number(triangle.getAttribute("v3")),
    );
  }
  return mesh;
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
});

describe("buildSwatch3mf", () => {
  const layout = buildSwatchLayoutForStyle(INPUT);
  const data = buildSwatch3mf(layout, { title: "Test swatch", description: "How to print it" });

  it("contains the three OPC package files", () => {
    const files = unzipSync(data);
    expect(strFromU8(files["[Content_Types].xml"])).toContain("3dmanufacturing-3dmodel+xml");
    expect(strFromU8(files["_rels/.rels"])).toContain('Target="/3D/3dmodel.model"');
  });

  it("declares the 3MF core namespace and millimeter unit", () => {
    const doc = parseModel(data);
    expect(doc.documentElement.namespaceURI).toBe(MODEL_NS);
    expect(doc.documentElement.getAttribute("unit")).toBe("millimeter");
  });

  it("carries title and description metadata", () => {
    const doc = parseModel(data);
    const metadata = [...doc.getElementsByTagNameNS(MODEL_NS, "metadata")];
    const byName = Object.fromEntries(metadata.map((m) => [m.getAttribute("name"), m.textContent]));
    expect(byName.Title).toBe("Test swatch");
    expect(byName.Description).toBe("How to print it");
    expect(byName.Application).toBe("Spoolman");
  });

  it("defines base and marking materials with the layout colors", () => {
    const doc = parseModel(data);
    const bases = [...doc.getElementsByTagNameNS(MODEL_NS, "base")];
    expect(bases.map((base) => base.getAttribute("displaycolor"))).toEqual(["#e8e8e8", "#000000"]);
  });

  it("assembles both mesh objects into one component object referenced by the build", () => {
    const doc = parseModel(data);
    const objects = [...doc.getElementsByTagNameNS(MODEL_NS, "object")];
    const meshObjects = objects.filter((object) => object.getElementsByTagNameNS(MODEL_NS, "mesh").length > 0);
    expect(meshObjects).toHaveLength(2);
    const componentObjects = objects.filter(
      (object) => object.getElementsByTagNameNS(MODEL_NS, "components").length > 0,
    );
    expect(componentObjects).toHaveLength(1);
    const referencedIds = [...componentObjects[0].getElementsByTagNameNS(MODEL_NS, "component")].map((component) =>
      component.getAttribute("objectid"),
    );
    expect(referencedIds.sort()).toEqual(meshObjects.map((object) => object.getAttribute("id")).sort());
    const items = [...doc.getElementsByTagNameNS(MODEL_NS, "item")];
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute("objectid")).toBe(componentObjects[0].getAttribute("id"));
  });

  it("round-trips watertight meshes with plausible volumes", () => {
    const doc = parseModel(data);
    const meshObjects = [...doc.getElementsByTagNameNS(MODEL_NS, "object")].filter(
      (object) => object.getElementsByTagNameNS(MODEL_NS, "mesh").length > 0,
    );
    const base = meshFromObjectElement(meshObjects[0]);
    const marking = meshFromObjectElement(meshObjects[1]);
    assertWatertight(base);
    assertWatertight(marking);
    // base: 75x34x2.4 minus rounded corners => a bit below 6120 mm^3
    expect(meshVolume(base)).toBeGreaterThan(5900);
    expect(meshVolume(base)).toBeLessThan(75 * 34 * 2.4);
    expect(meshVolume(marking)).toBeGreaterThan(0);
  });

  it("uses a neutral base display color when the filament color is unknown", () => {
    const gray = buildSwatch3mf(buildSwatchLayoutForStyle({ ...INPUT, colorHexes: [] }), { title: "t" });
    const doc = parseModel(gray);
    const bases = [...doc.getElementsByTagNameNS(MODEL_NS, "base")];
    expect(bases[0].getAttribute("displaycolor")).toBe("#d9d9d9");
  });

  it("escapes XML metacharacters in metadata and object names", () => {
    const evil = buildSwatch3mf(layout, { title: 'Vendor <&> "Sons"' });
    const doc = parseModel(evil);
    const metadata = [...doc.getElementsByTagNameNS(MODEL_NS, "metadata")];
    const title = metadata.find((m) => m.getAttribute("name") === "Title");
    expect(title?.textContent).toBe('Vendor <&> "Sons"');
  });

  it("names the marking part after the chosen marking color", () => {
    const dark = buildSwatchLayoutForStyle({ ...INPUT, colorHexes: ["000000"] });
    const doc = parseModel(buildSwatch3mf(dark, { title: "t" }));
    const names = [...doc.getElementsByTagNameNS(MODEL_NS, "object")].map((object) => object.getAttribute("name"));
    expect(names).toContain("Swatch marking (white)");
    const bases = [...doc.getElementsByTagNameNS(MODEL_NS, "base")];
    expect(bases.map((base) => base.getAttribute("displaycolor"))).toEqual(["#000000", "#ffffff"]);
  });
});
