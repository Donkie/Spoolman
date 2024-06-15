import { useGetSetting, useSetSetting } from "../../utils/querySettings";

export interface PrintSettings {
  name?: string;
  margin?: { top: number; bottom: number; left: number; right: number };
  printerMargin?: { top: number; bottom: number; left: number; right: number };
  spacing?: { horizontal: number; vertical: number };
  columns?: number;
  rows?: number;
  skipItems?: number;
  itemCopies?: number;
  paperSize?: string;
  customPaperSize?: { width: number; height: number };
  borderShowMode?: "none" | "border" | "grid";
}

export interface QRCodePrintSettings {
  showContent?: boolean;
  textSize?: number;
  showSpoolmanIcon?: boolean;
  printSettings: PrintSettings;
}

export interface SpoolQRCodePrintSettings {
  showVendor?: boolean;
  showLotNr?: boolean;
  showSpoolWeight?: boolean;
  showTemperatures?: boolean;
  showSpoolComment?: boolean;
  showFilamentComment?: boolean;
  showVendorComment?: boolean;
  labelSettings: QRCodePrintSettings;
}

function defaultSpoolQRCodePrintSettings(): SpoolQRCodePrintSettings {
  return {
    labelSettings: {
      printSettings: {},
    },
  };
}

export function useGetPrintSettings(): SpoolQRCodePrintSettings[] {
  const { data } = useGetSetting("print_settings");
  const parsed = data && data.value ? JSON.parse(data.value) : ([] as SpoolQRCodePrintSettings[]);
  if (parsed.length === 0) {
    parsed.push(defaultSpoolQRCodePrintSettings());
  }
  return parsed;
}

export function useSetPrintSettings(): (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => void {
  const mut = useSetSetting("print_settings");

  return (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => {
    mut.mutate(spoolQRCodePrintSettings);
  };
}
