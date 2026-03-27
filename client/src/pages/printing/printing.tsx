import { ReactElement } from "react";
import { v4 as uuidv4 } from "uuid";
import { parseStringSettingValue, useGetSetting, useSetSetting } from "../../utils/querySettings";

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
  amlLabelSize?: { width: number; height: number };
  exportDpi?: number;
  exportFormat?: "png" | "aml";
  exportAsZip?: boolean;
}

export interface QRCodePrintSettings {
  showContent?: boolean;
  showQRCodeMode?: "no" | "simple" | "withIcon";
  textSize?: number;
  showManufacturerLogo?: boolean;
  logoSource?: "print" | "color";
  logoHeightMm?: number;
  logoAlign?: "left" | "center" | "right";
  showTitle?: boolean;
  titleAreaHeightMm?: number; // Legacy field; no longer used.
  titleTextSize?: number; // Legacy field; migrated to titleMaxTextSize.
  titleMaxTextSize?: number;
  titleFitToWidth?: boolean;
  titleAlign?: "left" | "center" | "right";
  qrCodeSizeMm?: number;
  qrCodePosition?: "left" | "right";
  qrCodeAlign?: "top" | "center" | "bottom";
  infoAlign?: "left" | "center" | "right";
  infoVerticalAlign?: "top" | "center" | "bottom";
  printSettings: PrintSettings;
}

export interface SpoolQRCodePrintSettings {
  template?: string;
  titleTemplate?: string;
  filenameTemplate?: string;
  labelSettings: QRCodePrintSettings;
}

// Merge shared defaults and saved presets without duplicating ids when multiple setting buckets are loaded together.
export function mergePrintPresets(
  ...presetLists: Array<SpoolQRCodePrintSettings[] | undefined>
): SpoolQRCodePrintSettings[] | undefined {
  const merged: SpoolQRCodePrintSettings[] = [];
  const seenIds = new Set<string>();
  const hasUnloadedList = presetLists.some((list) => list === undefined);

  for (const list of presetLists) {
    if (!list) continue;
    for (const preset of list) {
      const id = preset.labelSettings?.printSettings?.id;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      merged.push(preset);
    }
  }

  if (merged.length === 0 && hasUnloadedList) {
    return undefined;
  }

  return merged;
}

export function getConfiguredBaseUrl(rawValue: string | undefined, fallback: string): string {
  const parsed = parseStringSettingValue(rawValue, fallback);
  return parsed.trim() !== "" ? parsed : fallback;
}

// Load saved print presets and backfill missing ids so older settings remain selectable in the current UI.
export function useGetPrintSettings(settingKey = "print_presets"): SpoolQRCodePrintSettings[] | undefined {
  const { data } = useGetSetting(settingKey);
  if (!data) return;
  const parsed: SpoolQRCodePrintSettings[] =
    data && data.value ? JSON.parse(data.value) : ([] as SpoolQRCodePrintSettings[]);
  // Older presets did not store ids; generate them lazily so the editor can still target each entry.
  return parsed.map((settings) => {
    if (!settings.labelSettings.printSettings.id) {
      settings.labelSettings.printSettings.id = uuidv4();
    }
    return settings;
  });
}

export function useSetPrintSettings(
  settingKey = "print_presets",
): (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => void {
  const mut = useSetSetting(settingKey);

  return (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => {
    mut.mutate(spoolQRCodePrintSettings);
  };
}

// Resolve dot-path placeholders, including JSON-backed extra fields, for title/label/filename templates.
function getTagValue(tag: string, obj: object): unknown {
  const record = obj as { [key: string]: unknown; extra?: { [key: string]: string } };
  const tagParts = tag.split(".");
  if (tagParts[0] === "extra") {
    const extraValue = record.extra?.[tagParts[1]];
    if (extraValue === undefined) {
      return "?";
    }
    return JSON.parse(extraValue);
  }

  const value = record[tagParts[0]] ?? "?";
  // Nested relations reuse the same lookup rules so templates can walk into vendor and filament fields.
  if (typeof value === "object" && value !== null) {
    return getTagValue(tagParts.slice(1).join("."), value);
  }
  return value;
}

function applyNewline(text: string): ReactElement[] {
  return text.split("\n").map((line, idx, arr) => (
    <span key={idx}>
      {line}
      {idx < arr.length - 1 && <br />}
    </span>
  ));
}

function applyTextFormatting(text: string): ReactElement[] {
  // Supports **bold** and ==inverted== blocks (can be mixed in one template).
  const regex = /(\*\*[\w\W]*?\*\*|==[\w\W]*?==)/g;
  const parts = text.split(regex);
  const elements = parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const content = part.slice(2, -2);
      const node = applyTextFormatting(content);
      return <b key={index}>{node}</b>;
    }

    if (part.startsWith("==") && part.endsWith("==")) {
      const content = part.slice(2, -2);
      const node = applyTextFormatting(content);
      return (
        <span
          key={index}
          style={{
            backgroundColor: "#000",
            color: "#fff",
            padding: "0 0.6mm",
            display: "inline-block",
          }}
        >
          {node}
        </span>
      );
    }

    const node = applyNewline(part);
    return <span key={index}>{node}</span>;
  });
  return elements;
}

// Expand optional sections and scalar tags into plain text before the print/export renderers apply styling.
export function renderTemplateText(template: string, obj: object): string {
  const matches = [...template.matchAll(/{(?:[^}{]|{[^}{]*})*}/gs)];
  let renderedText = template;
  matches.forEach((match) => {
    if ((match[0].match(/{/g) || []).length == 1) {
      const tag = match[0].replace(/[{}]/g, "");
      const tagValue = getTagValue(tag, obj);
      renderedText = renderedText.replace(match[0], String(tagValue));
    } else if ((match[0].match(/{/g) || []).length == 2) {
      const structure = match[0].match(/{(.*?){(.*?)}(.*?)}/);
      if (structure != null) {
        const tag = structure[2];
        const tagValue = getTagValue(tag, obj);
        if (tagValue === "?") {
          renderedText = renderedText.replace(match[0], "");
        } else {
          renderedText = renderedText.replace(match[0], structure[1] + String(tagValue) + structure[3]);
        }
      }
    }
  });
  return renderedText;
}

export function renderLabelContents(template: string, obj: object): ReactElement {
  const renderedText = renderTemplateText(template, obj);
  return <>{applyTextFormatting(renderedText)}</>;
}
