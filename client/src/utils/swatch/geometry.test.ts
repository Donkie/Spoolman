import { describe, expect, it } from "vitest";
import { assertWatertight, meshBounds, meshVolume } from "../../test/meshHelpers";
import {
  addBox,
  addExtrudedConvexPolygon,
  addExtrudedPlateWithHangerTab,
  addExtrudedPlateWithHole,
  clipConvexPolygon,
  emptyMesh,
  roundedRectanglePolygon,
} from "./geometry";

function shoelaceArea(points: ReadonlyArray<readonly [number, number]>): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

describe("addBox", () => {
  it("emits a closed box with the exact volume", () => {
    const mesh = emptyMesh();
    addBox(mesh, 1, 2, 3, 3, 5, 7);
    expect(mesh.vertices).toHaveLength(8 * 3);
    expect(mesh.triangles).toHaveLength(12 * 3);
    assertWatertight(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(2 * 3 * 4, 9);
    expect(meshBounds(mesh)).toEqual({ min: [1, 2, 3], max: [3, 5, 7] });
  });

  it("skips degenerate boxes", () => {
    const mesh = emptyMesh();
    addBox(mesh, 0, 0, 0, 5, 5, 0);
    addBox(mesh, 0, 0, 0, 0, 5, 5);
    expect(mesh.triangles).toHaveLength(0);
  });

  it("appends multiple independent shells to one mesh", () => {
    const mesh = emptyMesh();
    addBox(mesh, 0, 0, 0, 1, 1, 1);
    addBox(mesh, 2, 0, 0, 3, 1, 1);
    assertWatertight(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(2, 9);
  });
});

describe("addExtrudedConvexPolygon", () => {
  it("extrudes a square into a closed prism", () => {
    const mesh = emptyMesh();
    addExtrudedConvexPolygon(
      mesh,
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      0,
      2,
    );
    assertWatertight(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(8, 9);
  });

  it("matches shoelace-area x height for irregular convex polygons", () => {
    const polygon = roundedRectanglePolygon(20, 10, 3);
    const mesh = emptyMesh();
    addExtrudedConvexPolygon(mesh, polygon, 0, 2.4);
    assertWatertight(mesh);
    expect(meshVolume(mesh)).toBeCloseTo(shoelaceArea(polygon) * 2.4, 6);
  });

  it("ignores degenerate input", () => {
    const mesh = emptyMesh();
    addExtrudedConvexPolygon(
      mesh,
      [
        [0, 0],
        [1, 0],
      ],
      0,
      1,
    );
    addExtrudedConvexPolygon(
      mesh,
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      1,
      1,
    );
    expect(mesh.triangles).toHaveLength(0);
  });
});

describe("roundedRectanglePolygon", () => {
  it("is counter-clockwise (positive shoelace area)", () => {
    expect(shoelaceArea(roundedRectanglePolygon(75, 34, 3))).toBeGreaterThan(0);
  });

  it("approximates the exact rounded-rectangle area", () => {
    const w = 75,
      h = 34,
      r = 3;
    const exact = w * h - (4 - Math.PI) * r * r;
    const approx = shoelaceArea(roundedRectanglePolygon(w, h, r, 16));
    expect(approx).toBeGreaterThan(exact * 0.999);
    expect(approx).toBeLessThanOrEqual(exact);
  });

  it("has no repeated consecutive points", () => {
    const points = roundedRectanglePolygon(10, 10, 2);
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(1e-6);
    }
  });

  it("degrades to a plain rectangle for radius 0", () => {
    expect(roundedRectanglePolygon(4, 2, 0)).toEqual([
      [4, 0],
      [4, 2],
      [0, 2],
      [0, 0],
    ]);
  });

  it("clamps an oversized radius", () => {
    const points = roundedRectanglePolygon(10, 6, 100);
    // radius is clamped to height/2 = 3
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(6 + 1e-9);
    }
    expect(shoelaceArea(points)).toBeGreaterThan(0);
  });
});

describe("clipConvexPolygon", () => {
  const square: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it("clips a square to a half-plane", () => {
    // keep x <= 1
    expect(clipConvexPolygon(square, 1, 0, 1)).toEqual([
      [0, 0],
      [1, 0],
      [1, 4],
      [0, 4],
    ]);
  });

  it("returns the polygon unchanged when fully inside", () => {
    expect(clipConvexPolygon(square, 1, 0, 10)).toEqual(square);
  });

  it("returns [] when nothing remains", () => {
    expect(clipConvexPolygon(square, 1, 0, -1)).toEqual([]);
  });

  it("preserves counter-clockwise orientation and area additivity", () => {
    const left = clipConvexPolygon(square, 1, 0, 1.5);
    const right = clipConvexPolygon(square, -1, 0, -1.5);
    expect(shoelaceArea(left)).toBeGreaterThan(0);
    expect(shoelaceArea(right)).toBeGreaterThan(0);
    expect(shoelaceArea(left) + shoelaceArea(right)).toBeCloseTo(shoelaceArea(square), 9);
  });
});

describe("addExtrudedPlateWithHole", () => {
  const outline = roundedRectanglePolygon(75, 34, 3);
  const hole = { cx: 6, cy: 17, r: 2.4 };

  it("builds watertight shells with the exact tiled volume", () => {
    const mesh = emptyMesh();
    addExtrudedPlateWithHole(mesh, outline, hole, 0, 2.4, 16);
    assertWatertight(mesh);
    // The pieces tile the outline exactly, minus the 16-gon hole (both are
    // piecewise linear, so this is an equality up to float error).
    const holeNgonArea = 0.5 * 16 * hole.r * hole.r * Math.sin((2 * Math.PI) / 16);
    expect(meshVolume(mesh)).toBeCloseTo((shoelaceArea(outline) - holeNgonArea) * 2.4, 6);
  });

  it("stays within the outline's bounding box", () => {
    const mesh = emptyMesh();
    addExtrudedPlateWithHole(mesh, outline, hole, 0, 2.4);
    const bounds = meshBounds(mesh);
    expect(bounds.min[0]).toBeGreaterThanOrEqual(-1e-9);
    expect(bounds.max[0]).toBeLessThanOrEqual(75 + 1e-9);
    expect(bounds.min[1]).toBeGreaterThanOrEqual(-1e-9);
    expect(bounds.max[1]).toBeLessThanOrEqual(34 + 1e-9);
  });

  it("leaves no material inside the hole", () => {
    const mesh = emptyMesh();
    addExtrudedPlateWithHole(mesh, outline, hole, 0, 2.4);
    // No vertex may lie strictly inside the hole polygon's inscribed circle.
    const safeRadius = hole.r * Math.cos(Math.PI / 16) - 1e-9;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const distance = Math.hypot(mesh.vertices[i] - hole.cx, mesh.vertices[i + 1] - hole.cy);
      expect(distance).toBeGreaterThanOrEqual(safeRadius);
    }
  });
});

describe("addExtrudedPlateWithHangerTab", () => {
  const outline = roundedRectanglePolygon(75, 34, 3);
  const tab = { cx: 37.5, edgeY: 34, holeR: 2.5, outerR: 5.5 };
  const SEGMENTS = 16;

  function ngonArea(radius: number): number {
    return 0.5 * SEGMENTS * radius * radius * Math.sin((2 * Math.PI) / SEGMENTS);
  }

  it("builds watertight shells with the exact tiled volume", () => {
    const mesh = emptyMesh();
    addExtrudedPlateWithHangerTab(mesh, outline, tab, 0, 2.4, SEGMENTS);
    assertWatertight(mesh);
    // Card minus the hole's lower half, plus the tab's upper half-annulus —
    // all piecewise linear, so the tiling is exact up to float error.
    const expectedArea = shoelaceArea(outline) + ngonArea(tab.outerR) / 2 - ngonArea(tab.holeR);
    expect(meshVolume(mesh)).toBeCloseTo(expectedArea * 2.4, 6);
  });

  it("protrudes exactly outerR above the top edge and stays within the width", () => {
    const mesh = emptyMesh();
    addExtrudedPlateWithHangerTab(mesh, outline, tab, 0, 2.4);
    const bounds = meshBounds(mesh);
    expect(bounds.max[1]).toBeCloseTo(tab.edgeY + tab.outerR, 9);
    expect(bounds.min[1]).toBeGreaterThanOrEqual(-1e-9);
    expect(bounds.min[0]).toBeGreaterThanOrEqual(-1e-9);
    expect(bounds.max[0]).toBeLessThanOrEqual(75 + 1e-9);
  });

  it("leaves no material inside the nail hole", () => {
    const mesh = emptyMesh();
    addExtrudedPlateWithHangerTab(mesh, outline, tab, 0, 2.4);
    const safeRadius = tab.holeR * Math.cos(Math.PI / SEGMENTS) - 1e-9;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const distance = Math.hypot(mesh.vertices[i] - tab.cx, mesh.vertices[i + 1] - tab.edgeY);
      expect(distance).toBeGreaterThanOrEqual(safeRadius);
    }
  });
});
