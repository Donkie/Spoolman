import { GetListResponse } from "@refinedev/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useGetSetting } from "../../utils/querySettings";
import { getAPIURL } from "../../utils/url";
import { ISpool } from "../spools/model";

export const EMPTYLOC = "";

interface LocationRename {
  old: string;
  new: string;
}

export function useRenameSpoolLocation() {
  const queryClient = useQueryClient();
  const queryKey = ["default", "spool"];
  const queryKeyList = ["default", "spool", "list"];

  return useMutation<string, unknown, LocationRename, undefined>({
    mutationFn: async (value) => {
      const response = await fetch(getAPIURL() + "/location/" + value.old, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: value.new,
        }),
      });
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return await response.text();
    },
    onMutate: async (value) => {
      await queryClient.cancelQueries(queryKeyList);

      // Optimistically update all spools with matching location to the new one
      queryClient.setQueriesData<GetListResponse<ISpool>>({ queryKey: queryKeyList }, (old) => {
        if (old) {
          return {
            data: old.data.map((spool) => {
              if (spool.location === value.old) {
                return { ...spool, location: value.new };
              }
              return spool;
            }),
            total: old.total,
          };
        }
        return old;
      });
    },
    onError: (_error, value, _context) => {
      // Mutation failed, reset spools with matching location to the old one
      queryClient.setQueriesData<GetListResponse<ISpool>>({ queryKey: queryKeyList }, (old) => {
        if (old) {
          return {
            data: old.data.map((spool) => {
              if (spool.location === value.new) {
                return { ...spool, location: value.old };
              }
              return spool;
            }),
            total: old.total,
          };
        }
        return old;
      });
    },
    onSuccess: (_data, _value) => {
      // Mutation succeeded, refetch
      queryClient.invalidateQueries(queryKey);
    },
  });
}

export function useLocations(): string[] | null {
  const query = useGetSetting("locations");

  return useMemo(() => {
    if (!query.data) return null;

    try {
      let data = (JSON.parse(query.data.value) ?? []) as string[];
      data = data.filter((location) => location != null && location.length > 0);
      return data;
    } catch {
      console.warn("Failed to parse locations", query.data.value);
      return null;
    }
  }, [query.data]);
}

export function useLocationsSpoolOrders(): Record<string, number[]> {
  const query = useGetSetting("locations_spoolorders");

  return useMemo(() => {
    if (!query.data) return {};

    try {
      return (JSON.parse(query.data.value) ?? {}) as Record<string, number[]>;
    } catch {
      console.warn("Failed to parse locations spool orders", query.data.value);
      return {};
    }
  }, [query.data]);
}
