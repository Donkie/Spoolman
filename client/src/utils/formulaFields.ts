import { FormulaFieldSurface, DerivedField } from "./queryFields";

type FormulaScope = object;

export type FormulaHelperDefinition = {
  name: string;
  description: string;
  category: FormulaHelperCategory;
  insert_mode?: "reference" | "none";
  reference_count?: number;
  reference_kind?: "any" | "number" | "datetime" | "text";
};

export type FormulaHelperCategory = "math" | "text" | "datetime" | "dynamic" | "date_diff" | "color";

export type FormulaHelperGroupDefinition = {
  key: FormulaHelperCategory;
  helpers: FormulaHelperDefinition[];
};

export const FORMULA_HELPERS: FormulaHelperDefinition[] = [
  { name: "abs", description: "Returns the absolute value of a number.", category: "math", reference_kind: "number" },
  { name: "min", description: "Returns the smallest value from the provided arguments.", category: "math", reference_kind: "number" },
  { name: "max", description: "Returns the largest value from the provided arguments.", category: "math", reference_kind: "number" },
  { name: "round", description: "Rounds a numeric value to the nearest integer.", category: "math", reference_kind: "number" },
  { name: "coalesce", description: "Returns the first argument that is not null/undefined.", category: "math", reference_kind: "any" },
  { name: "cat", description: "Concatenates values as text.", category: "text", reference_kind: "any" },
  { name: "upper", description: "Converts text to uppercase.", category: "text", reference_kind: "text" },
  { name: "lower", description: "Converts text to lowercase.", category: "text", reference_kind: "text" },
  { name: "trim", description: "Removes leading/trailing whitespace from text.", category: "text", reference_kind: "text" },
  { name: "length", description: "Returns text length.", category: "text", reference_kind: "text" },
  { name: "left", description: "Returns left-most text characters (optional count, default 1).", category: "text", reference_kind: "text" },
  { name: "right", description: "Returns right-most text characters (optional count, default 1).", category: "text", reference_kind: "text" },
  { name: "year", description: "Extracts UTC year from a date/datetime value.", category: "datetime", reference_kind: "datetime" },
  { name: "month", description: "Extracts UTC month (1-12) from a date/datetime value.", category: "datetime", reference_kind: "datetime" },
  { name: "day", description: "Extracts UTC day-of-month from a date/datetime value.", category: "datetime", reference_kind: "datetime" },
  { name: "hour", description: "Extracts UTC hour from a date/datetime value.", category: "datetime", reference_kind: "datetime" },
  { name: "minute", description: "Extracts UTC minute from a date/datetime value.", category: "datetime", reference_kind: "datetime" },
  { name: "second", description: "Extracts UTC second from a date/datetime value.", category: "datetime", reference_kind: "datetime" },
  { name: "timestamp", description: "Converts a date/datetime value to Unix timestamp seconds.", category: "datetime", reference_kind: "datetime" },
  { name: "date_only", description: "Formats a date/datetime as YYYY-MM-DD (UTC).", category: "datetime", reference_kind: "datetime" },
  { name: "time_only", description: "Formats a date/datetime as HH:MM:SS (UTC).", category: "datetime", reference_kind: "datetime" },
  {
    name: "days_between",
    description: "Returns day difference between start and end date/datetime values.",
    category: "date_diff",
    reference_count: 2,
    reference_kind: "datetime",
  },
  {
    name: "hours_between",
    description: "Returns hour difference between start and end date/datetime values.",
    category: "date_diff",
    reference_count: 2,
    reference_kind: "datetime",
  },
  {
    name: "hue_from_hex",
    description: "Returns hue angle (0-360) for a hex color string.",
    category: "color",
    reference_kind: "text",
  },
  { name: "today", description: "Returns current UTC date as YYYY-MM-DD.", category: "dynamic", insert_mode: "none" },
];

export const FORMULA_HELPER_GROUP_ORDER: FormulaHelperCategory[] = ["math", "text", "datetime", "dynamic", "date_diff", "color"];

export const FORMULA_HELPER_GROUPS: FormulaHelperGroupDefinition[] = FORMULA_HELPER_GROUP_ORDER.map((key) => ({
  key,
  helpers: FORMULA_HELPERS.filter((helper) => helper.category === key),
}));

function coalesce(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
  }
  throw new Error("Value is not a date/datetime.");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function dateOnly(value: unknown): string {
  const parsed = asDate(value);
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
}

function timeOnly(value: unknown): string {
  const parsed = asDate(value);
  return `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}:${pad(parsed.getUTCSeconds())}`;
}

function daysBetween(start: unknown, end: unknown): number {
  return (asDate(end).valueOf() - asDate(start).valueOf()) / 86400000;
}

function hoursBetween(start: unknown, end: unknown): number {
  return (asDate(end).valueOf() - asDate(start).valueOf()) / 3600000;
}

function hueFromHex(value: unknown): number {
  if (typeof value !== "string") {
    throw new Error("hue_from_hex expects a color string.");
  }

  let normalized = value.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (normalized.length !== 6) {
    throw new Error("hue_from_hex expects a 3 or 6 digit hex color.");
  }

  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  let hue = 0;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  const degrees = hue * 60;
  return Math.round((((degrees % 360) + 360) % 360) * 1000) / 1000;
}

function today(): string {
  return dateOnly(new Date());
}

function normalizeJsonLogicArgs(rawValue: unknown): unknown[] {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }
  return [rawValue];
}

function asNumber(value: unknown, operator: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${operator} expects numeric values.`);
  }
  return parsed;
}

function parseExtraValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getReferenceValue(reference: string, scope: FormulaScope): unknown {
  const parts = reference.split(".");
  let current: unknown = scope;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }

    const record = current as Record<string, unknown>;
    if (!(part in record)) {
      return undefined;
    }

    current = record[part];
    if (parts[index] === "extra") {
      // Extra fields are still stored as JSON strings in API payloads, so derived formulas need to
      // unwrap them lazily when a reference walks into the extra.* namespace.
      current = parseExtraValue(current);
    }
  }

  return current;
}

function collectFormulaReferencesFromJsonLogic(node: unknown, references: Set<string>): void {
  if (node === null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((value) => collectFormulaReferencesFromJsonLogic(value, references));
    return;
  }
  if (!isRecord(node)) {
    return;
  }

  const entries = Object.entries(node);
  if (entries.length !== 1) {
    return;
  }
  const [operator, rawArgs] = entries[0];
  const args = normalizeJsonLogicArgs(rawArgs);

  if (operator === "var") {
    const reference = args[0];
    if (typeof reference === "string" && reference !== "") {
      references.add(reference);
    }
    if (args.length > 1) {
      collectFormulaReferencesFromJsonLogic(args[1], references);
    }
    return;
  }

  args.forEach((arg) => collectFormulaReferencesFromJsonLogic(arg, references));
}

export function getFormulaReferencesFromJsonLogic(expressionJson: Record<string, unknown>): string[] {
  const references = new Set<string>();
  collectFormulaReferencesFromJsonLogic(expressionJson, references);
  return [...references];
}

export function getExtraFieldReferences(expressionJson?: Record<string, unknown> | null): string[] {
  const references = new Set<string>();
  if (expressionJson) {
    getFormulaReferencesFromJsonLogic(expressionJson).forEach((reference) => references.add(reference));
  }
  const extraReferences = [...references]
    .filter((reference) => reference.startsWith("extra."))
    .map((reference) => reference.slice("extra.".length))
    .filter((reference) => reference.length > 0);
  return [...new Set(extraReferences)];
}

function lookupJsonLogicReference(reference: unknown, scope: FormulaScope, defaultValue: unknown): unknown {
  const scopeRecord = scope as Record<string, unknown>;
  if (typeof reference === "number") {
    return scopeRecord[String(reference)] ?? defaultValue;
  }
  if (typeof reference !== "string") {
    throw new Error("JSON Logic var reference must be a string or integer.");
  }
  if (reference === "") {
    return scope;
  }

  const value = getReferenceValue(reference, scope);
  return value === undefined ? defaultValue : value;
}

function truthy(value: unknown): boolean {
  return Boolean(value);
}

export function evaluateFormulaJsonLogic(expressionJson: Record<string, unknown>, scope: FormulaScope): unknown {
  const evaluateNode = (node: unknown): unknown => {
    if (node === null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((value) => evaluateNode(value));
    }
    if (!isRecord(node)) {
      throw new Error("JSON Logic expression contains unsupported value types.");
    }

    const entries = Object.entries(node);
    if (entries.length !== 1) {
      throw new Error("JSON Logic expression objects must contain exactly one operator.");
    }

    const [operator, rawArgs] = entries[0];
    const args = normalizeJsonLogicArgs(rawArgs);

    if (operator === "var") {
      const reference = args[0] ?? "";
      const defaultValue = args.length > 1 ? evaluateNode(args[1]) : null;
      return lookupJsonLogicReference(reference, scope, defaultValue);
    }

    if (operator === "if") {
      if (args.length < 2) {
        throw new Error("JSON Logic if operator requires at least 2 arguments.");
      }
      for (let index = 0; index < args.length - 1; index += 2) {
        if (truthy(evaluateNode(args[index]))) {
          return evaluateNode(args[index + 1]);
        }
      }
      if (args.length % 2 === 1) {
        return evaluateNode(args[args.length - 1]);
      }
      return null;
    }

    if (operator === "and") {
      let result: unknown = true;
      args.forEach((arg) => {
        if (!truthy(result)) {
          return;
        }
        result = evaluateNode(arg);
      });
      return result;
    }

    if (operator === "or") {
      let result: unknown = false;
      args.forEach((arg) => {
        if (truthy(result)) {
          return;
        }
        result = evaluateNode(arg);
      });
      return result;
    }

    if (operator === "!") {
      if (args.length !== 1) {
        throw new Error("JSON Logic ! operator requires one argument.");
      }
      return !truthy(evaluateNode(args[0]));
    }

    const evaluatedArgs = args.map((arg) => evaluateNode(arg));

    if (operator === "==") {
      return evaluatedArgs[0] === evaluatedArgs[1];
    }
    if (operator === "!=") {
      return evaluatedArgs[0] !== evaluatedArgs[1];
    }
    if (operator === "<") {
      return (evaluatedArgs[0] as number) < (evaluatedArgs[1] as number);
    }
    if (operator === "<=") {
      return (evaluatedArgs[0] as number) <= (evaluatedArgs[1] as number);
    }
    if (operator === ">") {
      return (evaluatedArgs[0] as number) > (evaluatedArgs[1] as number);
    }
    if (operator === ">=") {
      return (evaluatedArgs[0] as number) >= (evaluatedArgs[1] as number);
    }
    if (operator === "+") {
      return evaluatedArgs.reduce<number>((sum, value) => sum + asNumber(value, "+"), 0);
    }
    if (operator === "-") {
      if (evaluatedArgs.length === 1) {
        return -asNumber(evaluatedArgs[0], "-");
      }
      return asNumber(evaluatedArgs[0], "-") - asNumber(evaluatedArgs[1], "-");
    }
    if (operator === "*") {
      return evaluatedArgs.reduce<number>((product, value) => product * asNumber(value, "*"), 1);
    }
    if (operator === "/") {
      if (evaluatedArgs.length !== 2) {
        throw new Error("JSON Logic / operator requires two arguments.");
      }
      return asNumber(evaluatedArgs[0], "/") / asNumber(evaluatedArgs[1], "/");
    }
    if (operator === "%") {
      return asNumber(evaluatedArgs[0], "%") % asNumber(evaluatedArgs[1], "%");
    }
    if (operator === "min") {
      return Math.min(...evaluatedArgs.map((value) => asNumber(value, "min")));
    }
    if (operator === "max") {
      return Math.max(...evaluatedArgs.map((value) => asNumber(value, "max")));
    }
    if (operator === "round") {
      return Math.round(asNumber(evaluatedArgs[0], "round"));
    }
    if (operator === "floor") {
      return Math.floor(asNumber(evaluatedArgs[0], "floor"));
    }
    if (operator === "ceil") {
      return Math.ceil(asNumber(evaluatedArgs[0], "ceil"));
    }
    if (operator === "abs") {
      return Math.abs(asNumber(evaluatedArgs[0], "abs"));
    }
    if (operator === "cat") {
      return evaluatedArgs.map((value) => `${value ?? ""}`).join("");
    }
    if (operator === "upper") {
      return `${evaluatedArgs[0] ?? ""}`.toUpperCase();
    }
    if (operator === "lower") {
      return `${evaluatedArgs[0] ?? ""}`.toLowerCase();
    }
    if (operator === "trim") {
      return `${evaluatedArgs[0] ?? ""}`.trim();
    }
    if (operator === "length") {
      const value = evaluatedArgs[0];
      if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
      }
      if (isRecord(value)) {
        return Object.keys(value).length;
      }
      throw new Error("length expects string, array, or object.");
    }
    if (operator === "replace") {
      return `${evaluatedArgs[0] ?? ""}`.replace(`${evaluatedArgs[1] ?? ""}`, `${evaluatedArgs[2] ?? ""}`);
    }
    if (operator === "left") {
      const value = `${evaluatedArgs[0] ?? ""}`;
      const count = evaluatedArgs.length > 1 ? asNumber(evaluatedArgs[1], "left") : 1;
      const length = Math.max(0, Math.floor(count));
      return value.slice(0, length);
    }
    if (operator === "right") {
      const value = `${evaluatedArgs[0] ?? ""}`;
      const count = evaluatedArgs.length > 1 ? asNumber(evaluatedArgs[1], "right") : 1;
      const length = Math.max(0, Math.floor(count));
      if (length === 0) {
        return "";
      }
      return value.slice(-length);
    }
    if (operator === "coalesce") {
      return coalesce(...evaluatedArgs);
    }
    if (operator === "today") {
      return today();
    }
    if (operator === "year") {
      return asDate(evaluatedArgs[0]).getUTCFullYear();
    }
    if (operator === "month") {
      return asDate(evaluatedArgs[0]).getUTCMonth() + 1;
    }
    if (operator === "day") {
      return asDate(evaluatedArgs[0]).getUTCDate();
    }
    if (operator === "hour") {
      return asDate(evaluatedArgs[0]).getUTCHours();
    }
    if (operator === "minute") {
      return asDate(evaluatedArgs[0]).getUTCMinutes();
    }
    if (operator === "second") {
      return asDate(evaluatedArgs[0]).getUTCSeconds();
    }
    if (operator === "timestamp") {
      return asDate(evaluatedArgs[0]).valueOf() / 1000;
    }
    if (operator === "date_only") {
      return dateOnly(evaluatedArgs[0]);
    }
    if (operator === "time_only") {
      return timeOnly(evaluatedArgs[0]);
    }
    if (operator === "days_between") {
      return daysBetween(evaluatedArgs[0], evaluatedArgs[1]);
    }
    if (operator === "hours_between") {
      return hoursBetween(evaluatedArgs[0], evaluatedArgs[1]);
    }
    if (operator === "hue_from_hex") {
      return hueFromHex(evaluatedArgs[0]);
    }

    throw new Error(`JSON Logic operator '${operator}' is not implemented.`);
  };

  return evaluateNode(expressionJson);
}

export function getTemplateFormulaFields(fields: DerivedField[] | undefined): DerivedField[] {
  return (fields || []).filter((field) => field.surfaces.includes(FormulaFieldSurface.template));
}

export function getFormulaFieldsForSurface(
  fields: DerivedField[] | undefined,
  surface: FormulaFieldSurface,
): DerivedField[] {
  return (fields || []).filter((field) => field.surfaces.includes(surface));
}

export function buildFormulaValues(scope: FormulaScope, fields: DerivedField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  fields.forEach((field) => {
    try {
      if (field.expression_json) {
        values[field.key] = evaluateFormulaJsonLogic(field.expression_json, scope);
      }
    } catch {
      // Failed evaluations stay hidden so one invalid formula does not break show/list/template
      // rendering for the rest of the entity payload.
    }
  });
  return values;
}

export function formatFormulaValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `${value}`;
  }
  return JSON.stringify(value);
}
