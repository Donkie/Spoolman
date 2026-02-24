import { Typography } from "antd";
import SpoolIcon from "./spoolIcon";

interface ColorHexPreviewProps {
  colorHex?: string | null;
  multiColorHexes?: string | null;
  multiColorDirection?: string | null;
}

const SMALL_TEXT_STYLE = {
  fontSize: 12,
  color: "rgba(255,255,255,0.45)",
  lineHeight: 1.2,
};

const normalizeHex = (value: string) => `#${value.replace("#", "").toUpperCase()}`;

export default function ColorHexPreview({ colorHex, multiColorHexes, multiColorDirection }: Readonly<ColorHexPreviewProps>) {
  const colors =
    multiColorHexes
      ?.split(",")
      .map((hex) => hex.trim())
      .filter((hex) => hex.length > 0)
      .map(normalizeHex) ?? [];

  if (colors.length <= 1) {
    const singleColor = colorHex ? normalizeHex(colorHex) : colors[0];
    if (!singleColor) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SpoolIcon color={singleColor} size="large" no_margin />
        <Typography.Text style={SMALL_TEXT_STYLE}>{singleColor}</Typography.Text>
      </div>
    );
  }

  const isLongitudinal = multiColorDirection === "longitudinal";
  if (isLongitudinal) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {colors.map((hex, index) => (
          <div key={`${hex}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 56,
                height: 22,
                borderRadius: 5,
                border: "1px solid rgba(255,255,255,0.22)",
                background: hex,
              }}
            />
            <Typography.Text style={SMALL_TEXT_STYLE}>{hex}</Typography.Text>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
      {colors.map((hex, index) => (
        <div
          key={`${hex}-${index}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 64,
            gap: 4,
          }}
        >
          <SpoolIcon color={hex} size="large" no_margin />
          <Typography.Text style={{ ...SMALL_TEXT_STYLE, textAlign: "center" }}>{hex}</Typography.Text>
        </div>
      ))}
    </div>
  );
}
