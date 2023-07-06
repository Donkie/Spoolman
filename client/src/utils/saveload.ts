import React from "react";
import { CrudFilter, CrudSort } from "@refinedev/core";

interface TableState {
    sorters: CrudSort[];
    filters: CrudFilter[];
}

export function useInitialTableState(tableId: string): TableState {
    const [initialState] = React.useState(() => {
        const savedSorters = localStorage.getItem(`${tableId}-sorters`);
        const savedFilters = localStorage.getItem(`${tableId}-filters`);
        const sorters = savedSorters ? JSON.parse(savedSorters) : [{ field: "id", order: "asc" }];
        const filters = savedFilters ? JSON.parse(savedFilters) : [];
        return { sorters, filters };
    });
    return initialState;
}

export function useStoreInitialState(tableId: string, state: TableState) {
    React.useEffect(() => {
        localStorage.setItem(`${tableId}-sorters`, JSON.stringify(state.sorters));
    }, [tableId, state.sorters]);

    React.useEffect(() => {
        localStorage.setItem(`${tableId}-filters`, JSON.stringify(state.filters));
    }, [tableId, state.filters]);
}
