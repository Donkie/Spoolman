// Minimal triangle-mesh builders for the swatch model. All faces are emitted
// with counter-clockwise winding seen from the outside (positive volume), as
// required by the 3MF core spec.

export interface Mesh {
  /** Flat xyz triples, in mm. */
  vertices: number[];
  /** Flat vertex-index triples. */
  triangles: number[];
}

export function emptyMesh(): Mesh {
  return { vertices: [], triangles: [] };
}

const EPSILON = 1e-9;

/** Append an axis-aligned box spanning (x0,y0,z0)-(x1,y1,z1) as a closed shell. Degenerate boxes are skipped. */
export function addBox(mesh: Mesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  if (x1 - x0 <= EPSILON || y1 - y0 <= EPSILON || z1 - z0 <= EPSILON) return;
  const base = mesh.vertices.length / 3;
  mesh.vertices.push(
    ...[x0, y0, z0],
    ...[x1, y0, z0],
    ...[x1, y1, z0],
    ...[x0, y1, z0],
    ...[x0, y0, z1],
    ...[x1, y0, z1],
    ...[x1, y1, z1],
    ...[x0, y1, z1],
  );
  // prettier-ignore
  const faces = [
    0, 2, 1, 0, 3, 2, // bottom (-z)
    4, 5, 6, 4, 6, 7, // top (+z)
    0, 1, 5, 0, 5, 4, // front (-y)
    1, 2, 6, 1, 6, 5, // right (+x)
    2, 3, 7, 2, 7, 6, // back (+y)
    3, 0, 4, 3, 4, 7, // left (-x)
  ];
  for (const index of faces) {
    mesh.triangles.push(base + index);
  }
}

/**
 * Append a prism made by extruding a convex polygon (counter-clockwise xy
 * points, no repeated points) from z0 to z1 as a closed shell.
 */
export function addExtrudedConvexPolygon(
  mesh: Mesh,
  points: ReadonlyArray<readonly [number, number]>,
  z0: number,
  z1: number,
): void {
  const n = points.length;
  if (n < 3 || z1 - z0 <= EPSILON) return;
  const base = mesh.vertices.length / 3;
  for (const [x, y] of points) mesh.vertices.push(x, y, z0);
  for (const [x, y] of points) mesh.vertices.push(x, y, z1);
  for (let i = 1; i < n - 1; i++) {
    // Convex polygon: triangle fans are valid for both caps.
    mesh.triangles.push(base, base + i + 1, base + i); // bottom, facing -z
    mesh.triangles.push(base + n, base + n + i, base + n + i + 1); // top, facing +z
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    mesh.triangles.push(base + i, base + next, base + n + next);
    mesh.triangles.push(base + i, base + n + next, base + n + i);
  }
}

/**
 * Counter-clockwise outline of a rectangle with rounded corners, with its
 * lower-left corner at (0,0).
 */
export function roundedRectanglePolygon(
  width: number,
  height: number,
  radius: number,
  segmentsPerCorner = 4,
): [number, number][] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const corners: { cx: number; cy: number; startAngle: number }[] = [
    { cx: width - r, cy: r, startAngle: -Math.PI / 2 }, // bottom-right
    { cx: width - r, cy: height - r, startAngle: 0 }, // top-right
    { cx: r, cy: height - r, startAngle: Math.PI / 2 }, // top-left
    { cx: r, cy: r, startAngle: Math.PI }, // bottom-left
  ];
  const points: [number, number][] = [];
  const push = (x: number, y: number) => {
    const last = points[points.length - 1];
    if (last && Math.abs(last[0] - x) < EPSILON && Math.abs(last[1] - y) < EPSILON) return;
    points.push([x, y]);
  };
  for (const { cx, cy, startAngle } of corners) {
    if (r === 0) {
      push(cx, cy);
      continue;
    }
    for (let s = 0; s <= segmentsPerCorner; s++) {
      const angle = startAngle + (Math.PI / 2) * (s / segmentsPerCorner);
      push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first[0] - last[0]) < EPSILON && Math.abs(first[1] - last[1]) < EPSILON) {
    points.pop();
  }
  return points;
}
