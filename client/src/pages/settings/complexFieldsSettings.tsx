import { json } from "@codemirror/lang-json";
import { EditorView, drawSelection } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import {
  CloseCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import {
  Button,
  Col,
  Divider,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from "antd";
import { ColumnType } from "antd/es/table";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  FORMULA_HELPER_GROUPS,
  FORMULA_HELPERS,
  FormulaHelperDefinition,
  getExtraFieldReferences,
} from "../../utils/formulaFields";
import {
  ComplexFieldSurface,
  DerivedField,
  DerivedFieldType,
  EntityType,
  FieldType,
  useDeleteDerivedField,
  useGetDerivedFields,
  useGetFields,
  usePreviewDerivedField,
  useSetDerivedField,
} from "../../utils/queryFields";

const DERIVED_SURFACE_OPTIONS = [ComplexFieldSurface.show, ComplexFieldSurface.list, ComplexFieldSurface.template];
const BUILTIN_REFERENCE_SUGGESTIONS: Record<EntityType, string[]> = {
  vendor: ["id", "name", "registered", "comment"],
  filament: ["id", "name", "material", "price", "density", "weight", "color_hex", "comment"],
  spool: ["id", "weight", "remaining_weight", "used_weight", "price", "lot_nr", "comment", "created_at"],
};
const SAMPLE_VALUE_PLACEHOLDERS: Record<EntityType, string> = {
  vendor: '{"name": "Example Vendor", "registered": "2026-02-28T10:15:00Z"}',
  filament: '{"weight": 1000, "material": "PLA", "created_at": "2026-02-28T10:15:00Z", "color_hex": "#FF00FF"}',
  spool: '{"weight": 1000, "remaining_weight": 225, "created_at": "2026-02-28T10:15:00Z"}',
};
const JSON_LOGIC_OPERATOR_GROUPS: Array<{ key: string; operators: string[] }> = [
  { key: "logical", operators: ["if", "and", "or", "!"] },
  { key: "comparison", operators: ["==", "!=", "<", "<=", ">", ">="] },
  { key: "arithmetic", operators: ["+", "-", "*", "/", "%"] },
];
const OPERATOR_PANEL_WIDTH = 244;
const INLINE_OPERATOR_PANEL_HEIGHT = 264;
const HELPER_DESKTOP_COLUMN_LAYOUT: Array<{ top: string; bottom?: string }> = [
  { top: "math", bottom: "color" },
  { top: "text" },
  { top: "datetime" },
  { top: "dynamic", bottom: "date_diff" },
];
const JSON_LOGIC_OPERATOR_SNIPPETS: Record<string, string> = {
  if: '{\n  "if": [\n    {"var": "condition"},\n    "then_value",\n    "else_value"\n  ]\n}',
  and: '{\n  "and": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  or: '{\n  "or": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "!": '{\n  "!": [\n    {"var": "value"}\n  ]\n}',
  "==": '{\n  "==": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "!=": '{\n  "!=": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "<": '{\n  "<": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "<=": '{\n  "<=": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  ">": '{\n  ">": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  ">=": '{\n  ">=": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "+": '{\n  "+": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "-": '{\n  "-": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "*": '{\n  "*": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "/": '{\n  "/": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
  "%": '{\n  "%": [\n    {"var": "left"},\n    {"var": "right"}\n  ]\n}',
};
const RESERVED_DERIVED_KEY_NAMES = new Set([
  ...JSON_LOGIC_OPERATOR_GROUPS.flatMap((group) => group.operators),
  ...FORMULA_HELPERS.map((helper) => helper.name),
]);

type ReferenceValueKind = "any" | "number" | "datetime" | "text" | "boolean" | "range" | "unknown";
type PendingHelperInsertState = {
  helperName: string;
  selectedReferences: string[];
};
type FormulaResultTypeHint = "number" | "text" | "boolean" | "unknown";

const BUILTIN_REFERENCE_KIND_HINTS: Record<EntityType, Record<string, ReferenceValueKind>> = {
  vendor: {
    id: "number",
    name: "text",
    registered: "datetime",
    comment: "text",
  },
  filament: {
    id: "number",
    name: "text",
    material: "text",
    price: "number",
    density: "number",
    weight: "number",
    color_hex: "text",
    comment: "text",
  },
  spool: {
    id: "number",
    weight: "number",
    remaining_weight: "number",
    used_weight: "number",
    price: "number",
    lot_nr: "text",
    comment: "text",
    created_at: "datetime",
  },
};

function resolveColorLuminance(color: string): number | null {
  const normalized = color.trim().toLowerCase();

  const hexMatch = normalized.match(/^#([a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const value =
      hex.length === 3 || hex.length === 4
        ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
        : hex.slice(0, 6);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (!rgbMatch) {
    return null;
  }
  const channels = rgbMatch[1]
    .split(",")
    .map((part) => part.trim())
    .slice(0, 3);
  if (channels.length !== 3) {
    return null;
  }

  const toByte = (channel: string): number | null => {
    if (channel.endsWith("%")) {
      const percent = Number(channel.slice(0, -1));
      if (Number.isNaN(percent)) {
        return null;
      }
      return Math.round((Math.max(0, Math.min(100, percent)) / 100) * 255);
    }
    const value = Number(channel);
    if (Number.isNaN(value)) {
      return null;
    }
    return Math.max(0, Math.min(255, value));
  };

  const r = toByte(channels[0]);
  const g = toByte(channels[1]);
  const b = toByte(channels[2]);
  if (r == null || g == null || b == null) {
    return null;
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function formatPreviewValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  return `${value}`;
}

function parseSampleValues(raw: string | undefined): Record<string, unknown> {
  if (!raw || raw.trim() === "") {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Sample values must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseExpressionJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw || raw.trim() === "") {
    return undefined;
  }

  const parsed = JSON.parse(raw);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Expression JSON must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function mergeTypeHints(typeHints: FormulaResultTypeHint[]): FormulaResultTypeHint {
  const knownHints = typeHints.filter((typeHint) => typeHint !== "unknown");
  if (knownHints.length === 0) {
    return "unknown";
  }
  return knownHints.every((typeHint) => typeHint === knownHints[0]) ? knownHints[0] : "unknown";
}

function inferExpressionJsonType(node: unknown): FormulaResultTypeHint {
  if (typeof node === "number") {
    return "number";
  }
  if (typeof node === "string") {
    return "text";
  }
  if (typeof node === "boolean") {
    return "boolean";
  }
  if (node === null || Array.isArray(node) || typeof node !== "object") {
    return "unknown";
  }

  const entries = Object.entries(node as Record<string, unknown>);
  if (entries.length !== 1) {
    return "unknown";
  }

  const [operator, rawArgs] = entries[0];
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  if (operator === "var") {
    return "unknown";
  }

  if (operator === "if") {
    const branchHints: FormulaResultTypeHint[] = [];
    for (let index = 1; index < args.length; index += 2) {
      branchHints.push(inferExpressionJsonType(args[index]));
    }
    if (args.length % 2 === 0 && args.length > 0) {
      branchHints.push(inferExpressionJsonType(args[args.length - 1]));
    }
    return mergeTypeHints(branchHints);
  }

  if (operator === "coalesce") {
    return mergeTypeHints(args.map((arg) => inferExpressionJsonType(arg)));
  }

  if (["==", "!=", "<", "<=", ">", ">=", "!", "and", "or"].includes(operator)) {
    return "boolean";
  }

  if (
    [
      "+",
      "-",
      "*",
      "/",
      "%",
      "abs",
      "min",
      "max",
      "round",
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "timestamp",
      "days_between",
      "hours_between",
      "hue_from_hex",
      "length",
    ].includes(operator)
  ) {
    return "number";
  }

  if (["date_only", "time_only", "today", "cat", "concat", "replace", "trim", "upper", "lower", "left", "right"].includes(operator)) {
    return "text";
  }

  return "unknown";
}

function toDerivedFieldType(typeHint: FormulaResultTypeHint): DerivedFieldType | null {
  if (typeHint === "number") {
    return DerivedFieldType.number;
  }
  if (typeHint === "text") {
    return DerivedFieldType.text;
  }
  return null;
}

export function FormulaFieldsSettings() {
  const { entityType } = useParams<{ entityType: EntityType }>();
  const t = useTranslate();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [messageApi, contextHolder] = message.useMessage();
  const [derivedModalOpen, setDerivedModalOpen] = useState(false);
  const [editingDerivedKey, setEditingDerivedKey] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewReferences, setPreviewReferences] = useState<string[]>([]);
  const [pendingJsonHelperInsert, setPendingJsonHelperInsert] = useState<PendingHelperInsertState | null>(null);
  const [resultTypeMismatchHint, setResultTypeMismatchHint] = useState<DerivedFieldType | null>(null);
  const [operatorPanelCollapsed, setOperatorPanelCollapsed] = useState(false);
  const [hoveredTokenId, setHoveredTokenId] = useState<string | null>(null);
  const [derivedForm] = Form.useForm();
  const expressionJsonEditorRef = useRef<EditorView | null>(null);
  const expressionJsonSelectionRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  const selectedEntityType = entityType as EntityType;
  const niceName = t(`${selectedEntityType}.${selectedEntityType}`);
  const sectionBodyStyle = { marginTop: 0, fontSize: token.fontSize, lineHeight: 1.7 };
  const tokenPanelStyle = useMemo(
    () => ({
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: token.borderRadiusLG,
      padding: 10,
      background: token.colorBgContainer,
    }),
    [token.colorBgContainer, token.colorBorderSecondary, token.borderRadiusLG],
  );
  const tokenCategoryStyle = useMemo(
    () => ({
      borderRadius: token.borderRadius,
      border: `1px solid ${token.colorBorderSecondary}`,
      background: token.colorFillQuaternary,
      padding: "8px 10px",
      minHeight: 68,
    }),
    [token.borderRadius, token.colorBorderSecondary, token.colorFillQuaternary],
  );
  const tokenListStyle = useMemo<CSSProperties>(
    () => ({
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
      justifyContent: "center",
    }),
    [],
  );
  const compactHelperCategoryStyle = useMemo<CSSProperties>(
    () => ({
      padding: "6px",
      minHeight: 52,
    }),
    [],
  );
  const compactHelperTokenListStyle = useMemo<CSSProperties>(
    () => ({
      ...tokenListStyle,
      justifyContent: "center",
      marginTop: 4,
      gap: 4,
    }),
    [tokenListStyle],
  );
  const referenceGridStyle = useMemo(
    () => ({
      display: "grid",
      // Keep references dense while predictable: 4 columns on desktop, 3/2 on medium widths, 1 on mobile.
      gridTemplateColumns: screens.lg || screens.xl || screens.xxl
        ? "repeat(4, minmax(0, 1fr))"
        : screens.md
          ? "repeat(3, minmax(0, 1fr))"
          : screens.sm
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(1, minmax(0, 1fr))",
      gap: 6,
    }),
    [screens.lg, screens.md, screens.sm, screens.xl, screens.xxl],
  );
  const isDesktopLayout = Boolean(screens.lg || screens.xl || screens.xxl);
  const isDesktopOperatorPanel = isDesktopLayout;
  const showInlineOperatorPanel = Boolean(isDesktopOperatorPanel && !operatorPanelCollapsed);
  const codeMirrorTheme = useMemo(() => {
    const bgLuminance = resolveColorLuminance(token.colorBgContainer);
    const textLuminance = resolveColorLuminance(token.colorText);
    const isDark = bgLuminance != null ? bgLuminance < 0.5 : (textLuminance ?? 0) > 0.6;
    // Use Ant warning background tokens so selection follows the theme palette,
    // but stays muted enough for multiline editing in dark mode.
    const selectionColor = isDark ? token.colorWarningBg : token.colorWarningBgHover;
    const selectionMatchColor = isDark ? "rgba(250, 173, 20, 0.24)" : "rgba(250, 173, 20, 0.18)";
    const activeLineColor = isDark ? "rgba(250, 173, 20, 0.02)" : "rgba(22, 119, 255, 0.04)";
    const activeLineGutterColor = isDark ? "rgba(250, 173, 20, 0.04)" : "rgba(22, 119, 255, 0.06)";
    // Force editor foreground/background directly from design tokens so formula JSON remains
    // readable in both light and dark themes regardless of global CSS inheritance.
    return EditorView.theme(
      {
        "&": {
          backgroundColor: token.colorBgContainer,
          color: token.colorText,
          borderRadius: token.borderRadius,
          border: `1px solid ${token.colorBorder}`,
        },
        "&.cm-editor": {
          backgroundColor: token.colorBgContainer,
          color: token.colorText,
        },
        "& .cm-scroller": {
          backgroundColor: token.colorBgContainer,
          color: token.colorText,
        },
        "&.cm-focused": {
          outline: `1px solid ${token.colorPrimaryBorderHover}`,
        },
        ".cm-scroller": {
          fontFamily: token.fontFamilyCode || "monospace",
        },
        ".cm-content, .cm-line": {
          color: token.colorText,
          caretColor: token.colorText,
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: token.colorText,
        },
        // Keep bracket feedback enabled (standard editor behavior) but align it to amber theme.
        ".cm-matchingBracket": {
          backgroundColor: `${selectionMatchColor} !important`,
          color: token.colorText,
          outline: `1px solid ${token.colorWarningBorder}`,
          borderRadius: 2,
        },
        ".cm-nonmatchingBracket": {
          backgroundColor: "transparent !important",
          color: token.colorError,
          outline: `1px solid ${token.colorErrorBorder}`,
          borderRadius: 2,
        },
        // Keep selection/search matches enabled (standard behavior), but use the same amber family.
        ".cm-content .cm-selectionMatch, .cm-content .cm-searchMatch, .cm-content .cm-searchMatch-selected": {
          backgroundColor: `${selectionMatchColor} !important`,
          outline: `1px solid ${token.colorWarningBorder}`,
          border: "none !important",
          borderRadius: 2,
          boxShadow: "none !important",
        },
        ".cm-gutters": {
          backgroundColor: token.colorBgElevated,
          color: token.colorTextTertiary,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        },
        ".cm-activeLine": {
          backgroundColor: activeLineColor,
        },
        ".cm-activeLineGutter": {
          backgroundColor: activeLineGutterColor,
        },
        ".cm-selectionLayer": {
          mixBlendMode: "normal",
        },
        // Force one consistent drawn selection color for both focused and blurred states.
        ".cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionBackground, &.cm-focused .cm-selectionLayer .cm-selectionBackground": {
          backgroundColor: `${selectionColor} !important`,
          borderRadius: 2,
        },
        // Keep native browser selection transparent so it doesn't override with platform colors.
        ".cm-content ::selection, .cm-line ::selection, .cm-line > span::selection, .cm-content *::selection": {
          backgroundColor: "transparent !important",
        },
      },
      { dark: isDark },
    );
  }, [
    token.borderRadius,
    token.colorBgContainer,
    token.colorBgElevated,
    token.colorBorder,
    token.colorBorderSecondary,
    token.colorError,
    token.colorErrorBorder,
    token.colorPrimaryBorderHover,
    token.colorText,
    token.colorTextTertiary,
    token.colorWarningBorder,
    token.colorWarningBg,
    token.colorWarningBgHover,
    token.fontFamilyCode,
  ]);
  useEffect(() => {
    if (!isDesktopOperatorPanel) {
      setOperatorPanelCollapsed(true);
      return;
    }
    setOperatorPanelCollapsed(false);
  }, [isDesktopOperatorPanel, derivedModalOpen]);

  const derivedFields = useGetDerivedFields(selectedEntityType);
  const configuredFields = useGetFields(selectedEntityType);
  const setDerivedField = useSetDerivedField(selectedEntityType);
  const deleteDerivedField = useDeleteDerivedField(selectedEntityType);
  const previewDerivedField = usePreviewDerivedField(selectedEntityType);
  const expressionJsonValue = Form.useWatch("expression_json", derivedForm) as string | undefined;
  const derivedKeyValue = ((Form.useWatch("key", derivedForm) as string | undefined) || "").trim();
  // Show the concrete API/template path for the currently typed key to remove
  // ambiguity between formula operator names and field output identifiers.
  const derivedKeyPath = useMemo(
    () => (derivedKeyValue ? `derived.${derivedKeyValue}` : "derived.<key>"),
    [derivedKeyValue],
  );
  const keyLooksLikeReservedToken = useMemo(
    () => RESERVED_DERIVED_KEY_NAMES.has(derivedKeyValue),
    [derivedKeyValue],
  );

  const sampleValuesPlaceholder = SAMPLE_VALUE_PLACEHOLDERS[selectedEntityType];

  const labeledField = (labelKey: string, tooltipKey: string) => (
    <Space size={4}>
      <span>{t(labelKey)}</span>
      <Tooltip title={t(tooltipKey)}>
        <QuestionCircleOutlined />
      </Tooltip>
    </Space>
  );

  const referenceOptions = useMemo(() => {
    const extraReferences = (configuredFields.data || []).map((field) => `extra.${field.key}`);
    // Suggest both built-in fields and configured extra fields so users can compose formulas
    // without memorizing the exact reference syntax for each entity.
    return [...new Set([...BUILTIN_REFERENCE_SUGGESTIONS[selectedEntityType], ...extraReferences])];
  }, [configuredFields.data, selectedEntityType]);
  const compactReferenceOptions = useMemo(
    () =>
      referenceOptions.map((reference) => ({
        value: reference,
        label: `{${reference}}`,
      })),
    [referenceOptions],
  );
  const helperByName = useMemo(
    () => Object.fromEntries(FORMULA_HELPERS.map((helper) => [helper.name, helper] as const)),
    [],
  );
  const operatorGroups = useMemo(
    () =>
      JSON_LOGIC_OPERATOR_GROUPS.map((group) => ({
        ...group,
        label: t(`settings.complex_fields.formula.token_categories.${group.key}`),
      })),
    [t],
  );
  const helperGroups = useMemo(
    () =>
      FORMULA_HELPER_GROUPS.map((group) => ({
        ...group,
        label: t(`settings.complex_fields.formula.token_categories.${group.key}`),
      })),
    [t],
  );
  const helperGroupByKey = useMemo(
    () => Object.fromEntries(helperGroups.map((group) => [group.key, group])),
    [helperGroups],
  );
  const referenceKindByName = useMemo(() => {
    const map: Record<string, ReferenceValueKind> = {
      ...BUILTIN_REFERENCE_KIND_HINTS[selectedEntityType],
    };

    (configuredFields.data || []).forEach((field) => {
      const fieldKind: ReferenceValueKind = (() => {
        switch (field.field_type) {
          case FieldType.integer:
          case FieldType.float:
            return "number";
          case FieldType.datetime:
            return "datetime";
          case FieldType.boolean:
            return "boolean";
          case FieldType.integer_range:
          case FieldType.float_range:
            return "range";
          case FieldType.text:
          case FieldType.choice:
            return "text";
          default:
            return "unknown";
        }
      })();
      map[`extra.${field.key}`] = fieldKind;
    });

    return map;
  }, [configuredFields.data, selectedEntityType]);
  const getHelperReferenceCount = (helper: FormulaHelperDefinition): number => {
    if (helper.insert_mode === "none") {
      return 0;
    }
    return helper.reference_count ?? 1;
  };
  const helperAllowsReferenceKind = (helper: FormulaHelperDefinition, referenceKind: ReferenceValueKind): boolean => {
    const requiredKind = helper.reference_kind ?? "any";
    if (requiredKind === "any") {
      return true;
    }
    return referenceKind === requiredKind;
  };
  const pendingHelperDefinition = useMemo(() => {
    if (!pendingJsonHelperInsert) {
      return null;
    }
    return helperByName[pendingJsonHelperInsert.helperName] || null;
  }, [helperByName, pendingJsonHelperInsert]);
  const getHelperDisabledReason = (helper: FormulaHelperDefinition): string | null => {
    if (helper.insert_mode === "none") {
      return null;
    }

    const requiredRefCount = getHelperReferenceCount(helper);
    const compatibleReferences = referenceOptions.filter((reference) =>
      helperAllowsReferenceKind(helper, referenceKindByName[reference] || "unknown"),
    );
    if (compatibleReferences.length < requiredRefCount) {
      return t("settings.complex_fields.formula.json_builder.helper_unavailable_reason", { helper: helper.name });
    }

    // When the user already picked reference #1 for a pending helper, temporarily disable helper
    // tokens that can't accept that selected reference kind. Clearing/completing pending insert
    // resets all helper tokens back to normal.
    if (pendingJsonHelperInsert?.selectedReferences.length) {
      const selectedKind = referenceKindByName[pendingJsonHelperInsert.selectedReferences[0]] || "unknown";
      if (!helperAllowsReferenceKind(helper, selectedKind)) {
        return t("settings.complex_fields.formula.json_builder.helper_incompatible_reason", { helper: helper.name });
      }
    }

    return null;
  };
  const isReferenceCompatibleWithPendingHelper = (reference: string): boolean => {
    if (!pendingHelperDefinition) {
      return true;
    }
    const referenceKind = referenceKindByName[reference] || "unknown";
    return helperAllowsReferenceKind(pendingHelperDefinition, referenceKind);
  };
  const buildHelperPlaceholderArguments = (helper: FormulaHelperDefinition): Array<{ var: string }> => {
    const referenceCount = getHelperReferenceCount(helper);
    if (referenceCount <= 0) {
      return [];
    }
    if (referenceCount === 1) {
      return [{ var: "value" }];
    }
    if (referenceCount === 2) {
      return [{ var: "start" }, { var: "end" }];
    }
    return Array.from({ length: referenceCount }, (_, index) => ({ var: `arg_${index + 1}` }));
  };
  const helperTokenGridStyle = useMemo<CSSProperties>(
    () => ({
      display: "grid",
      // Desktop uses a dedicated stacked helper layout; this fallback handles narrower widths.
      gridTemplateColumns: screens.md || screens.sm ? "repeat(2, minmax(0, 1fr))" : "repeat(1, minmax(0, 1fr))",
      gap: 8,
      alignItems: "start",
    }),
    [screens.md, screens.sm],
  );
  const renderTokenCategory = (
    key: string,
    label: string,
    tokens: ReactNode,
    style?: CSSProperties,
    tokenContainerStyle?: CSSProperties,
  ) => (
    <div key={key} style={{ ...tokenCategoryStyle, ...style }}>
      <Typography.Text type="secondary">
        <strong>{label}</strong>
      </Typography.Text>
      <div style={tokenContainerStyle ?? tokenListStyle}>{tokens}</div>
    </div>
  );
  const renderOperatorTokenGroups = (interactive: boolean) => (
    <div style={{ display: "grid", gap: 6 }}>
      {operatorGroups.map((group) => {
        const compactTitle =
          group.key === "logical"
            ? (
              <>
                {t("settings.complex_fields.formula.json_builder.operator_compact.logical_top")}
                <br />
                {t("settings.complex_fields.formula.json_builder.operator_compact.logical_bottom")}
              </>
            )
            : group.key === "comparison"
              ? t("settings.complex_fields.formula.json_builder.operator_compact.comparison")
              : t("settings.complex_fields.formula.json_builder.operator_compact.math");
        const operatorGridColumns = group.key === "logical" ? "repeat(2, max-content)" : "repeat(3, max-content)";
        const labelColumnWidth = group.key === "logical" ? 90 : 78;
        return (
          <div
            key={group.key}
            style={{
              ...tokenCategoryStyle,
              minHeight: 54,
              padding: "6px 8px",
              display: "grid",
              gridTemplateColumns: `1fr ${labelColumnWidth}px`,
              alignItems: "center",
              columnGap: 6,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: operatorGridColumns,
                gap: 3,
                justifyItems: "center",
                justifyContent: "start",
              }}
            >
              {group.operators.map((operator) => (
                (() => {
                  const tokenId = `operator-${group.key}-${operator}`;
                  const isHovered = hoveredTokenId === tokenId;
                  return (
                    <Typography.Text
                      key={tokenId}
                      code
                      style={{
                        cursor: interactive ? "pointer" : "default",
                        minWidth: 20,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        wordBreak: "normal",
                        overflowWrap: "normal",
                        color: interactive && isHovered ? token.colorWarningText : undefined,
                        background: interactive && isHovered ? token.colorWarningBg : undefined,
                        borderColor: interactive && isHovered ? token.colorWarningBorder : undefined,
                        transition: "all 120ms ease-out",
                      }}
                      onMouseEnter={interactive ? () => setHoveredTokenId(tokenId) : undefined}
                      onMouseLeave={interactive ? () => setHoveredTokenId((current) => (current === tokenId ? null : current)) : undefined}
                      onClick={interactive ? () => insertExpressionJsonOperator(operator) : undefined}
                    >
                      {operator}
                    </Typography.Text>
                  );
                })()
              ))}
            </div>
            <Typography.Text type="secondary">
              <strong style={{ lineHeight: 1.1, fontSize: "0.92em", whiteSpace: "nowrap", textAlign: "right", display: "block" }}>
                {compactTitle}
              </strong>
            </Typography.Text>
          </div>
        );
      })}
    </div>
  );
  const renderHelperTokenCategory = (
    groupKey: string,
    interactive: boolean,
    compact = false,
  ) => {
    const group = helperGroupByKey[groupKey];
    if (!group || group.helpers.length === 0) {
      return null;
    }
    return renderTokenCategory(
      group.key,
      group.label,
      group.helpers.map((helper) => {
        const disabledReason = interactive ? getHelperDisabledReason(helper) : null;
        const tokenId = `helper-${helper.name}`;
        const isHovered = hoveredTokenId === tokenId;
        const helperToken = (
          <Typography.Text
            code
            style={{
              cursor: interactive ? (disabledReason ? "not-allowed" : "pointer") : "default",
              opacity: disabledReason ? 0.45 : 1,
              whiteSpace: "nowrap",
              wordBreak: "normal",
              overflowWrap: "normal",
              flexShrink: 0,
              color: interactive && !disabledReason && isHovered ? token.colorWarningText : undefined,
              background: interactive && !disabledReason && isHovered ? token.colorWarningBg : undefined,
              borderColor: interactive && !disabledReason && isHovered ? token.colorWarningBorder : undefined,
              transition: "all 120ms ease-out",
            }}
            onMouseEnter={interactive && !disabledReason ? () => setHoveredTokenId(tokenId) : undefined}
            onMouseLeave={interactive && !disabledReason ? () => setHoveredTokenId((current) => (current === tokenId ? null : current)) : undefined}
            onClick={interactive && !disabledReason ? () => insertExpressionJsonHelper(helper) : undefined}
          >
            {helper.name}
          </Typography.Text>
        );
        return (
          <Tooltip key={`helper-${helper.name}`} title={interactive ? disabledReason || undefined : undefined}>
            <span style={{ display: "inline-flex" }}>{helperToken}</span>
          </Tooltip>
        );
      }),
      compact ? compactHelperCategoryStyle : undefined,
      compact ? compactHelperTokenListStyle : undefined,
    );
  };
  const renderHelperTokenGroups = (interactive: boolean) => {
    if (isDesktopLayout) {
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 8,
            alignItems: "start",
          }}
        >
          {HELPER_DESKTOP_COLUMN_LAYOUT.map((column) => (
            <div key={`helper-column-${column.top}`} style={{ display: "grid", gap: 8, alignContent: "start" }}>
              {renderHelperTokenCategory(column.top, interactive)}
              {column.bottom ? renderHelperTokenCategory(column.bottom, interactive, true) : null}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div style={helperTokenGridStyle}>
        {helperGroups.map((group) => renderHelperTokenCategory(group.key, interactive))}
      </div>
    );
  };

  const missingCustomReferencesByDerivedField = useMemo(() => {
    const availableCustomFieldKeys = new Set((configuredFields.data || []).map((field) => field.key));
    const missingMap: Record<string, string[]> = {};

    (derivedFields.data || []).forEach((derivedField) => {
      const missingReferences = getExtraFieldReferences(derivedField.expression_json || undefined).filter(
        (reference) => !availableCustomFieldKeys.has(reference),
      );
      if (missingReferences.length > 0) {
        missingMap[derivedField.key] = missingReferences;
      }
    });

    return missingMap;
  }, [configuredFields.data, derivedFields.data]);

  const hasBrokenFormulaDependencies = useMemo(
    () => Object.keys(missingCustomReferencesByDerivedField).length > 0,
    [missingCustomReferencesByDerivedField],
  );

  const openCreateDerived = () => {
    setEditingDerivedKey(null);
    setPreviewText(null);
    setPreviewReferences([]);
    setResultTypeMismatchHint(null);
    derivedForm.resetFields();
    derivedForm.setFieldsValue({
      key: "",
      name: "",
      description: "",
      result_type: DerivedFieldType.number,
      surfaces: [ComplexFieldSurface.show],
      allow_list_column_toggle: false,
      include_in_api: false,
      expression_json: "",
      sample_values: "{}",
    });
    setDerivedModalOpen(true);
  };

  const openEditDerived = (record: DerivedField) => {
    setEditingDerivedKey(record.key);
    setPreviewText(null);
    setPreviewReferences([]);
    setResultTypeMismatchHint(null);
    derivedForm.setFieldsValue({
      key: record.key,
      name: record.name,
      description: record.description || "",
      result_type: record.result_type,
      surfaces: record.surfaces,
      allow_list_column_toggle: record.allow_list_column_toggle,
      include_in_api: record.include_in_api ?? false,
      expression_json: record.expression_json ? JSON.stringify(record.expression_json, null, 2) : "",
      sample_values: "{}",
    });
    setDerivedModalOpen(true);
  };

  const closeDerivedModal = () => {
    setDerivedModalOpen(false);
    setEditingDerivedKey(null);
    setPreviewText(null);
    setPreviewReferences([]);
    setResultTypeMismatchHint(null);
    setPendingJsonHelperInsert(null);
    expressionJsonSelectionRef.current = { from: 0, to: 0 };
    derivedForm.resetFields();
  };

  const insertExpressionJsonSnippet = (snippet: string) => {
    const currentValue = (derivedForm.getFieldValue("expression_json") as string | undefined) || "";
    const hasEditor = expressionJsonEditorRef.current !== null;
    if (!hasEditor) {
      const prefix = currentValue.trim() === "" ? "" : "\n";
      derivedForm.setFieldValue("expression_json", `${currentValue}${prefix}${snippet}`);
      return;
    }

    const start = expressionJsonSelectionRef.current.from;
    const end = expressionJsonSelectionRef.current.to;
    const nextValue = `${currentValue.slice(0, start)}${snippet}${currentValue.slice(end)}`;
    const nextCursor = start + snippet.length;
    derivedForm.setFieldValue("expression_json", nextValue);
    expressionJsonSelectionRef.current = { from: nextCursor, to: nextCursor };

    requestAnimationFrame(() => {
      const editor = expressionJsonEditorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      editor.dispatch({
        selection: { anchor: nextCursor, head: nextCursor },
        scrollIntoView: true,
      });
    });
  };

  const insertExpressionJsonReference = (reference: string) => {
    if (!pendingHelperDefinition) {
      insertExpressionJsonSnippet(JSON.stringify({ var: reference }, null, 2));
      return;
    }

    if (!isReferenceCompatibleWithPendingHelper(reference)) {
      messageApi.warning(
        t("settings.complex_fields.formula.json_builder.reference_incompatible_reason", {
          helper: pendingHelperDefinition.name,
        }),
      );
      return;
    }

    const pendingState = pendingJsonHelperInsert;
    if (!pendingState) {
      return;
    }
    const requiredReferenceCount = getHelperReferenceCount(pendingHelperDefinition);
    const selectedReferences = [...pendingState.selectedReferences, reference];
    if (selectedReferences.length < requiredReferenceCount) {
      setPendingJsonHelperInsert({
        helperName: pendingHelperDefinition.name,
        selectedReferences,
      });
      return;
    }

    const snippet = {
      [pendingHelperDefinition.name]: selectedReferences
        .slice(0, requiredReferenceCount)
        .map((selectedReference) => ({ var: selectedReference })),
    };
    // Insert ready-to-parse JSON Logic objects so users can build expressions without memorizing
    // raw AST syntax.
    insertExpressionJsonSnippet(JSON.stringify(snippet, null, 2));
    setPendingJsonHelperInsert(null);
  };

  const insertExpressionJsonHelper = (helper: FormulaHelperDefinition) => {
    if (helper.insert_mode === "none") {
      insertExpressionJsonSnippet(JSON.stringify({ [helper.name]: [] }, null, 2));
      setPendingJsonHelperInsert(null);
      return;
    }
    const disabledReason = getHelperDisabledReason(helper);
    if (disabledReason) {
      messageApi.warning(disabledReason);
      return;
    }
    // Keep helper insertion staged until required reference tokens are selected, so helpers with
    // multiple reference operands (for example days_between/hours_between) can be assembled safely.
    setPendingJsonHelperInsert({ helperName: helper.name, selectedReferences: [] });
    messageApi.info(
      t("settings.complex_fields.formula.json_builder.pending_helper", {
        helper: helper.name,
        selected: 0,
        total: getHelperReferenceCount(helper),
      }),
    );
  };

  const insertPendingHelperWithoutReferences = () => {
    if (!pendingHelperDefinition) {
      return;
    }
    const placeholderSnippet = {
      [pendingHelperDefinition.name]: buildHelperPlaceholderArguments(pendingHelperDefinition),
    };
    insertExpressionJsonSnippet(JSON.stringify(placeholderSnippet, null, 2));
    setPendingJsonHelperInsert(null);
  };
  const cancelPendingHelperInsert = () => {
    setPendingJsonHelperInsert(null);
  };

  const insertExpressionJsonOperator = (operator: string) => {
    const snippet = JSON_LOGIC_OPERATOR_SNIPPETS[operator];
    if (!snippet) {
      return;
    }
    insertExpressionJsonSnippet(snippet);
    setPendingJsonHelperInsert(null);
  };

  const formatExpressionJson = async () => {
    try {
      const currentValue = (derivedForm.getFieldValue("expression_json") as string | undefined) || "";
      const parsed = parseExpressionJson(currentValue);
      if (!parsed) {
        setResultTypeMismatchHint(null);
        return;
      }
      const selectedResultType = derivedForm.getFieldValue("result_type") as DerivedFieldType | undefined;
      const inferredType = toDerivedFieldType(inferExpressionJsonType(parsed));
      if (selectedResultType && inferredType && inferredType !== selectedResultType) {
        setResultTypeMismatchHint(inferredType);
      } else {
        setResultTypeMismatchHint(null);
      }
      derivedForm.setFieldValue("expression_json", JSON.stringify(parsed, null, 2));
      messageApi.success(t("settings.complex_fields.formula.json_builder.formatted"));
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    }
  };

  const saveDerived = async () => {
    try {
      const values = await derivedForm.validateFields();
      const key = editingDerivedKey || values.key;
      const expressionJson = parseExpressionJson(values.expression_json);
      if (!expressionJson) {
        throw new Error(t("settings.complex_fields.formula.expression_json_required"));
      }
      if (expressionJson) {
        const inferredType = toDerivedFieldType(inferExpressionJsonType(expressionJson));
        if (inferredType && inferredType !== values.result_type) {
          setResultTypeMismatchHint(inferredType);
        } else {
          setResultTypeMismatchHint(null);
        }
      } else {
        setResultTypeMismatchHint(null);
      }

      await setDerivedField.mutateAsync({
        key,
        params: {
          name: values.name,
          description: values.description || undefined,
          result_type: values.result_type,
          expression_json: expressionJson,
          surfaces: values.surfaces,
          allow_list_column_toggle: values.allow_list_column_toggle,
          include_in_api: values.include_in_api ?? false,
        },
      });

      messageApi.success(
        t(editingDerivedKey ? "settings.complex_fields.formula.messages.updated" : "settings.complex_fields.formula.messages.created", {
          name: values.name,
        }),
      );
      closeDerivedModal();
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    }
  };

  const previewDerived = async () => {
    try {
      const values = await derivedForm.validateFields(["expression_json", "sample_values"]);
      const sampleValues = parseSampleValues(values.sample_values);
      const expressionJson = parseExpressionJson(values.expression_json);
      if (!expressionJson) {
        throw new Error(t("settings.complex_fields.formula.expression_json_required"));
      }
      // Preview uses sample JSON only as a sandbox for validating formulas before they are exposed
      // on show/list/template surfaces.
      const preview = await previewDerivedField.mutateAsync({
        expression_json: expressionJson,
        sample_values: sampleValues,
      });

      setPreviewText(formatPreviewValue(preview.result));
      setPreviewReferences(preview.references);
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    }
  };

  const removeDerived = async (record: DerivedField) => {
    try {
      await deleteDerivedField.mutateAsync(record.key);
      messageApi.success(t("settings.complex_fields.formula.messages.deleted", { name: record.name }));
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    }
  };

  const derivedColumns: ColumnType<DerivedField>[] = [
    {
      title: t("settings.complex_fields.formula.columns.key"),
      dataIndex: "key",
      key: "key",
      width: "12%",
    },
    {
      title: t("settings.complex_fields.formula.columns.name"),
      dataIndex: "name",
      key: "name",
      width: "16%",
    },
    {
      title: t("settings.complex_fields.formula.columns.result_type"),
      dataIndex: "result_type",
      key: "result_type",
      width: "10%",
      render: (value: DerivedFieldType) => t(`settings.complex_fields.formula.types.${value}`),
    },
    {
      title: t("settings.complex_fields.formula.columns.expression"),
      dataIndex: "expression_json",
      key: "expression",
      width: "30%",
      render: (_value: Record<string, unknown> | undefined, record) => {
        const expressionValue = record.expression_json ? JSON.stringify(record.expression_json) : "";
        const missingReferences = missingCustomReferencesByDerivedField[record.key] || [];
        return (
          <Space direction="vertical" size={4}>
            <Typography.Text code style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
              {expressionValue}
            </Typography.Text>
            {missingReferences.length > 0 && (
              <Typography.Text type="danger">
                {t("settings.complex_fields.formula.missing_references", {
                  references: missingReferences.join(", "),
                })}
              </Typography.Text>
            )}
          </Space>
        );
      },
    },
    {
      title: t("settings.complex_fields.formula.columns.surfaces"),
      dataIndex: "surfaces",
      key: "surfaces",
      width: "16%",
      render: (surfaces: string[]) => (
        <Space size={[4, 4]} wrap>
          {surfaces.map((surface) => (
            <Tag key={surface}>{t(`settings.complex_fields.surfaces.${surface}`)}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t("settings.complex_fields.formula.columns.include_in_api"),
      dataIndex: "include_in_api",
      key: "include_in_api",
      width: "10%",
      render: (value: boolean) => (value ? <Tag color="processing">API</Tag> : <Tag>{t("no")}</Tag>),
    },
    {
      title: "",
      key: "operation",
      width: "16%",
      render: (_: unknown, record) => (
        <Space>
          <Button onClick={() => openEditDerived(record)} size="small">
            {t("buttons.edit")}
          </Button>
          <Popconfirm
            title={t("settings.complex_fields.formula.delete_confirm", { name: record.name })}
            onConfirm={() => removeDerived(record)}
            okText={t("buttons.delete")}
            cancelText={t("buttons.cancel")}
          >
            <Button danger size="small">
              {t("buttons.delete")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const previewSummary = useMemo(() => {
    if (previewText == null) {
      return null;
    }

    const referencesText =
      previewReferences.length > 0
        ? t("settings.complex_fields.formula.preview.references_used", {
            references: previewReferences.join(", "),
          })
        : t("settings.complex_fields.formula.preview.no_references");

    return (
      <Typography.Paragraph
        style={{
          marginBottom: 0,
        }}
      >
        <strong>{t("settings.complex_fields.formula.preview.result_label")}</strong> {previewText}
        <br />
        {referencesText}
      </Typography.Paragraph>
    );
  }, [previewReferences, previewText, t]);
  const pendingHelperHint = useMemo(() => {
    if (!pendingHelperDefinition || !pendingJsonHelperInsert) {
      return null;
    }
    const selected = pendingJsonHelperInsert.selectedReferences.length;
    const total = getHelperReferenceCount(pendingHelperDefinition);
    return {
      helper: pendingHelperDefinition.name,
      selected,
      total,
    };
  }, [pendingHelperDefinition, pendingJsonHelperInsert]);
  return (
    <>
      <Divider orientation="left" plain>
        <Space size={8}>
          <span>
            {t("settings.complex_fields.formula.header")}: {niceName}
          </span>
          <Tooltip title={t("settings.complex_fields.formula.tooltip")}>
            <QuestionCircleOutlined />
          </Tooltip>
          <Link
            style={{
              fontSize: "0.85em",
            }}
            to="/help#formula-fields"
          >
            {t("settings.complex_fields.help_links.formula")}
          </Link>
        </Space>
      </Divider>
      <Typography.Paragraph type="secondary" style={sectionBodyStyle}>
        {t("settings.complex_fields.formula.intro")}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: -8 }}>
        {t("settings.complex_fields.formula.evaluation_model_help")}
      </Typography.Paragraph>
      {hasBrokenFormulaDependencies && (
        <Typography.Paragraph type="danger" style={{ marginTop: 0 }}>
          {t("settings.complex_fields.formula.missing_references_intro")}
        </Typography.Paragraph>
      )}
      <Typography.Paragraph type="secondary" style={{ ...sectionBodyStyle, marginBottom: 12 }}>
        {t("settings.complex_fields.available_functions.value")}
      </Typography.Paragraph>
      <Table
        columns={derivedColumns}
        dataSource={derivedFields.data || []}
        loading={derivedFields.isLoading}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              description={t("settings.complex_fields.formula.empty")}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        onRow={(record) => {
          const hasMissingReferences = (missingCustomReferencesByDerivedField[record.key] || []).length > 0;
          if (!hasMissingReferences) {
            return {};
          }
          return {
            style: {
              backgroundColor: token.colorErrorBg,
            },
          };
        }}
        rowKey="key"
      />
      <Flex justify="center">
        <Button
          type="primary"
          shape="circle"
          icon={<PlusOutlined />}
          size="large"
          style={{
            margin: "1em",
          }}
          onClick={() => openCreateDerived()}
        />
      </Flex>

      <Modal
        destroyOnHidden
        onCancel={() => closeDerivedModal()}
        onOk={() => saveDerived()}
        open={derivedModalOpen}
        okText={t("buttons.save")}
        cancelText={t("buttons.cancel")}
        title={`${t(
          editingDerivedKey
            ? "settings.complex_fields.formula.modal.edit_title"
            : "settings.complex_fields.formula.modal.create_title",
        )}: ${niceName}`}
        width={820}
      >
        <Form
          form={derivedForm}
          layout="vertical"
          initialValues={{
            result_type: DerivedFieldType.number,
            surfaces: [ComplexFieldSurface.show],
            allow_list_column_toggle: false,
            include_in_api: false,
            expression_json: "",
            sample_values: "{}",
          }}
        >
          {/* Responsive split: two columns on medium+ screens, stacked flow on narrow/mobile widths. */}
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={labeledField(
                  "settings.complex_fields.formula.columns.key",
                  "settings.complex_fields.formula.tooltips.key",
                )}
                name="key"
                extra={(
                  <Space direction="vertical" size={2} style={{ width: "100%" }}>
                    <Typography.Text type="secondary">
                      {t("settings.complex_fields.formula.key_usage_help")}: <Typography.Text code>{derivedKeyPath}</Typography.Text>
                    </Typography.Text>
                    {keyLooksLikeReservedToken && (
                      <Typography.Text type="warning">
                        <WarningOutlined style={{ marginRight: 6 }} />
                        {t("settings.complex_fields.formula.key_reserved_hint", { key: derivedKeyValue })}
                      </Typography.Text>
                    )}
                  </Space>
                )}
                rules={[
                  { required: true, min: 1, max: 64, pattern: /^[a-z0-9_]+$/ },
                  {
                    validator: async (_, value) => {
                      if (!editingDerivedKey && derivedFields.data?.some((field) => field.key === value)) {
                        throw new Error(t("settings.extra_fields.non_unique_key_error"));
                      }
                    },
                  },
                ]}
              >
                <Input disabled={editingDerivedKey != null} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={labeledField(
                  "settings.complex_fields.formula.columns.name",
                  "settings.complex_fields.formula.tooltips.name",
                )}
                name="name"
                rules={[{ required: true, min: 1, max: 128 }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t("settings.complex_fields.formula.columns.description")} name="description" rules={[{ max: 512 }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          {/* Keep Display In aligned with Result Type on desktop while preserving form order when stacked. */}
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={(
                  <Space size={6}>
                    <span>{t("settings.complex_fields.formula.columns.result_type")}</span>
                    {resultTypeMismatchHint && (
                      <>
                        <Tooltip
                          title={t("settings.complex_fields.formula.result_type_mismatch_hint", {
                            inferred: t(`settings.complex_fields.formula.types.${resultTypeMismatchHint}`),
                          })}
                        >
                          <WarningOutlined style={{ color: token.colorWarning }} />
                        </Tooltip>
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: "auto", lineHeight: 1 }}
                          onClick={() => {
                            derivedForm.setFieldValue("result_type", resultTypeMismatchHint);
                            setResultTypeMismatchHint(null);
                          }}
                        >
                          {t("settings.complex_fields.formula.result_type_autoset")}
                        </Button>
                      </>
                    )}
                  </Space>
                )}
                name="result_type"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: t("settings.complex_fields.formula.types.number"), value: DerivedFieldType.number },
                    { label: t("settings.complex_fields.formula.types.text"), value: DerivedFieldType.text },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={labeledField(
                  "settings.complex_fields.formula.columns.surfaces",
                  "settings.complex_fields.formula.tooltips.display_in",
                )}
                required
              >
                <Flex gap={12} align="center" wrap>
                  <Form.Item name="surfaces" rules={[{ required: true, type: "array", min: 1 }]} noStyle>
                    <Select
                      mode="multiple"
                      style={{ width: "100%" }}
                      options={DERIVED_SURFACE_OPTIONS.map((surface) => ({
                        label: t(`settings.complex_fields.surfaces.${surface}`),
                        value: surface,
                      }))}
                      onChange={(selected: string[]) => {
                        if (!selected.includes(ComplexFieldSurface.list)) {
                          derivedForm.setFieldValue("allow_list_column_toggle", false);
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item shouldUpdate noStyle>
                    {({ getFieldValue }) => {
                      const selectedSurfaces = (getFieldValue("surfaces") as string[] | undefined) || [];
                      const listEnabled = selectedSurfaces.includes(ComplexFieldSurface.list);
                      if (!listEnabled) {
                        return null;
                      }

                      return (
                        <Space size={8}>
                          <Form.Item name="allow_list_column_toggle" valuePropName="checked" noStyle>
                            <Switch />
                          </Form.Item>
                          <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
                            {t("settings.complex_fields.formula.allow_list_column_toggle_inline", { entity: niceName })}
                          </Typography.Text>
                        </Space>
                      );
                    }}
                  </Form.Item>
                </Flex>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            style={{ marginBottom: 4 }}
            label={
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Flex justify="space-between" align="center" gap={8} wrap={false}>
                  <Space size={8} align="center" wrap>
                    {labeledField(
                      "settings.complex_fields.formula.columns.expression_json",
                      "settings.complex_fields.formula.tooltips.expression_json",
                    )}
                    <Link style={{ fontSize: "0.85em" }} to="/help#formula-json-logic">
                      {t("settings.complex_fields.help_links.formula_json")}
                    </Link>
                  </Space>
                </Flex>
                <Typography.Text type="secondary" style={{ minWidth: 0 }}>
                  {t("settings.complex_fields.formula.expression_json_help")}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ minWidth: 0 }}>
                  {t("settings.complex_fields.formula.expression_json_example")}
                </Typography.Text>
              </Space>
            }
            name="expression_json"
            trigger="onChange"
            getValueFromEvent={(value: string) => value}
            rules={[
              {
                validator: async (_, value) => {
                  const parsed = parseExpressionJson(value);
                  if (!parsed) {
                    throw new Error(t("settings.complex_fields.formula.expression_json_required"));
                  }
                },
              },
            ]}
          >
            <div>
              {isDesktopOperatorPanel && (
                <Flex justify="flex-end" style={{ marginBottom: 2 }}>
                  <Tooltip
                    title={
                      showInlineOperatorPanel
                        ? t("settings.complex_fields.formula.json_builder.hide_operators")
                        : t("settings.complex_fields.formula.json_builder.show_operators")
                    }
                  >
                    <Button
                      type="default"
                      size="small"
                      icon={showInlineOperatorPanel ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                      onClick={() => setOperatorPanelCollapsed((current) => !current)}
                      aria-label={
                        showInlineOperatorPanel
                          ? t("settings.complex_fields.formula.json_builder.hide_operators")
                          : t("settings.complex_fields.formula.json_builder.show_operators")
                      }
                    />
                  </Tooltip>
                </Flex>
              )}
              <Flex align="stretch" gap={8} wrap={false}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      // Keep editor + operators visually balanced by default, while still allowing
                      // manual vertical resize for longer JSON authoring sessions.
                      height: showInlineOperatorPanel ? INLINE_OPERATOR_PANEL_HEIGHT : 196,
                      minHeight: showInlineOperatorPanel ? INLINE_OPERATOR_PANEL_HEIGHT : 196,
                      resize: "vertical",
                      overflow: "auto",
                    }}
                  >
                    <CodeMirror
                      value={expressionJsonValue || ""}
                      // Keep CodeMirror bound to the container height so dragging the resize handle
                      // expands the visible editor instead of adding blank space below it.
                      height="100%"
                      style={{
                        height: "100%",
                        backgroundColor: token.colorBgContainer,
                        color: token.colorText,
                      }}
                      extensions={[json(), drawSelection(), codeMirrorTheme]}
                      basicSetup={{
                        lineNumbers: true,
                        drawSelection: false,
                        // Keep standard editor affordances on and theme them via codeMirrorTheme.
                        bracketMatching: true,
                        highlightSelectionMatches: true,
                        highlightActiveLine: false,
                        foldGutter: true,
                      }}
                      onCreateEditor={(editor) => {
                        expressionJsonEditorRef.current = editor;
                        const mainSelection = editor.state.selection.main;
                        expressionJsonSelectionRef.current = { from: mainSelection.from, to: mainSelection.to };
                      }}
                      onUpdate={(viewUpdate) => {
                        const mainSelection = viewUpdate.state.selection.main;
                        expressionJsonSelectionRef.current = { from: mainSelection.from, to: mainSelection.to };
                      }}
                      onChange={(value) => {
                        derivedForm.setFieldValue("expression_json", value);
                      }}
                    />
                  </div>
                  <Flex justify="flex-end" style={{ marginTop: 4, marginRight: 18 }}>
                    <Tooltip title={t("settings.complex_fields.formula.json_builder.format_tooltip")}>
                      <Button size="small" onClick={() => formatExpressionJson()}>
                        {t("settings.complex_fields.formula.json_builder.format")}
                      </Button>
                    </Tooltip>
                  </Flex>
                </div>
                {showInlineOperatorPanel && (
                  <div
                    style={{
                      width: OPERATOR_PANEL_WIDTH,
                      flex: `0 0 ${OPERATOR_PANEL_WIDTH}px`,
                      ...tokenPanelStyle,
                      padding: 8,
                      height: INLINE_OPERATOR_PANEL_HEIGHT,
                      minHeight: INLINE_OPERATOR_PANEL_HEIGHT,
                      overflowY: "auto",
                    }}
                  >
                    <Typography.Text type="secondary" style={{ display: "block", textAlign: "right" }}>
                      <strong>{t("settings.complex_fields.formula.token_sections.operators")}</strong>
                    </Typography.Text>
                    <div style={{ marginTop: 8 }}>{renderOperatorTokenGroups(true)}</div>
                  </div>
                )}
              </Flex>
            </div>
          </Form.Item>
          {/* Show helper/operators before references so helper-first insertion flow is visually guided. */}
          <Space
            direction="vertical"
            size={2}
            style={{
              width: "100%",
              marginBottom: 8,
            }}
          >
            <Flex justify="space-between" align="center">
              <Space size={8} align="center">
                <Typography.Text type="secondary">
                  <strong>{t("settings.complex_fields.formula.json_builder.operators_title")}</strong>
                </Typography.Text>
                <Link
                  style={{ fontSize: "0.85em" }}
                  to="/help#formula-token-groups"
                >
                  {t("settings.complex_fields.help_links.formula_tokens")}
                </Link>
              </Space>
            </Flex>
            <div style={tokenPanelStyle}>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <div>
                  <Flex justify="space-between" align="center" gap={8} wrap={false} style={{ height: 34 }}>
                    <Typography.Text type="secondary">
                      <strong>{t("settings.complex_fields.formula.token_sections.helper_functions")}</strong>
                    </Typography.Text>
                    {pendingHelperHint ? (
                      <Space size={6} style={{ minWidth: 0, flexShrink: 0 }}>
                        <Typography.Text type="warning" style={{ whiteSpace: "nowrap" }}>
                          {t("settings.complex_fields.formula.json_builder.pending_helper_prefix")}
                        </Typography.Text>
                        <Typography.Text code style={{ color: token.colorWarningText }}>
                          {pendingHelperHint.helper}
                        </Typography.Text>
                        <Typography.Text type="warning" style={{ whiteSpace: "nowrap" }}>
                          {t("settings.complex_fields.formula.json_builder.pending_helper_count", {
                            selected: pendingHelperHint.selected,
                            total: pendingHelperHint.total,
                          })}
                        </Typography.Text>
                        <Tooltip title={t("settings.complex_fields.formula.json_builder.cancel_pending_tooltip")}>
                          <Button
                            danger
                            size="small"
                            type="text"
                            icon={<CloseCircleOutlined />}
                            onClick={() => cancelPendingHelperInsert()}
                            aria-label={t("settings.complex_fields.formula.json_builder.cancel_pending_tooltip")}
                          />
                        </Tooltip>
                        <Tooltip title={t("settings.complex_fields.formula.json_builder.insert_without_reference_tooltip")}>
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => insertPendingHelperWithoutReferences()}
                            aria-label={t("settings.complex_fields.formula.json_builder.insert_without_reference_tooltip")}
                          >
                            {t("settings.complex_fields.formula.json_builder.helper_only")}
                          </Button>
                        </Tooltip>
                      </Space>
                    ) : null}
                  </Flex>
                  <div style={{ marginTop: 6 }}>{renderHelperTokenGroups(true)}</div>
                </div>
                <div style={{ paddingTop: 4 }}>
                  <Typography.Text type="secondary">
                    <strong>{t("settings.complex_fields.formula.reference_picker.label")}</strong>
                  </Typography.Text>
                  <div style={{ ...tokenCategoryStyle, marginTop: 6 }}>
                    <div style={referenceGridStyle}>
                      {compactReferenceOptions.map((reference) => {
                        const referenceCompatible = isReferenceCompatibleWithPendingHelper(reference.value);
                        const isSelectedForPendingHelper = Boolean(
                          pendingJsonHelperInsert?.selectedReferences.includes(reference.value),
                        );
                        const disabledReason =
                          !referenceCompatible && pendingHelperDefinition
                            ? t("settings.complex_fields.formula.json_builder.reference_incompatible_reason", {
                                helper: pendingHelperDefinition.name,
                              })
                            : null;
                        const referenceToken = (
                          <Typography.Text
                            code
                            style={{
                              cursor: disabledReason ? "not-allowed" : "pointer",
                              opacity: disabledReason ? 0.45 : 1,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              textAlign: "center",
                              fontWeight: 500,
                              color: isSelectedForPendingHelper
                                ? token.colorPrimaryText
                                : (!disabledReason && hoveredTokenId === `reference-${reference.value}` ? token.colorWarningText : undefined),
                              background:
                                !disabledReason && hoveredTokenId === `reference-${reference.value}` ? token.colorWarningBg : undefined,
                              borderColor:
                                !disabledReason && hoveredTokenId === `reference-${reference.value}`
                                  ? token.colorWarningBorder
                                  : undefined,
                              transition: "all 120ms ease-out",
                            }}
                            onMouseEnter={!disabledReason ? () => setHoveredTokenId(`reference-${reference.value}`) : undefined}
                            onMouseLeave={!disabledReason ? () => setHoveredTokenId((current) => (current === `reference-${reference.value}` ? null : current)) : undefined}
                            onClick={!disabledReason ? () => insertExpressionJsonReference(reference.value) : undefined}
                          >
                            {reference.label}
                          </Typography.Text>
                        );
                        // Keep a stable wrapper shape for all reference tokens so disabled/tooltip states
                        // do not cause reflow when helper compatibility changes.
                        const content = (
                          <Tooltip title={disabledReason || undefined}>
                            <span style={{ display: "inline-flex", justifyContent: "center" }}>{referenceToken}</span>
                          </Tooltip>
                        );
                        return (
                          <div
                            key={`reference-cell-${reference.value}`}
                            style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 24 }}
                          >
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Space>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t("settings.complex_fields.formula.json_builder.click_to_insert_help")}
            </Typography.Paragraph>
          </Space>
          <Form.Item
            label={labeledField(
              "settings.complex_fields.formula.sample_values",
              "settings.complex_fields.formula.tooltips.sample_values",
            )}
            name="sample_values"
            extra={t("settings.complex_fields.formula.sample_values_help")}
            rules={[
              {
                validator: async (_, value) => {
                  parseSampleValues(value);
                },
              },
            ]}
          >
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={sampleValuesPlaceholder}
              style={{ fontFamily: token.fontFamilyCode || "monospace" }}
            />
          </Form.Item>
          <Space
            direction="vertical"
            size="middle"
            style={{
              width: "100%",
            }}
          >
            <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
              <Button onClick={() => previewDerived()} loading={previewDerivedField.isPending}>
                {t("settings.complex_fields.formula.preview.button")}
              </Button>
              <Flex align="center" gap={8} style={{ marginLeft: "auto" }}>
                {labeledField(
                  "settings.complex_fields.formula.columns.include_in_api",
                  "settings.complex_fields.formula.tooltips.include_in_api",
                )}
                <Form.Item name="include_in_api" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch />
                </Form.Item>
              </Flex>
            </Flex>
            {previewSummary}
          </Space>
        </Form>
      </Modal>
      {contextHolder}
    </>
  );
}
