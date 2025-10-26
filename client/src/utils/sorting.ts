import { CrudSort } from "@refinedev/core";
import { SortOrder } from "antd/es/table/interface";
import { getCustomFieldKey, isCustomField } from "./queryFields";

interface TypedCrudSort<Obj> {
  field: keyof Obj | string;
  order: "asc" | "desc";
}

/**
 * Returns the sort order for a given field based on the provided sorters.
 * @param sorters An array of `CrudSort` objects that define the sorting criteria.
 * @param field The field to get the sort order for.
 * @returns The sort order for the given field, or undefined if the field is not being sorted.
 */
export function getSortOrderForField<Obj>(
  sorters: TypedCrudSort<Obj>[],
  field: Field | string,
): SortOrder | undefined {
  const sorter = sorters.find((s) => s.field === field);
  if (sorter) {
    return sorter.order === "asc" ? "ascend" : "descend";
  }
  return undefined;
}

export function typeSorters<Obj>(sorters: CrudSort[]): TypedCrudSort<Obj>[] {
  return sorters as TypedCrudSort<Obj>[]; // <-- Unsafe cast
}

/**
 * Checks if a sorter is for a custom field
 * @param sorter The sorter to check
 * @returns True if the sorter is for a custom field
 */
export function isCustomFieldSorter<Obj = any>(sorter: TypedCrudSort<Obj> | CrudSort): boolean {
  return typeof sorter.field === 'string' && isCustomField(sorter.field);
}

/**
 * Extracts all custom field sorters from a list of sorters
 * @param sorters The list of sorters
 * @returns An object with custom field keys and their sort orders
 */
export function getCustomFieldSorters<Obj = any>(
  sorters: TypedCrudSort<Obj>[] | CrudSort[]
): Record<string, "asc" | "desc"> {
  const customFieldSorters: Record<string, "asc" | "desc"> = {};
  
  sorters.forEach((sorter) => {
    if (isCustomFieldSorter(sorter)) {
      const field = sorter.field.toString();
      const key = getCustomFieldKey(field);
      customFieldSorters[key] = sorter.order;
    }
  });
  
  return customFieldSorters;
}
