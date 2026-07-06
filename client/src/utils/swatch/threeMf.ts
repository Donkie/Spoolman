// Serialize a swatch layout as a 3MF package: a single mesh object whose
// marking triangles (text pixels and QR modules) carry a per-triangle color
// from an <m:colorgroup> (3MF Materials Extension), while the rest inherits
// the filament color from the object default.
//
// Why one object with face colors, and not one sub-object per color?
//  - Ultimaker Cura ignores 3MF color/material data entirely and treats every
//    build object as an independent model — it drops each one to the build
//    plate, which scattered the old separate marking layer into a sheet of
//    loose dots. A single mesh keeps the card intact everywhere.
//  - Bambu Studio's standard-3MF color import only recognizes color groups
//    (m:colorgroup) — basematerials-encoded files load as geometry only. With
//    face colors it offers mapping both colors to filaments on import.
//  - Windows 3D Viewer supports the materials extension, so the swatch still
//    previews in full color there.
// The marking is additionally sunk slightly into the base so the two color
// regions overlap instead of merely touching: exactly-coplanar faces between
// separate shells are a classic source of slicer artifacts.

import { strToU8, zipSync } from "fflate";
import {
  addBox,
  addExtrudedConvexPolygon,
  addExtrudedPlateWithHangerTab,
  addExtrudedPlateWithHole,
  emptyMesh,
  Mesh,
  roundedRectanglePolygon,
} from "./geometry";
import { SwatchLayout } from "./layout";

const MODEL_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const MATERIAL_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02";
const CORNER_SEGMENTS = 6;
/** Display color used when the filament has no (valid) color set. */
const FALLBACK_BASE_COLOR = "#d9d9d9";
/**
 * How far the marking sinks into the base, so the union of the two is robust
 * for slicers (strict overlap instead of exactly-coplanar touching faces).
 */
export const MARKING_EMBED_MM = 0.05;

export interface SwatchMeshes {
  base: Mesh;
  marking: Mesh;
}

/** Build the 3D meshes for a layout, converting from top-left 2D to 3D coordinates (y up). */
export function buildSwatchMeshes(layout: SwatchLayout): SwatchMeshes {
  const base = emptyMesh();
  const outline = roundedRectanglePolygon(layout.widthMm, layout.heightMm, layout.cornerRadiusMm, CORNER_SEGMENTS);
  if (layout.hangerTab) {
    addExtrudedPlateWithHangerTab(
      base,
      outline,
      // The card's 2D top edge (y = 0) is y = heightMm in 3D (y up).
      {
        cx: layout.hangerTab.cx,
        edgeY: layout.heightMm,
        holeR: layout.hangerTab.holeR,
        outerR: layout.hangerTab.outerR,
      },
      0,
      layout.baseThicknessMm,
    );
  } else if (layout.hole) {
    addExtrudedPlateWithHole(
      base,
      outline,
      // The layout's hole is in top-left 2D coordinates; flip to 3D (y up).
      { cx: layout.hole.cx, cy: layout.heightMm - layout.hole.cy, r: layout.hole.r },
      0,
      layout.baseThicknessMm,
    );
  } else {
    addExtrudedConvexPolygon(base, outline, 0, layout.baseThicknessMm);
  }
  const marking = emptyMesh();
  const markingZ0 = Math.max(0, layout.baseThicknessMm - MARKING_EMBED_MM);
  for (const rect of layout.markRects) {
    addBox(
      marking,
      rect.x,
      layout.heightMm - (rect.y + rect.h),
      markingZ0,
      rect.x + rect.w,
      layout.heightMm - rect.y,
      layout.baseThicknessMm + layout.markingThicknessMm,
    );
  }
  return { base, marking };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatCoordinate(value: number): string {
  return parseFloat(value.toFixed(4)).toString();
}

/**
 * Serialize both part meshes as one 3MF <mesh>. Marking triangles reference
 * property index 1 of the object's color group (`p1`); base triangles inherit
 * the object-level default (index 0).
 */
function combinedMeshXml(base: Mesh, marking: Mesh): string {
  const parts: string[] = ["<mesh><vertices>"];
  for (const mesh of [base, marking]) {
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      parts.push(
        `<vertex x="${formatCoordinate(mesh.vertices[i])}" y="${formatCoordinate(mesh.vertices[i + 1])}" z="${formatCoordinate(mesh.vertices[i + 2])}"/>`,
      );
    }
  }
  parts.push("</vertices><triangles>");
  for (let i = 0; i < base.triangles.length; i += 3) {
    parts.push(`<triangle v1="${base.triangles[i]}" v2="${base.triangles[i + 1]}" v3="${base.triangles[i + 2]}"/>`);
  }
  const offset = base.vertices.length / 3;
  for (let i = 0; i < marking.triangles.length; i += 3) {
    parts.push(
      `<triangle v1="${offset + marking.triangles[i]}" v2="${offset + marking.triangles[i + 1]}" v3="${offset + marking.triangles[i + 2]}" p1="1"/>`,
    );
  }
  parts.push("</triangles></mesh>");
  return parts.join("");
}

export interface SwatchMetadata {
  title: string;
  description?: string;
}

/** Build the complete 3MF package (a ZIP archive) for a swatch layout. */
export function buildSwatch3mf(layout: SwatchLayout, metadata: SwatchMetadata): Uint8Array {
  const { base, marking } = buildSwatchMeshes(layout);
  const baseColor = layout.baseColorHexes[0] ?? FALLBACK_BASE_COLOR;
  const markingColor = layout.markingColor === "black" ? "#000000" : "#ffffff";

  const model: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="millimeter" xml:lang="en-US" xmlns="${MODEL_NAMESPACE}" xmlns:m="${MATERIAL_NAMESPACE}">`,
    `<metadata name="Title">${escapeXml(metadata.title)}</metadata>`,
    '<metadata name="Application">Spoolman</metadata>',
  ];
  if (metadata.description) {
    model.push(`<metadata name="Description">${escapeXml(metadata.description)}</metadata>`);
  }
  model.push(
    "<resources>",
    '<m:colorgroup id="1">',
    `<m:color color="${baseColor}"/>`,
    `<m:color color="${markingColor}"/>`,
    "</m:colorgroup>",
    `<object id="2" type="model" name="${escapeXml(metadata.title)}" pid="1" pindex="0">`,
    combinedMeshXml(base, marking),
    "</object>",
    "</resources>",
    '<build><item objectid="2"/></build>',
    "</model>",
  );

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    "</Types>";
  const relationships =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
    "</Relationships>";

  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(relationships),
      "3D/3dmodel.model": strToU8(model.join("")),
    },
    { level: 6 },
  );
}
