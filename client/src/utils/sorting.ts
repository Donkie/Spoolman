import { CrudSort } from "@refinedev/core";
import { SortOrder } from "antd/es/table/interface";
import { CustomFieldName } from "./queryFields";

interface TypedCrudSort<Obj> {
  field: keyof Obj | CustomFieldName;
  order: "asc" | "desc";
}

/**
 * Returns the sort order for a given field based on the provided sorters.
 * @param sorters An array of `CrudSort` objects that define the sorting criteria.
 * @param field The field to get the sort order for.
 * @returns The sort order for the given field, or undefined if the field is not being sorted.
 */
// Checked signature: constrains `field` to the object's own keys or a custom
// (`extra.*`) field, restoring compile-time field-name checking for callers that
// pass a well-typed field.
export function getSortOrderForField<Obj>(
  sorters: TypedCrudSort<Obj>[],
  field: keyof Obj | CustomFieldName,
): SortOrder | undefined;
// Escape hatch for infrastructure that inherently works in string-space (e.g. the
// generic Column component, whose `id`/`dataId` props are `string | string[]`).
export function getSortOrderForField<Obj>(sorters: TypedCrudSort<Obj>[], field: string): SortOrder | undefined;
export function getSortOrderForField<Obj>(
  sorters: TypedCrudSort<Obj>[],
  field: keyof Obj | string,
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
