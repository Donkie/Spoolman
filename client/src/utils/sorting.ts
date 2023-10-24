import { CrudSort } from "@refinedev/core";
import { SortOrder } from "antd/es/table/interface";

interface TypedCrudSort<Obj> {
  field: keyof Obj;
  order: "asc" | "desc";
}

/**
 * Returns the sort order for a given field based on the provided sorters.
 * @param sorters An array of `CrudSort` objects that define the sorting criteria.
 * @param field The field to get the sort order for.
 * @returns The sort order for the given field, or undefined if the field is not being sorted.
 */
export function getSortOrderForField<Obj, Field extends keyof Obj>(
  sorters: TypedCrudSort<Obj>[],
  field: Field
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
