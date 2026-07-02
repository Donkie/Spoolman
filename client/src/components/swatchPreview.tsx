import { useId } from "react";
import { SwatchLayout } from "../utils/swatch";

/** Pixels per mm, so differently sized styles preview at comparable scale. */
const PREVIEW_SCALE = 5;

function circleSubpath(cx: number, cy: number, r: number): string {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
}

/**
 * Card outline as an SVG path: rounded rectangle, with the hanger-tab arch on
 * the top edge when present, minus any hole (even-odd fill).
 */
function basePathD(layout: SwatchLayout): string {
  const { widthMm: w, heightMm: h, hangerTab } = layout;
  const r = Math.max(0, Math.min(layout.cornerRadiusMm, w / 2, h / 2));
  const topEdge = hangerTab
    ? `H ${hangerTab.cx - hangerTab.outerR} ` +
      `A ${hangerTab.outerR} ${hangerTab.outerR} 0 0 1 ${hangerTab.cx + hangerTab.outerR} 0 H ${w - r}`
    : `H ${w - r}`;
  const outline =
    `M ${r} 0 ${topEdge} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} ` +
    `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  const holes = [
    layout.hole ? circleSubpath(layout.hole.cx, layout.hole.cy, layout.hole.r) : "",
    hangerTab ? circleSubpath(hangerTab.cx, 0, hangerTab.holeR) : "",
  ];
  return [outline, ...holes].filter(Boolean).join(" ");
}

/**
 * True-to-scale 2D rendering of a swatch layout: the exact rectangles that
 * become the printed marking, on top of the filament base color.
 */
const SwatchPreview = ({ layout }: { layout: SwatchLayout }) => {
  const gradientId = useId();
  const markingFill = layout.markingColor === "black" ? "#000000" : "#ffffff";
  const baseFill = layout.baseColorHexes.length > 1 ? `url(#${gradientId})` : (layout.baseColorHexes[0] ?? "#d9d9d9");
  // A hanger tab protrudes above the card's top edge (negative y).
  const overhang = layout.hangerTab?.outerR ?? 0;
  return (
    <svg
      viewBox={`0 ${-overhang} ${layout.widthMm} ${layout.heightMm + overhang}`}
      style={{
        width: "100%",
        maxWidth: layout.widthMm * PREVIEW_SCALE,
        height: "auto",
        display: "block",
        margin: "0 auto",
      }}
      role="img"
    >
      {layout.baseColorHexes.length > 1 && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            {layout.baseColorHexes.map((hex, index) => (
              <stop key={index} offset={index / (layout.baseColorHexes.length - 1)} stopColor={hex} />
            ))}
          </linearGradient>
        </defs>
      )}
      <path
        d={basePathD(layout)}
        fillRule="evenodd"
        fill={baseFill}
        stroke="rgba(128, 128, 128, 0.8)"
        strokeWidth={0.3}
      />
      {/* crispEdges only on the marking: it removes anti-aliasing seams between
          adjacent QR rects, but would make the card's round corners jaggy. */}
      <g shapeRendering="crispEdges">
        {layout.markRects.map((rect, index) => (
          <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={markingFill} />
        ))}
      </g>
    </svg>
  );
};

export default SwatchPreview;
