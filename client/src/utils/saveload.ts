import { CrudFilter, CrudSort } from "@refinedev/core";
import { useEffect, useState } from "react";
import { isLocalStorageAvailable } from "./support";
interface Pagination {
  currentPage: number;
  pageSize: number;
}

const DEFAULT_SORTERS: CrudSort[] = [{ field: "id", order: "asc" }];
const DEFAULT_FILTERS: CrudFilter[] = [];
const DEFAULT_PAGINATION: Pagination = { currentPage: 1, pageSize: 20 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesDefaultValueShape<T>(value: unknown, defaultValue: T): value is T {
  if (defaultValue === undefined || defaultValue === null) {
    return value === defaultValue;
  }

  if (Array.isArray(defaultValue)) {
    return Array.isArray(value);
  }

  if (typeof defaultValue === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }

  if (typeof defaultValue === "object") {
    return isRecord(value);
  }

  return typeof value === typeof defaultValue;
}

function parseSavedJSON<T>(
  label: string,
  value: string | null,
  fallback: T,
  isValid: (parsed: unknown) => parsed is T,
  onError?: () => void,
): T {
  if (!value || value === "undefined") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (isValid(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore parse failures below so malformed persisted values are handled the same way
    // as wrong-shape values.
  }

  console.warn(`Ignoring malformed saved state for ${label}`);
  onError?.();
  return fallback;
}

function isSavedSorter(value: unknown): value is CrudSort {
  return isRecord(value) && typeof value.field === "string" && (value.order === "asc" || value.order === "desc");
}

function isSavedSorters(value: unknown): value is CrudSort[] {
  return Array.isArray(value) && value.every(isSavedSorter);
}

function isSavedFilter(value: unknown): value is CrudFilter {
  return isRecord(value) && typeof value.field === "string" && typeof value.operator === "string" && "value" in value;
}

function isSavedFilters(value: unknown): value is CrudFilter[] {
  return Array.isArray(value) && value.every(isSavedFilter);
}

function isSavedShowColumns(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((column) => typeof column === "string");
}

function isSavedPagination(value: unknown): value is Partial<Pagination> & { current?: number } {
  return (
    isRecord(value) &&
    (value.currentPage === undefined ||
      (typeof value.currentPage === "number" && Number.isFinite(value.currentPage))) &&
    (value.current === undefined || (typeof value.current === "number" && Number.isFinite(value.current))) &&
    (value.pageSize === undefined || (typeof value.pageSize === "number" && Number.isFinite(value.pageSize)))
  );
}

function parseSavedPagination(label: string, value: string | null, onError?: () => void): Pagination {
  const parsed = parseSavedJSON<Partial<Pagination> & { current?: number }>(
    label,
    value,
    DEFAULT_PAGINATION,
    isSavedPagination,
    onError,
  );

  // Older persisted state used `current`; normalize it so lists keep loading even when
  // localStorage or URL hash values were saved by an older UI shape.
  return {
    currentPage: parsed.currentPage ?? parsed.current ?? DEFAULT_PAGINATION.currentPage,
    pageSize: parsed.pageSize ?? DEFAULT_PAGINATION.pageSize,
  };
}

function hasSavedFilterValue(filter: CrudFilter): boolean {
  if (!("value" in filter)) {
    return false;
  }

  const value = filter.value;
  if (Array.isArray(value) || typeof value === "string") {
    return value.length !== 0;
  }

  return value !== undefined && value !== null;
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

    const sorters = parseSavedJSON(
      hasHashSorters ? "hash#sorters" : `${tableId}-sorters`,
      savedSorters,
      DEFAULT_SORTERS,
      isSavedSorters,
      hasHashSorters
        ? () => removeURLHash("sorters")
        : isLocalStorageAvailable
          ? () => localStorage.removeItem(`${tableId}-sorters`)
          : undefined,
    );
    const filters = parseSavedJSON(
      hasHashFilters ? "hash#filters" : `${tableId}-filters`,
      savedFilters,
      DEFAULT_FILTERS,
      isSavedFilters,
      hasHashFilters
        ? () => removeURLHash("filters")
        : isLocalStorageAvailable
          ? () => localStorage.removeItem(`${tableId}-filters`)
          : undefined,
    );
    const pagination = parseSavedPagination(
      hasHashPagination ? "hash#pagination" : `${tableId}-pagination`,
      savedPagination,
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
      (value): value is string[] | undefined => value === undefined || isSavedShowColumns(value),
      isLocalStorageAvailable ? () => localStorage.removeItem(`${tableId}-showColumns`) : undefined,
    );

    // Guard every persisted table-state read so stale localStorage or hand-edited hash values
    // cannot throw during initial render and blank the list page.
    return { sorters, filters, pagination, showColumns };
  });
  return initialState;
}

export function useStoreInitialState(tableId: string, state: TableState) {
  useEffect(() => {
    if (state.sorters.length > 0 && JSON.stringify(state.sorters) != JSON.stringify(DEFAULT_SORTERS)) {
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
    const filters = state.filters.filter(hasSavedFilterValue);
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
    if (JSON.stringify(state.pagination) != JSON.stringify(DEFAULT_PAGINATION)) {
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

export function useSavedState<T>(id: string, defaultValue: T, isValidState?: (value: unknown) => value is T) {
  const [state, setState] = useState<T>(() => {
    const storageKey = `savedStates-${id}`;
    const savedState = isLocalStorageAvailable ? localStorage.getItem(storageKey) : null;
    return parseSavedJSON(
      storageKey,
      savedState,
      defaultValue,
      isValidState ?? ((value): value is T => matchesDefaultValueShape(value, defaultValue)),
      isLocalStorageAvailable ? () => localStorage.removeItem(storageKey) : undefined,
    );
  });

  useEffect(() => {
    if (isLocalStorageAvailable) {
      const storageKey = `savedStates-${id}`;
      const serializedState = JSON.stringify(state);
      if (serializedState === undefined) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, serializedState);
      }
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
