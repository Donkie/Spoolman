import { describe, expect, it } from "vitest";
import { assertWatertight, meshBounds, meshVolume } from "../../test/meshHelpers";
import { addBox, addExtrudedConvexPolygon, emptyMesh, roundedRectanglePolygon } from "./geometry";

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
