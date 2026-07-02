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

function dedupPolygon(points: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  for (const [x, y] of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last[0] - x) < EPSILON && Math.abs(last[1] - y) < EPSILON) continue;
    result.push([x, y]);
  }
  if (result.length > 1) {
    const [fx, fy] = result[0];
    const [lx, ly] = result[result.length - 1];
    if (Math.abs(fx - lx) < EPSILON && Math.abs(fy - ly) < EPSILON) result.pop();
  }
  return result.length >= 3 ? result : [];
}

/**
 * Clip a convex counter-clockwise polygon to the half-plane a*x + b*y <= c
 * (one Sutherland–Hodgman step). Returns [] when nothing remains; orientation
 * is preserved.
 */
export function clipConvexPolygon(
  points: ReadonlyArray<readonly [number, number]>,
  a: number,
  b: number,
  c: number,
): [number, number][] {
  const result: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    const d1 = a * x1 + b * y1 - c;
    const d2 = a * x2 + b * y2 - c;
    if (d1 <= EPSILON) result.push([x1, y1]);
    if ((d1 < -EPSILON && d2 > EPSILON) || (d1 > EPSILON && d2 < -EPSILON)) {
      const t = d1 / (d1 - d2);
      result.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
    }
  }
  return dedupPolygon(result);
}

export interface CircularHole {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Extrude a convex plate outline with a circular hole punched through it, as a
 * set of touching convex prisms (slicers union them, like the marking boxes).
 *
 * The hole is approximated by a regular polygon with `holeSegments` sides
 * (must be a multiple of 8 so the collar's corners align with segment
 * boundaries). The square collar around the hole extends to 1.6x the hole
 * radius and must lie fully inside the outline — keep the hole center at
 * least ~2.3x its radius away from every edge of the card.
 */
export function addExtrudedPlateWithHole(
  mesh: Mesh,
  outline: ReadonlyArray<readonly [number, number]>,
  hole: CircularHole,
  z0: number,
  z1: number,
  holeSegments = 16,
): void {
  const s = hole.r * 1.6; // half-size of the square collar around the hole
  const [sx0, sx1] = [hole.cx - s, hole.cx + s];
  const [sy0, sy1] = [hole.cy - s, hole.cy + s];

  // Tile the outline minus the collar square with four convex pieces:
  // everything left of it, everything right of it, and the strips above and
  // below it within its column.
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(outline, 1, 0, sx0), z0, z1);
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(outline, -1, 0, -sx1), z0, z1);
  const column = clipConvexPolygon(clipConvexPolygon(outline, -1, 0, -sx0), 1, 0, sx1);
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(column, 0, -1, -sy1), z0, z1);
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(column, 0, 1, sy0), z0, z1);

  // Fill the collar square minus the hole with one convex quad per angular
  // segment, running from the hole polygon out to the square's boundary.
  const point = (angle: number, radius: number): [number, number] => [
    hole.cx + radius * Math.cos(angle),
    hole.cy + radius * Math.sin(angle),
  ];
  for (let i = 0; i < holeSegments; i++) {
    const angle0 = (2 * Math.PI * i) / holeSegments;
    const angle1 = (2 * Math.PI * (i + 1)) / holeSegments;
    const outer0 = s / Math.max(Math.abs(Math.cos(angle0)), Math.abs(Math.sin(angle0)));
    const outer1 = s / Math.max(Math.abs(Math.cos(angle1)), Math.abs(Math.sin(angle1)));
    addExtrudedConvexPolygon(
      mesh,
      dedupPolygon([point(angle0, hole.r), point(angle0, outer0), point(angle1, outer1), point(angle1, hole.r)]),
      z0,
      z1,
    );
  }
}

export interface EdgeHangerTab {
  /** Hole center x; the hole sits centered on the plate's top edge. */
  cx: number;
  /** The plate's top edge y coordinate (the hole center's y). */
  edgeY: number;
  holeR: number;
  /** Outer radius of the tab arch protruding above the edge; must exceed 1.6x holeR. */
  outerR: number;
}

/**
 * Extrude a convex plate outline with a hanger tab on its top edge: a
 * half-annulus arch (an upside-down U) protruding above the edge, around a
 * nail hole that straddles the edge — half in the tab, half punched through
 * the plate. Built from touching convex prisms like addExtrudedPlateWithHole.
 *
 * The hole's collar square (1.6x holeR) must lie inside the outline
 * horizontally, and the tab (cx ± outerR) must stay within the plate's width.
 */
export function addExtrudedPlateWithHangerTab(
  mesh: Mesh,
  outline: ReadonlyArray<readonly [number, number]>,
  tab: EdgeHangerTab,
  z0: number,
  z1: number,
  holeSegments = 16,
): void {
  const s = tab.holeR * 1.6; // half-size of the square collar below the edge
  const [sx0, sx1] = [tab.cx - s, tab.cx + s];

  // Tile the plate minus the collar square's below-edge half: everything left
  // of the collar, everything right of it, and the column below it.
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(outline, 1, 0, sx0), z0, z1);
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(outline, -1, 0, -sx1), z0, z1);
  const column = clipConvexPolygon(clipConvexPolygon(outline, -1, 0, -sx0), 1, 0, sx1);
  addExtrudedConvexPolygon(mesh, clipConvexPolygon(column, 0, 1, tab.edgeY - s), z0, z1);

  // One convex quad per angular segment around the hole. Above the edge the
  // quads run out to the tab's outer circle (forming the arch); below it they
  // run out to the collar square (filling the plate around the hole).
  const point = (angle: number, radius: number): [number, number] => [
    tab.cx + radius * Math.cos(angle),
    tab.edgeY + radius * Math.sin(angle),
  ];
  for (let i = 0; i < holeSegments; i++) {
    const angle0 = (2 * Math.PI * i) / holeSegments;
    const angle1 = (2 * Math.PI * (i + 1)) / holeSegments;
    const aboveEdge = i < holeSegments / 2;
    const outerRadius = (angle: number) =>
      aboveEdge ? tab.outerR : s / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    addExtrudedConvexPolygon(
      mesh,
      dedupPolygon([
        point(angle0, tab.holeR),
        point(angle0, outerRadius(angle0)),
        point(angle1, outerRadius(angle1)),
        point(angle1, tab.holeR),
      ]),
      z0,
      z1,
    );
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
