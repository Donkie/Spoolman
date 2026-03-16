import { ReactElement } from "react";
import VendorLogo from "../../components/vendorLogo";
import { IVendor } from "../vendors/model";

interface LogoLabelBlockProps {
  vendor?: IVendor;
  label: ReactElement;
}

const LogoLabelBlock = ({ vendor, label }: LogoLabelBlockProps) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "1mm 1mm 1mm 0",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          minHeight: "6mm",
          maxHeight: "6mm",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          marginBottom: "0.5mm",
        }}
      >
        <VendorLogo
          vendor={vendor}
          usePrintLogo
          showFallbackText
          imgStyle={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            objectPosition: "left center",
          }}
          fallbackStyle={{
            // Label previews render on a white canvas, so fallback text must stay dark
            // even when the surrounding application theme is dark.
            color: "#000",
            fontWeight: 700,
            fontSize: "3.2mm",
            lineHeight: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{label}</div>
    </div>
  );
};

export default LogoLabelBlock;
