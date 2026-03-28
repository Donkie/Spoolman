import { CrudFilter, CrudSort } from "@refinedev/core";
import { useEffect, useState } from "react";
import { isLocalStorageAvailable } from "./support";
interface Pagination {
  currentPage: number;
  pageSize: number;
}

function parseSavedJSON<T>(label: string, value: string | null, fallback: T, onError?: () => void): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    console.warn(`Ignoring malformed saved state for ${label}`);
    onError?.();
    return fallback;
  }
}

export interface TableState {
  sorters: CrudSort[];
  filters: CrudFilter[];
  pagination: Pagination;
  showColumns?: string[];
}

export function useInitialTableState(tableId: string): TableState {
  const [initialState] = useState(() => {
    const hasHashSorters = hasHashProperty("sorters");
    const hasHashFilters = hasHashProperty("filters");
    const hasHashPagination = hasHashProperty("pagination");

    const savedSorters = hasHashSorters
      ? getHashProperty("sorters")
      : isLocalStorageAvailable
        ? localStorage.getItem(`${tableId}-sorters`)
        : null;
    const savedFilters = hasHashFilters
      ? getHashProperty("filters")
      : isLocalStorageAvailable
        ? localStorage.getItem(`${tableId}-filters`)
        : null;
    const savedPagination = hasHashPagination
      ? getHashProperty("pagination")
      : isLocalStorageAvailable
        ? localStorage.getItem(`${tableId}-pagination`)
        : null;
    const savedShowColumns = isLocalStorageAvailable ? localStorage.getItem(`${tableId}-showColumns`) : null;

    const sorters = parseSavedJSON<CrudSort[]>(
      hasHashSorters ? "hash#sorters" : `${tableId}-sorters`,
      savedSorters,
      [{ field: "id", order: "asc" }],
      hasHashSorters
        ? () => removeURLHash("sorters")
        : isLocalStorageAvailable
          ? () => localStorage.removeItem(`${tableId}-sorters`)
          : undefined,
    );
    const filters = parseSavedJSON<CrudFilter[]>(
      hasHashFilters ? "hash#filters" : `${tableId}-filters`,
      savedFilters,
      [],
      hasHashFilters
        ? () => removeURLHash("filters")
        : isLocalStorageAvailable
          ? () => localStorage.removeItem(`${tableId}-filters`)
          : undefined,
    );
    const pagination = parseSavedJSON<Pagination>(
      hasHashPagination ? "hash#pagination" : `${tableId}-pagination`,
      savedPagination,
      { currentPage: 1, pageSize: 20 },
      hasHashPagination
        ? () => removeURLHash("pagination")
        : isLocalStorageAvailable
          ? () => localStorage.removeItem(`${tableId}-pagination`)
          : undefined,
    );
    const showColumns = parseSavedJSON<string[] | undefined>(
      `${tableId}-showColumns`,
      savedShowColumns,
      undefined,
      isLocalStorageAvailable ? () => localStorage.removeItem(`${tableId}-showColumns`) : undefined,
    );
    return { sorters, filters, pagination, showColumns };
  });
  return initialState;
}

export function useStoreInitialState(tableId: string, state: TableState) {
  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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
  const [state, setState] = useState<T>(() => {
    const storageKey = `savedStates-${id}`;
    const savedState = isLocalStorageAvailable ? localStorage.getItem(storageKey) : null;
    return parseSavedJSON(
      storageKey,
      savedState,
      defaultValue,
      isLocalStorageAvailable ? () => localStorage.removeItem(storageKey) : undefined,
    );
  });

  useEffect(() => {
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
