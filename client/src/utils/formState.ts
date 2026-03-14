type ComparableDefaults = Record<string, unknown>;
type ComparableOverride = unknown | ((normalized: Record<string, unknown>) => unknown);
type ComparableOverrides = Partial<Record<string, ComparableOverride>>;

export function normalizeComparableValue(value: unknown): unknown {
  // Form dirty-state comparisons need stable primitives, not Dayjs wrappers or
  // object identity, before the selected fields are serialized for comparison.
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "object" &&
    "isValid" in (value as Record<string, unknown>) &&
    "toISOString" in (value as Record<string, unknown>)
  ) {
    const maybeDayjs = value as { isValid?: () => boolean; toISOString?: () => string };
    if (typeof maybeDayjs.isValid === "function" && maybeDayjs.isValid() && typeof maybeDayjs.toISOString === "function") {
      return maybeDayjs.toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeComparableValue);
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return Object.keys(objectValue)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const normalizedValue = normalizeComparableValue(objectValue[key]);
        if (normalizedValue !== undefined) {
          acc[key] = normalizedValue;
        }
        return acc;
      }, {});
  }

  return value;
}

export function toComparableState(
  value: unknown,
  defaults: ComparableDefaults,
  overrides?: ComparableOverrides,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = normalizeComparableValue(value);
  const normalizedObject =
    normalized && typeof normalized === "object" ? (normalized as Record<string, unknown>) : {};

  // Each form provides the fields it owns plus any UI-specific overrides, so
  // dirty-state checks stay aligned with editable inputs instead of raw API payloads.
  const comparableState = Object.keys(defaults).reduce<Record<string, unknown>>((acc, key) => {
    const override = overrides?.[key];
    if (typeof override === "function") {
      acc[key] = override(normalizedObject);
      return acc;
    }
    if (override !== undefined) {
      acc[key] = override;
      return acc;
    }
    acc[key] = normalizedObject[key] ?? defaults[key];
    return acc;
  }, {});

  return JSON.stringify(comparableState);
}
