import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { Badge, Button, ColorPicker, Space } from "antd";

function generateRandomColor() {
  return "000000".replace(/0/g, function () {
    return (~~(Math.random() * 16)).toString(16);
  });
}

function generateInitialColors(num: number) {
  const colors = [];
  for (let i = 0; i < num; i++) {
    colors.push(generateRandomColor());
  }
  return colors;
}

/**
 * An Ant Design compatible form input for multiple color pickers
 * The value is a comma separated list of hex values, without hashtags
 * @param props
 * @returns
 */
export function MultiColorPicker(props: {
  value?: string | null | undefined;
  onChange?: (value: string | null | undefined) => void;
  min?: number;
  max?: number;
  layout?: "horizontal" | "vertical";
  showHex?: boolean;
  hexPosition?: "right" | "bottom";
  swatchWidth?: number;
  swatchHeight?: number;
}) {
  const values = props.value ? props.value.split(",") : generateInitialColors(props.min ?? 0);
  if (!props.value && props.onChange) {
    // Update value immediately
    props.onChange(values.join(","));
  }
  const layout = props.layout ?? "horizontal";
  const showHex = props.showHex ?? false;
  const hexPosition = props.hexPosition ?? "bottom";
  const swatchWidth = props.swatchWidth ?? 38;
  const swatchHeight = props.swatchHeight ?? 38;
  const hexTextStyle = {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    lineHeight: 1.2,
    textTransform: "uppercase" as const,
    fontFamily: "monospace",
  };

  const pickers = values.map((value, idx) => {
    const formattedHex = `#${value.replace("#", "").toUpperCase()}`;
    return (
      <Badge
        key={idx}
        count={
          values.length > (props.min ?? 0) ? (
            <span className="ant-badge-count">
              <CloseOutlined
                onClick={() => {
                  if (props.onChange) {
                    props.onChange(values.filter((v, i) => i !== idx).join(","));
                  }
                }}
              />
            </span>
          ) : (
            <></>
          )
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: showHex ? (hexPosition === "right" ? "row" : "column") : "column",
            alignItems: showHex && hexPosition === "right" ? "center" : "flex-start",
            gap: showHex ? 8 : 0,
          }}
        >
          <ColorPicker
            value={value}
            onChange={(clr) => {
              if (props.onChange) {
                props.onChange(values.map((v, i) => (i === idx ? clr.toHex() : v)).join(","));
              }
            }}
          >
            <div
              style={{
                width: swatchWidth,
                height: swatchHeight,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                backgroundColor: `#${value.replace("#", "")}`,
              }}
            />
          </ColorPicker>
          {showHex && <span style={hexTextStyle}>{formattedHex}</span>}
        </div>
      </Badge>
    );
  });

  const isVerticalWithRightHex = layout === "vertical" && showHex && hexPosition === "right";
  if (isVerticalWithRightHex) {
    const canRemove = values.length > (props.min ?? 0);
    const canAdd = values.length < (props.max ?? Infinity);
    const actionSize = Math.max(20, Math.min(28, swatchHeight));
    const rowGap = 12;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginTop: "1em",
        }}
      >
        <Space direction="vertical" size={rowGap}>
          {values.map((_, idx) => (
            <Button
              key={`remove-${idx}`}
              danger
              shape="circle"
              icon={<CloseOutlined />}
              disabled={!canRemove}
              style={{
                width: actionSize,
                minWidth: actionSize,
                height: actionSize,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => {
                if (!canRemove) return;
                if (props.onChange) {
                  props.onChange(values.filter((v, i) => i !== idx).join(","));
                }
              }}
            />
          ))}
          <Button
            key="add"
            shape="circle"
            icon={<PlusOutlined />}
            disabled={!canAdd}
            style={{
              width: actionSize,
              minWidth: actionSize,
              height: actionSize,
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={() => {
              if (!canAdd) return;
              if (props.onChange) {
                props.onChange(values.concat(generateRandomColor()).join(","));
              }
            }}
          />
        </Space>
        <Space direction="vertical" size={rowGap} style={{ paddingLeft: 10 }}>
          {values.map((value, idx) => (
            <div
              key={`${value}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ColorPicker
                value={value}
                onChange={(clr) => {
                  if (props.onChange) {
                    props.onChange(values.map((v, i) => (i === idx ? clr.toHex() : v)).join(","));
                  }
                }}
              >
                <div
                  style={{
                    width: swatchWidth,
                    height: swatchHeight,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.2)",
                    backgroundColor: `#${value.replace("#", "")}`,
                  }}
                />
              </ColorPicker>
              <span style={hexTextStyle}>{`#${value.replace("#", "").toUpperCase()}`}</span>
            </div>
          ))}
        </Space>
      </div>
    );
  }

  return (
    <>
      <Space direction={layout === "vertical" ? "vertical" : "horizontal"} size="middle" style={{ marginTop: "1em" }}>
        {pickers}
        {values.length < (props.max ?? Infinity) && (
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              if (props.onChange) {
                props.onChange(values.concat(generateRandomColor()).join(","));
              }
            }}
          />
        )}
      </Space>
    </>
  );
}
