import { CrudFilter, CrudSort } from "@refinedev/core";
import { ColumnFilterItem, SortOrder } from "antd/es/table/interface";

interface IObj {
    [key: string]: unknown;
}

/**
 * Returns a sorting function that can be used to sort an array of objects based on the provided sorters.
 * @param sorters An array of `CrudSort` objects that define the sorting criteria.
 * @returns A sorting function that can be used to sort an array of objects based on the provided sorters.
 */
export function genericSorter(sorters: CrudSort[]) {
    return (a: IObj, b: IObj) => {
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
export function getSortOrderForField(sorters: CrudSort[], field: string): SortOrder | undefined {
    const sorter = sorters.find((s) => s.field === field);
    if (sorter) {
        return sorter.order === "asc" ? "ascend" : "descend";
    }
    return undefined;
}

/**
 * Returns a filtering function that can be used to filter an array of objects based on the provided filters.
 * @param filters An array of `CrudFilter` objects that define the filtering criteria.
 * @returns A function that returns a boolean value based on whether the provided object matches the filtering criteria.
 */
export function genericFilterer(filters: CrudFilter[]) {
    return (record: IObj) => {
        for (const filter of filters) {
            if (!("field" in filter)) {
                console.error("Filter must be of type LogicalFilter");
                return false;
            }
            if (!Array.isArray(filter.value)) {
                console.error("Filter value must be an array of strings.");
                return false;
            }
            let value = record[filter.field];
            if (value === undefined || value === null) {
                value = "";
            }
            if (typeof value !== "string") {
                console.error("Only string fields can be filtered, field is of type " + typeof value);
                return false;
            }
            switch (filter.operator) {
                case "in":
                    if (!filter.value.includes(value)) {
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
export function filterPopulator(dataSource: IObj[], field: string): ColumnFilterItem[] {
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
