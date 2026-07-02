// Mesh validation helpers for the swatch tests: independent re-implementations
// of the closed-manifold and signed-volume checks a slicer effectively performs,
// so they act as a genuine oracle for the generated geometry.

import { Mesh } from "../utils/swatch/geometry";

/** Group triangle indices into connected components (shells) by shared vertices. */
export function meshShells(mesh: Mesh): number[][] {
  const vertexCount = mesh.vertices.length / 3;
  const parent = Array.from({ length: vertexCount }, (_, i) => i);
  const find = (a: number): number => {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== root) {
      const next = parent[a];
      parent[a] = root;
      a = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const triangleCount = mesh.triangles.length / 3;
  for (let t = 0; t < triangleCount; t++) {
    union(mesh.triangles[t * 3], mesh.triangles[t * 3 + 1]);
    union(mesh.triangles[t * 3], mesh.triangles[t * 3 + 2]);
  }
  const shells = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    const root = find(mesh.triangles[t * 3]);
    const shell = shells.get(root) ?? [];
    shell.push(t);
    shells.set(root, shell);
  }
  return [...shells.values()];
}

/** Signed volume of a set of triangles (positive = outward-facing winding). */
export function shellVolume(mesh: Mesh, triangleIndices: number[]): number {
  let volume = 0;
  for (const t of triangleIndices) {
    const [i, j, k] = [mesh.triangles[t * 3], mesh.triangles[t * 3 + 1], mesh.triangles[t * 3 + 2]];
    const [ax, ay, az] = [mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2]];
    const [bx, by, bz] = [mesh.vertices[j * 3], mesh.vertices[j * 3 + 1], mesh.vertices[j * 3 + 2]];
    const [cx, cy, cz] = [mesh.vertices[k * 3], mesh.vertices[k * 3 + 1], mesh.vertices[k * 3 + 2]];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

/** Total signed volume of all shells. */
export function meshVolume(mesh: Mesh): number {
  return meshShells(mesh).reduce((sum, shell) => sum + shellVolume(mesh, shell), 0);
}

export function meshBounds(mesh: Mesh): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], mesh.vertices[i + axis]);
      max[axis] = Math.max(max[axis], mesh.vertices[i + axis]);
    }
  }
  return { min, max };
}

/**
 * Throw unless every shell of the mesh is a closed, consistently oriented
 * manifold with positive volume (i.e. printable by a slicer).
 */
export function assertWatertight(mesh: Mesh): void {
  const shells = meshShells(mesh);
  if (mesh.triangles.length === 0) throw new Error("mesh has no triangles");
  for (const shell of shells) {
    const edges = new Map<string, number>();
    for (const t of shell) {
      const [a, b, c] = [mesh.triangles[t * 3], mesh.triangles[t * 3 + 1], mesh.triangles[t * 3 + 2]];
      if (a === b || b === c || a === c) throw new Error(`degenerate triangle ${t}`);
      for (const [from, to] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = `${from}>${to}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const [key, count] of edges) {
      if (count !== 1) throw new Error(`directed edge ${key} used ${count} times`);
      const [from, to] = key.split(">");
      if (edges.get(`${to}>${from}`) !== 1) throw new Error(`edge ${key} has no opposite; shell is open`);
    }
    const volume = shellVolume(mesh, shell);
    if (volume <= 0) throw new Error(`shell volume ${volume} is not positive (inverted winding?)`);
  }
}
