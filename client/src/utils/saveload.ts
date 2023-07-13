import React from "react";
import { CrudFilter, CrudSort } from "@refinedev/core";
import { isLocalStorageAvailable } from "./support";

interface Pagination {
    current: number;
    pageSize: number;
}

export interface TableState {
    sorters: CrudSort[];
    filters: CrudFilter[];
    pagination: Pagination;
    showColumns?: string[];
}

export function useInitialTableState(tableId: string): TableState {
    const [initialState] = React.useState(() => {
        const savedSorters = isLocalStorageAvailable ? localStorage.getItem(`${tableId}-sorters`) : null;
        const savedFilters = isLocalStorageAvailable ? localStorage.getItem(`${tableId}-filters`) : null;
        const savedPagination = isLocalStorageAvailable ? localStorage.getItem(`${tableId}-pagination`) : null;
        const savedShowColumns = isLocalStorageAvailable ? localStorage.getItem(`${tableId}-showColumns`) : null;

        const sorters = savedSorters ? JSON.parse(savedSorters) : [{ field: "id", order: "asc" }];
        const filters = savedFilters ? JSON.parse(savedFilters) : [];
        const pagination = savedPagination ? JSON.parse(savedPagination) : { page: 1, pageSize: 20 };
        const showColumns = savedShowColumns ? JSON.parse(savedShowColumns) : undefined;
        return { sorters, filters, pagination, showColumns };
    });
    return initialState;
}

export function useStoreInitialState(tableId: string, state: TableState) {
    React.useEffect(() => {
        if (isLocalStorageAvailable) {
            localStorage.setItem(`${tableId}-sorters`, JSON.stringify(state.sorters));
        }
    }, [tableId, state.sorters]);

    React.useEffect(() => {
        if (isLocalStorageAvailable) {
            localStorage.setItem(`${tableId}-filters`, JSON.stringify(state.filters));
        }
    }, [tableId, state.filters]);

    React.useEffect(() => {
        if (isLocalStorageAvailable) {
            localStorage.setItem(`${tableId}-pagination`, JSON.stringify(state.pagination));
        }
    }, [tableId, state.pagination]);

    React.useEffect(() => {
        if (isLocalStorageAvailable) {
            if (state.showColumns === undefined) {
                localStorage.removeItem(`${tableId}-showColumns`);
            } else {
                localStorage.setItem(`${tableId}-showColumns`, JSON.stringify(state.showColumns));
            }
        }
    }, [tableId, state.showColumns]);
}
