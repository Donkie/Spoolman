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
  field: Field
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
