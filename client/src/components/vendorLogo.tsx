import { CSSProperties, useEffect, useMemo, useState } from "react";
import { IVendor } from "../pages/vendors/model";
import { getVendorLogoCandidates } from "../utils/vendorLogo";

interface VendorLogoProps {
  vendor?: IVendor;
  usePrintLogo?: boolean;
  showFallbackText?: boolean;
  imgStyle?: CSSProperties;
  fallbackStyle?: CSSProperties;
}

// Walk the vendor's candidate logo URLs in order, then optionally fall back to plain vendor text.
export function VendorLogo({
  vendor,
  usePrintLogo = false,
  showFallbackText = false,
  imgStyle,
  fallbackStyle,
}: VendorLogoProps) {
  const candidates = useMemo(() => getVendorLogoCandidates(vendor, usePrintLogo), [vendor, usePrintLogo]);
  const [currentCandidateIndex, setCurrentCandidateIndex] = useState(0);
  useEffect(() => {
    // Reset to the highest-priority candidate whenever the vendor or logo mode changes.
    setCurrentCandidateIndex(0);
  }, [vendor, usePrintLogo]);

  const currentSrc = candidates[currentCandidateIndex];
  const fallbackText = vendor?.name ?? "";

  if (currentSrc) {
    return (
      <img
        src={currentSrc}
        alt={vendor?.name ? `${vendor.name} logo` : "Manufacturer logo"}
        style={imgStyle}
        onError={() => {
          // Try the next candidate before giving up so a stale saved path can still fall
          // back to the local runtime logo filenames inferred from the vendor name.
          setCurrentCandidateIndex((idx) => idx + 1);
        }}
      />
    );
  }

  if (showFallbackText && fallbackText) {
    return <div style={fallbackStyle}>{fallbackText}</div>;
  }

  return null;
}

export default VendorLogo;
