// Serialize a swatch layout as a 3MF package: one object with two parts — the
// base card (filament color) and the raised marking layer (black or white) —
// so slicers import it as a single multi-part, multi-color model.

import { strToU8, zipSync } from "fflate";
import { addBox, addExtrudedConvexPolygon, emptyMesh, Mesh, roundedRectanglePolygon } from "./geometry";
import { SwatchLayout } from "./layout";

const MODEL_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const CORNER_SEGMENTS = 6;
/** Display color used when the filament has no (valid) color set. */
const FALLBACK_BASE_COLOR = "#d9d9d9";

export interface SwatchMeshes {
  base: Mesh;
  marking: Mesh;
}

/** Build the 3D meshes for a layout, converting from top-left 2D to 3D coordinates (y up). */
export function buildSwatchMeshes(layout: SwatchLayout): SwatchMeshes {
  const base = emptyMesh();
  addExtrudedConvexPolygon(
    base,
    roundedRectanglePolygon(layout.widthMm, layout.heightMm, layout.cornerRadiusMm, CORNER_SEGMENTS),
    0,
    layout.baseThicknessMm,
  );
  const marking = emptyMesh();
  for (const rect of layout.markRects) {
    addBox(
      marking,
      rect.x,
      layout.heightMm - (rect.y + rect.h),
      layout.baseThicknessMm,
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

function meshXml(mesh: Mesh): string {
  const parts: string[] = ["<mesh><vertices>"];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    parts.push(
      `<vertex x="${formatCoordinate(mesh.vertices[i])}" y="${formatCoordinate(mesh.vertices[i + 1])}" z="${formatCoordinate(mesh.vertices[i + 2])}"/>`,
    );
  }
  parts.push("</vertices><triangles>");
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    parts.push(`<triangle v1="${mesh.triangles[i]}" v2="${mesh.triangles[i + 1]}" v3="${mesh.triangles[i + 2]}"/>`);
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
    `<model unit="millimeter" xml:lang="en-US" xmlns="${MODEL_NAMESPACE}">`,
    `<metadata name="Title">${escapeXml(metadata.title)}</metadata>`,
    '<metadata name="Application">Spoolman</metadata>',
  ];
  if (metadata.description) {
    model.push(`<metadata name="Description">${escapeXml(metadata.description)}</metadata>`);
  }
  model.push(
    "<resources>",
    '<basematerials id="1">',
    `<base name="Filament" displaycolor="${baseColor}"/>`,
    `<base name="Marking (${layout.markingColor})" displaycolor="${markingColor}"/>`,
    "</basematerials>",
    '<object id="2" type="model" name="Swatch base" pid="1" pindex="0">',
    meshXml(base),
    "</object>",
    `<object id="3" type="model" name="Swatch marking (${layout.markingColor})" pid="1" pindex="1">`,
    meshXml(marking),
    "</object>",
    `<object id="4" type="model" name="${escapeXml(metadata.title)}">`,
    '<components><component objectid="2"/><component objectid="3"/></components>',
    "</object>",
    "</resources>",
    '<build><item objectid="4"/></build>',
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
