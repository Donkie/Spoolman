import React, { ReactNode } from "react";
import { ISpool } from "../../pages/spools/model";
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
  template?: string;
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

interface GenericObject {
  [key: string]: any;
  extra: { [key: string]: string };
}

function getTagValue(tag: string, obj: GenericObject): any {
  // Split tag by .
  const tagParts = tag.split(".");
  if (tagParts[0] === "extra") {
    return JSON.parse(obj.extra[tagParts[1]]);
  }

  const value = obj[tagParts[0]] ?? "?";
  // check if value is itself an object. If so, recursively call this and remove the first part of the tag
  if (typeof value === "object") {
    return getTagValue(tagParts.slice(1).join("."), value);
  }
  return value;
}

export function renderLabelContents(template: string, spool: ISpool): ReactNode {
  // Find all {tags} in the template string and loop over them
  let result = template.replace(/\{(.*?)\}/g, function (_, tag) {
    return getTagValue(tag, spool);
  });

  // Split string on \n into individual lines
  return (
    <>
      {result.split("\n").map((line, index) => (
        <span key={index}>
          {line}
          <br />
        </span>
      ))}
    </>
  );
}
