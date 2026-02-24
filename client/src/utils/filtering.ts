import { CrudFilter, CrudOperators } from "@refinedev/core";

interface TypedCrudFilter<Obj> {
  field: keyof Obj;
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
export function getFiltersForField<Obj, Field extends keyof Obj>(
  filters: TypedCrudFilter<Obj>[],
  field: Field,
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

function hasMeaningfulFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return false;
    }
    return value.some((entry) => hasMeaningfulFilterValue(entry));
  }

  return true;
}

/**
 * Returns true when at least one filter has a meaningful value.
 * This ignores empty array/string values that can appear in filter state.
 */
export function hasMeaningfulFilters(filters?: CrudFilter[]): boolean {
  if (!filters || filters.length === 0) {
    return false;
  }

  return filters.some((filter) => {
    if ("operator" in filter && (filter.operator === "or" || filter.operator === "and")) {
      // Refine nests grouped filters, so recurse until we find a real leaf value
      // instead of treating the wrapper object itself as "active".
      return hasMeaningfulFilters(filter.value);
    }

    if ("value" in filter) {
      return hasMeaningfulFilterValue(filter.value);
    }

    return false;
  });
}
