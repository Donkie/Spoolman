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
    const savedSorters = hasHashProperty("sorters")
      ? getHashProperty("sorters")
      : isLocalStorageAvailable
        ? localStorage.getItem(`${tableId}-sorters`)
        : null;
    const savedFilters = hasHashProperty("filters")
      ? getHashProperty("filters")
      : isLocalStorageAvailable
        ? localStorage.getItem(`${tableId}-filters`)
        : null;
    const savedPagination = hasHashProperty("pagination")
      ? getHashProperty("pagination")
      : isLocalStorageAvailable
        ? localStorage.getItem(`${tableId}-pagination`)
        : null;
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
    if (state.sorters.length > 0 && JSON.stringify(state.sorters) != JSON.stringify([{ field: "id", order: "asc" }])) {
      if (isLocalStorageAvailable) {
        localStorage.setItem(`${tableId}-sorters`, JSON.stringify(state.sorters));
      }
      setURLHash(`sorters`, JSON.stringify(state.sorters));
    } else {
      localStorage.removeItem(`${tableId}-sorters`);
      removeURLHash("sorters");
    }
  }, [tableId, state.sorters]);

  React.useEffect(() => {
    const filters = state.filters.filter((f) => f.value.length != 0);
    if (filters.length > 0) {
      if (isLocalStorageAvailable) {
        localStorage.setItem(`${tableId}-filters`, JSON.stringify(filters));
        setURLHash("filters", JSON.stringify(filters));
      }
    } else {
      localStorage.removeItem(`${tableId}-filters`);
      removeURLHash(`filters`);
    }
  }, [tableId, state.filters]);

  React.useEffect(() => {
    if (JSON.stringify(state.pagination) != JSON.stringify({ current: 1, pageSize: 20 })) {
      if (isLocalStorageAvailable) {
        localStorage.setItem(`${tableId}-pagination`, JSON.stringify(state.pagination));
      }
      setURLHash(`pagination`, JSON.stringify(state.pagination));
    } else {
      localStorage.removeItem(`${tableId}-pagination`);
      removeURLHash(`pagination`);
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

export function useSavedState<T>(id: string, defaultValue: T) {
  const [state, setState] = React.useState<T>(() => {
    const savedState = isLocalStorageAvailable ? localStorage.getItem(`savedStates-${id}`) : null;
    return savedState ? JSON.parse(savedState) : defaultValue;
  });

  React.useEffect(() => {
    if (isLocalStorageAvailable) {
      localStorage.setItem(`savedStates-${id}`, JSON.stringify(state));
    }
  }, [id, state]);

  return [state, setState] as const;
}

function setURLHash(Id: string, value: string) {
  const params = new URLSearchParams(window.location.hash.substring(1));
  if (!params.has(Id)) {
    params.append(Id, value);
  }
  params.set(Id, value);
  window.location.hash = params.toString();
}
function removeURLHash(Id: string) {
  const params = new URLSearchParams(window.location.hash.substring(1));
  if (params.has(Id)) {
    params.delete(Id);
  }
  window.location.hash = params.toString();
}

function getHashProperty(Id: string) {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  return hash.get(Id);
}

function hasHashProperty(property: string): boolean {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  return hash.has(property);
}
