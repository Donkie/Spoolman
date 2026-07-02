import { useId } from "react";
import { SwatchLayout } from "../utils/swatch";

/** Pixels per mm, so differently sized styles preview at comparable scale. */
const PREVIEW_SCALE = 5;

/**
 * True-to-scale 2D rendering of a swatch layout: the exact rectangles that
 * become the printed marking, on top of the filament base color.
 */
const SwatchPreview = ({ layout }: { layout: SwatchLayout }) => {
  const gradientId = useId();
  const markingFill = layout.markingColor === "black" ? "#000000" : "#ffffff";
  const baseFill = layout.baseColorHexes.length > 1 ? `url(#${gradientId})` : (layout.baseColorHexes[0] ?? "#d9d9d9");
  return (
    <svg
      viewBox={`0 0 ${layout.widthMm} ${layout.heightMm}`}
      shapeRendering="crispEdges"
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
      <rect
        x={0}
        y={0}
        width={layout.widthMm}
        height={layout.heightMm}
        rx={layout.cornerRadiusMm}
        fill={baseFill}
        stroke="rgba(128, 128, 128, 0.8)"
        strokeWidth={0.3}
      />
      {layout.markRects.map((rect, index) => (
        <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={markingFill} />
      ))}
    </svg>
  );
};

export default SwatchPreview;
