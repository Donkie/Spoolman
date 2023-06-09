import { CrudSort } from "@refinedev/core";
import { SortOrder } from "antd/es/table/interface";


interface TypedCrudSort<Obj> {
    field: keyof Obj;
    order: "asc" | "desc";
}

/**
 * Returns a sorting function that can be used to sort an array of objects based on the provided sorters.
 * @param sorters An array of `CrudSort` objects that define the sorting criteria.
 * @returns A sorting function that can be used to sort an array of objects based on the provided sorters.
 */
export function genericSorter<Obj>(sorters: TypedCrudSort<Obj>[]) {
    return (a: Obj, b: Obj) => {
        for (const sorter of sorters) {
            const aValue = a[sorter.field];
            const bValue = b[sorter.field];
            if (aValue === bValue) {
                continue;
            }
            // Send empty fields to the bottom
            if (aValue === undefined || aValue === null) {
                return 1;
            }
            if (bValue === undefined || bValue === null) {
                return -1;
            }
            // Perform sorting based on type of the fields
            if (typeof aValue === "string" && typeof bValue === "string") {
                // Try to sort them as dates if possible
                const aDate = new Date(aValue);
                const bDate = new Date(bValue);
                if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
                    return sorter.order === "asc"
                        ? aDate.getTime() - bDate.getTime()
                        : bDate.getTime() - aDate.getTime();
                }

                return sorter.order === "asc"
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }
            if (typeof aValue === "number" && typeof bValue === "number") {
                return sorter.order === "asc" ? aValue - bValue : bValue - aValue;
            }
            if (typeof aValue === "boolean" && typeof bValue === "boolean") {
                return sorter.order === "asc" ? +aValue - +bValue : +bValue - +aValue;
            }
            if (aValue instanceof Date && bValue instanceof Date) {
                return sorter.order === "asc"
                    ? aValue.getTime() - bValue.getTime()
                    : bValue.getTime() - aValue.getTime();
            }
            if (typeof aValue === "object" && typeof bValue === "object") {
                return sorter.order === "asc"
                    ? JSON.stringify(aValue).localeCompare(JSON.stringify(bValue))
                    : JSON.stringify(bValue).localeCompare(JSON.stringify(aValue));
            }
        }
        return 0;
    };
}

/**
 * Returns the sort order for a given field based on the provided sorters.
 * @param sorters An array of `CrudSort` objects that define the sorting criteria.
 * @param field The field to get the sort order for.
 * @returns The sort order for the given field, or undefined if the field is not being sorted.
 */
export function getSortOrderForField<Obj, Field extends keyof Obj>(sorters: TypedCrudSort<Obj>[], field: Field): SortOrder | undefined {
    const sorter = sorters.find((s) => s.field === field);
    if (sorter) {
        return sorter.order === "asc" ? "ascend" : "descend";
    }
    return undefined;
}

export function typeSorters<Obj>(sorters: CrudSort[]): TypedCrudSort<Obj>[] {
    return sorters as TypedCrudSort<Obj>[]; // <-- Unsafe cast
}
