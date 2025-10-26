import { CrudFilter, CrudOperators } from "@refinedev/core";
import { Field, FieldType, getCustomFieldKey, isCustomField } from "./queryFields";

interface TypedCrudFilter<Obj> {
  field: keyof Obj | string;
  operator: Exclude<CrudOperators, "or" | "and">;
  value: string[];
}

export function typeFilters<Obj>(filters: CrudFilter[]): TypedCrudFilter<Obj>[] {
  return filters as TypedCrudFilter<Obj>[]; // <-- Unsafe cast
}

/**
 * Returns an array of filter values for a given field based on the provided filters.
 * @param filters An array of `CrudFilter` objects that define the filtering criteria.
 * @param field The field to get the filter values for.
 * @returns An array of filter values for the given field.
 */
export function getFiltersForField<Obj>(
  filters: TypedCrudFilter<Obj>[],
  field: Field | string,
): string[] {
  const filterValues: string[] = [];
  filters.forEach((filter) => {
    if (filter.field === field) {
      filterValues.push(...(filter.value as string[]));
    }
  });
  return filterValues;
}

/**
 * Creates a filter value for a custom field based on its type
 * @param field The custom field definition
 * @param value The value to filter by
 * @returns The formatted filter value
 */
export function formatCustomFieldFilterValue(field: Field, value: any): string {
  switch (field.field_type) {
    case FieldType.text:
    case FieldType.choice:
      // For text and choice fields, we can use the value directly
      // If it's an exact match, surround with quotes
      if (typeof value === "string" && !value.startsWith('"') && !value.endsWith('"')) {
        // Check if we need an exact match (no wildcards)
        if (!value.includes("*") && !value.includes("?")) {
          return `"${value}"`;
        }
      }
      return value;
      
    case FieldType.integer:
    case FieldType.float:
      // For numeric fields, we can use the value directly
      return value.toString();
      
    case FieldType.boolean:
      // For boolean fields, convert to "true" or "false"
      return value ? "true" : "false";
      
    case FieldType.datetime:
      // For datetime fields, format as ISO string
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
      
    case FieldType.integer_range:
    case FieldType.float_range:
      // For range fields, format as min:max
      if (Array.isArray(value) && value.length === 2) {
        return `${value[0] ?? ""}:${value[1] ?? ""}`;
      }
      return value;
      
    default:
      return value;
  }
}

/**
 * Extracts all custom field filters from a list of filters
 * @param filters The list of filters
 * @returns An object with custom field keys and their filter values
 */
export function getCustomFieldFilters<Obj = any>(
  filters: CrudFilter[] | TypedCrudFilter<Obj>[]
): Record<string, string[]> {
  const customFieldFilters: Record<string, string[]> = {};
  
  filters.forEach((filter) => {
    if (!("field" in filter)) {
      return; // Skip non-field filters
    }
    
    const field = filter.field.toString();
    if (isCustomField(field)) {
      const key = getCustomFieldKey(field);
      customFieldFilters[key] = filter.value as string[];
    }
  });
  
  return customFieldFilters;
}

/**
 * Function that returns an array with all undefined values removed.
 */
export function removeUndefined<T>(array: (T | undefined)[]): T[] {
  return array.filter((value) => value !== undefined) as T[];
}

/**
 * Performs a case-insensitive search for the given query in the given string.
 * The query is broken down into words and the search is performed on each word.
 */
export function searchMatches(query: string, test: string): boolean {
  const words = query.toLowerCase().split(" ");
  return words.every((word) => test.toLowerCase().includes(word));
}
