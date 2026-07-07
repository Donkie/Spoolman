import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

interface TitleTextBlockProps {
  children: ReactNode;
  fitToWidth: boolean;
  align: "left" | "center" | "right";
  maxTextSizeMm: number;
  onEffectiveTextSizeChange?: (sizeMm: number) => void;
}

const alignToFlex = (value: "left" | "center" | "right"): "flex-start" | "center" | "flex-end" => {
  if (value === "center") return "center";
  if (value === "right") return "flex-end";
  return "flex-start";
};

const TitleTextBlock = ({
  children,
  fitToWidth,
  align,
  maxTextSizeMm,
  onEffectiveTextSizeChange,
}: TitleTextBlockProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    if (!fitToWidth) return;
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      setResizeTick((value) => value + 1);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fitToWidth]);

  useLayoutEffect(() => {
    if (!fitToWidth) {
      setScale(1);
      return;
    }

    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const availableWidth = container.clientWidth;
    if (availableWidth <= 0) {
      setScale(1);
      return;
    }

    const neededWidth = content.scrollWidth;
    if (neededWidth <= 0) {
      setScale(1);
      return;
    }

    const currentScale = Math.max(scale, 0.0001);
    const unscaledNeededWidth = neededWidth / currentScale;
    const nextScale = Math.min(1, availableWidth / Math.max(unscaledNeededWidth, 1));
    const normalizedScale = Number((nextScale > 0 ? nextScale : 1).toFixed(4));
    setScale(normalizedScale);
  }, [children, fitToWidth, maxTextSizeMm, resizeTick]);

  const effectiveSizeMm = fitToWidth ? Number((maxTextSizeMm * scale).toFixed(1)) : Number(maxTextSizeMm.toFixed(1));

  useEffect(() => {
    onEffectiveTextSizeChange?.(effectiveSizeMm);
  }, [effectiveSizeMm, onEffectiveTextSizeChange]);

  return (
    <div
      ref={containerRef}
      className="print-qrcode-title-text-wrapper"
      style={{
        width: "100%",
        display: "flex",
        justifyContent: alignToFlex(align),
      }}
    >
      <div
        ref={contentRef}
        className="print-qrcode-title-text"
        style={{
          fontSize: `${effectiveSizeMm}mm`,
          textAlign: align,
          lineHeight: 1.2,
          color: "#000",
          whiteSpace: fitToWidth ? "pre" : "pre-wrap",
          overflowWrap: fitToWidth ? "normal" : "anywhere",
          wordBreak: fitToWidth ? "normal" : "break-word",
          width: fitToWidth ? "auto" : "100%",
          maxWidth: "100%",
          display: "inline-block",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default TitleTextBlock;
