import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ReactElement } from "react";
import { v4 as uuidv4 } from "uuid";
import { useGetSetting, useSetSetting } from "../../utils/querySettings";
import { ISpool } from "../spools/model";

dayjs.extend(utc);

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
  showQRCodeMode?: "no" | "simple" | "withIcon";
  textSize?: number;
  printSettings: PrintSettings;
}

export interface SpoolQRCodePrintSettings {
  template?: string;
  labelSettings: QRCodePrintSettings;
}

export function useGetPrintSettings(): SpoolQRCodePrintSettings[] | undefined {
  const { data } = useGetSetting("print_presets");
  if (!data) return;
  const parsed: SpoolQRCodePrintSettings[] =
    data && data.value ? JSON.parse(data.value) : ([] as SpoolQRCodePrintSettings[]);
  return parsed.map((settings) => {
    if (!settings.labelSettings.printSettings.id) {
      settings.labelSettings.printSettings.id = uuidv4();
    }
    return settings;
  });
}

export function useSetPrintSettings(): (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => void {
  const mut = useSetSetting("print_presets");

  return (spoolQRCodePrintSettings: SpoolQRCodePrintSettings[]) => {
    mut.mutate(spoolQRCodePrintSettings);
  };
}

interface GenericObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  extra: { [key: string]: string };
}

type DateOrder = "ymd" | "mdy" | "dmy";

function getDatePattern(order: DateOrder): string {
  switch (order) {
    case "mdy":
      return "MM/DD/YYYY";
    case "dmy":
      return "DD/MM/YYYY";
    case "ymd":
    default:
      return "YYYY-MM-DD";
  }
}

function parseDateModifier(modifier?: string): { baseModifier?: string; dateOrder: DateOrder } {
  if (!modifier) {
    return { dateOrder: "ymd" };
  }

  const [baseModifier, rawOrder] = modifier.split(":", 2);
  if (rawOrder === "mdy" || rawOrder === "dmy" || rawOrder === "ymd") {
    return { baseModifier, dateOrder: rawOrder };
  }

  return { baseModifier, dateOrder: "ymd" };
}

function formatNumberValue(value: unknown, modifier?: string): unknown {
  if (!modifier || value === "?") {
    return undefined;
  }

  const numericValue =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  switch (modifier) {
    case "round":
      return Math.round(numericValue);
    case "fixed1":
      return numericValue.toFixed(1);
    case "fixed2":
      return numericValue.toFixed(2);
    default:
      return undefined;
  }
}

function formatDateTimeValue(value: unknown, modifier?: string): unknown {
  const { baseModifier, dateOrder } = parseDateModifier(modifier);
  if (!baseModifier || value === "?") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const parsed = dayjs.utc(value);
  if (!parsed.isValid()) {
    return value;
  }

  switch (baseModifier) {
    case "date":
      return parsed.format(getDatePattern(dateOrder));
    case "time":
      return parsed.format("HH:mm");
    case "date_local":
      return parsed.local().format(getDatePattern(dateOrder));
    case "time_local":
      return parsed.local().format("HH:mm");
    case "datetime_short":
      return parsed.format(`${getDatePattern(dateOrder)} HH:mm`);
    case "datetime_short_local":
      return parsed.local().format(`${getDatePattern(dateOrder)} HH:mm`);
    default:
      return value;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBaseTagValue(tag: string, obj: GenericObject): any {
  const tagParts = tag.split(".");
  if (tagParts[0] === "extra") {
    const extraValue = obj.extra[tagParts[1]];
    if (extraValue === undefined) {
      return "?";
    }
    return JSON.parse(extraValue);
  }

  const value = obj[tagParts[0]] ?? "?";
  if (typeof value === "object") {
    return getBaseTagValue(tagParts.slice(1).join("."), value);
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTagValue(tag: string, obj: GenericObject): any {
  const [baseTag, modifier] = tag.split("|", 2);
  const tagValue = getBaseTagValue(baseTag, obj);
  const numericValue = formatNumberValue(tagValue, modifier);
  if (numericValue !== undefined) {
    return numericValue;
  }
  return formatDateTimeValue(tagValue, modifier);
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
  const regex = /\*\*([\w\W]*?)\*\*/g;
  const parts = text.split(regex);
  return parts.map((part, index) => {
    const node = applyNewline(part);
    return index % 2 === 0 ? <span key={index}>{node}</span> : <b key={index}>{node}</b>;
  });
}

export function renderLabelContents(template: string, spool: ISpool): ReactElement {
  const matches = [...template.matchAll(/{(?:[^}{]|{[^}{]*})*}/gs)];
  let labelText = template;
  matches.forEach((match) => {
    if ((match[0].match(/{/g) || []).length == 1) {
      const tag = match[0].replace(/[{}]/g, "");
      const tagValue = getTagValue(tag, spool);
      labelText = labelText.replace(match[0], tagValue);
    } else if ((match[0].match(/{/g) || []).length == 2) {
      const structure = match[0].match(/{(.*?){(.*?)}(.*?)}/);
      if (structure != null) {
        const tag = structure[2];
        const tagValue = getTagValue(tag, spool);
        if (tagValue == "?") {
          labelText = labelText.replace(match[0], "");
        } else {
          labelText = labelText.replace(match[0], structure[1] + tagValue + structure[3]);
        }
      }
    }
  });

  return <>{applyTextFormatting(labelText)}</>;
}
