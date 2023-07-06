import { CrudFilter, CrudOperators } from "@refinedev/core";
import { ColumnFilterItem } from "antd/es/table/interface";

interface TypedCrudFilter<Obj> {
    field: keyof Obj;
    operator: Exclude<CrudOperators, "or" | "and">;
    value: string[];
}

export function typeFilters<Obj>(filters: CrudFilter[]): TypedCrudFilter<Obj>[] {
    return filters as TypedCrudFilter<Obj>[]; // <-- Unsafe cast
}

/**
 * Returns a filtering function that can be used to filter an array of objects based on the provided filters.
 * @param filters An array of `CrudFilter` objects that define the filtering criteria.
 * @returns A function that returns a boolean value based on whether the provided object matches the filtering criteria.
 */
export function genericFilterer<Obj>(filters: TypedCrudFilter<Obj>[]) {
    return (record: Obj) => {
        for (const filter of filters) {
            if (!("field" in filter)) {
                console.error("Filter must be of type LogicalFilter");
                return false;
            }
            if (!Array.isArray(filter.value)) {
                console.error("Filter value must be an array of strings.");
                return false;
            }
            if (!filter.value.length) {
                continue;
            }
            const value = record[filter.field];
            let strValue: string;
            if (value === undefined || value === null) {
                strValue = "";
            } else {
                if (typeof value !== "string") {
                    console.error("Only string fields can be filtered, field is of type " + typeof value);
                    return false;
                } else {
                    strValue = value;
                }
            }

            switch (filter.operator) {
                case "in":
                    if (!filter.value.includes(strValue)) {
                        return false;
                    }
                    break;
                default:
                    console.error(`Not implemented operator: ${filter.operator}`);
                    return false;
            }
        }
        return true;
    }
}

/**
 * Populates an array of `ColumnFilterItem` objects based on the unique values of a given field in an array of objects.
 * @param dataSource An array of objects to filter.
 * @param field The name of the field to filter on.
 * @returns An array of `ColumnFilterItem` objects representing the unique values of the specified field in the input array.
 */
export function useListFiltersForField<Obj, Field extends keyof Obj>(
    dataSource: Obj[],
    field: Field): ColumnFilterItem[] {
    const filters: ColumnFilterItem[] = [];
    dataSource.forEach((element) => {
        const value = element[field];
        if (typeof value === "string" && value !== "") {
            // Make sure it's not already in the filters
            if (filters.find((f) => f.value === value)) {
                return;
            }
            filters.push({
                text: value,
                value: value,
            });
        }
    });
    // Sort the filters
    filters.sort((a, b) => {
        if (typeof a.text !== "string" || typeof b.text !== "string") {
            return 0;
        }
        return a.text.localeCompare(b.text);
    });
    filters.push({
        text: "<empty>",
        value: "",
    });
    return filters;
}

/**
 * Returns an array of filter values for a given field based on the provided filters.
 * @param filters An array of `CrudFilter` objects that define the filtering criteria.
 * @param field The field to get the filter values for.
 * @returns An array of filter values for the given field.
 */
export function getFiltersForField<Obj, Field extends keyof Obj>(filters: TypedCrudFilter<Obj>[], field: Field): string[] {
    const filterValues: string[] = [];
    filters.forEach((filter) => {
        if (filter.field === field) {
            filterValues.push(...filter.value as string[]);
        }
    });
    return filterValues;
}
