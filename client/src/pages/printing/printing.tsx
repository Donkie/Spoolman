import { v4 as uuidv4 } from "uuid";
import { useGetSetting, useSetSetting } from "../../utils/querySettings";
import { ISpool } from "../spools/model";

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
  // Loop through all parsed and generate a new ID field if it's not set
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
  [key: string]: any;
  extra: { [key: string]: string };
}

function getTagValue(tag: string, obj: GenericObject): any {
  // Split tag by .
  const tagParts = tag.split(".");
  if (tagParts[0] === "extra") {
    const extraValue = obj.extra[tagParts[1]];
    if (extraValue === undefined) {
      return "?";
    }
    return JSON.parse(extraValue);
  }

  const value = obj[tagParts[0]] ?? "?";
  // check if value is itself an object. If so, recursively call this and remove the first part of the tag
  if (typeof value === "object") {
    return getTagValue(tagParts.slice(1).join("."), value);
  }
  return value;
}

function applyNewline(text: string): JSX.Element[] {
  return text.split("\n").map((line, idx, arr) => (
    <span key={idx}>
      {line}
      {idx < arr.length - 1 && <br />}
    </span>
  ));
}

function applyTextFormatting(text: string): JSX.Element[] {
  const regex = /\*\*([\w\W]*?)\*\*/g;
  const parts = text.split(regex);
  // Map over the parts and wrap matched text with <b> tags
  const elements = parts.map((part, index) => {
    // Even index: outside asterisks, odd index: inside asterisks (to be bolded)
    const node = applyNewline(part);
    return index % 2 === 0 ? <span key={index}>{node}</span> : <b key={index}>{node}</b>;
  });
  return elements;
}

export function renderLabelContents(template: string, spool: ISpool): JSX.Element {
  // Find all {tags} in the template string and loop over them
  // let matches = [...template.matchAll(/(?:{(.*?))?{(.*?)}(.*?)(?:}(.*?))?/gs)];
  let matches = [...template.matchAll(/{(?:[^}{]|{[^}{]*})*}/gs)];
// console.log(matches){(?:[^}{]|{[^}{]*})*}
  let label_text = template;
  matches.forEach((match) => {
    // console.log(match)
    if ((match[0].match(/{/g)||[]).length == 1) {
      let tag = match[0].replace(/[{}]/g, "");
      // console.log(tag)
      let tagValue = getTagValue(tag, spool)
      label_text = label_text.replace(match[0], tagValue);
    }
    else if ((match[0].match(/{/g)||[]).length == 2) {
      let structure = match[0].match(/{(.*?){(.*?)}(.*?)}/);
      if (structure != null) {
        const tag = structure[2];
        let tagValue = getTagValue(tag, spool);
        if (tagValue == "?") {
          label_text = label_text.replace(match[0], "");
        } else {
          label_text = label_text.replace(match[0], structure[1] + tagValue + structure[3]);
        }
      }
    }
  });

  // Split string on \n into individual lines
  return <>{applyTextFormatting(label_text)}</>;
}
