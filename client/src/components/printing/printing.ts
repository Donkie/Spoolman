import { useGetSetting, useSetSetting } from "../../utils/querySettings";
import { v4 as uuidv4 } from "uuid";

export interface PrintSettings {
  id: string;
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

export function useGetPrintSettings(): SpoolQRCodePrintSettings[] | undefined {
  const { data } = useGetSetting("print_settings");
  if (!data) return;
  const parsed: SpoolQRCodePrintSettings[] =
    data && data.value ? JSON.parse(data.value) : ([] as SpoolQRCodePrintSettings[]);
  // Loop through all parsed and generate a new ID field if it's not set
  return parsed.map((settings) => {
    if (!settings.labelSettings.printSettings.id) {
      settings.labelSettings.printSettings.id = uuidv4();
    }
    return settings;
  });
}

export function useSetPrintSettings(): (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => void {
  const mut = useSetSetting("print_settings");

  return (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => {
    mut.mutate(spoolQRCodePrintSettings);
  };
}
