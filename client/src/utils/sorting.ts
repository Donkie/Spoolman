import { CrudSort } from "@refinedev/core";

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
