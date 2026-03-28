import { useQuery } from "@tanstack/react-query";
import { ColumnFilterItem } from "antd/es/table/interface";
import { IFilament } from "../pages/filaments/model";
import { IVendor } from "../pages/vendors/model";
import { getAPIURL } from "../utils/url";

function useSimpleSortedArrayQuery(queryKey: string[], endpoint: string, enabled: boolean = false) {
  return useQuery<string[]>({
    enabled,
    queryKey,
    queryFn: async () => {
      const response = await fetch(getAPIURL() + endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch from ${endpoint}: ${response.statusText}`);
      }
      return response.json();
    },
    select: (data) => [...data].sort(),
  });
}

export function useSpoolmanFilamentFilter(enabled: boolean = false) {
  return useQuery<IFilament[], unknown, ColumnFilterItem[]>({
    enabled: enabled,
    queryKey: ["filaments"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/filament");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      // Concatenate vendor name and filament name
      const names = data
        // Remove empty names
        .filter((filament) => {
          return filament.name !== null && filament.name !== undefined && filament.name !== "";
        })
        // Transform to ColumnFilterItem
        .map((filament) => {
          const name = filament.vendor?.name
            ? `${filament.vendor.name} - ${filament.name ?? "<unknown>"}`
            : `${filament.name ?? "<unknown>"}`;

          const searchTerms = [
            name,
            filament.material ?? "",
            filament.color_hex ? `#${filament.color_hex}` : "",
            filament.weight ? `${filament.weight}g` : "",
          ]
            .filter((term) => term !== "")
            .join(" ");

          return {
            text: name,
            value: filament.id,
            sortId: searchTerms,
          };
        })
        // Remove duplicates
        .filter((item, index, self) => self.findIndex((t) => t.value === item.value) === index)
        // Sort by name
        .sort((a, b) => a.sortId.localeCompare(b.sortId));
      return names;
    },
  });
}

export function useSpoolmanFilamentNames(enabled: boolean = false) {
  return useSimpleSortedArrayQuery(["filamentNames"], "/filament-name", enabled);
}

export function useSpoolmanVendors(enabled: boolean = false) {
  return useQuery<IVendor[], unknown, string[]>({
    enabled: enabled,
    queryKey: ["vendors"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/vendor");
      if (!response.ok) {
        throw new Error(`Failed to fetch vendors: ${response.statusText}`);
      }
      return response.json();
    },
    select: (data) => {
      return data
        .map((vendor) => {
          return vendor.name ?? `ID ${vendor.id}`;
        })
        .sort();
    },
  });
}

export function useSpoolmanMaterials(enabled: boolean = false) {
  return useSimpleSortedArrayQuery(["materials"], "/material", enabled);
}

export function useSpoolmanArticleNumbers(enabled: boolean = false) {
  return useSimpleSortedArrayQuery(["articleNumbers"], "/article-number", enabled);
}

export function useSpoolmanLotNumbers(enabled: boolean = false) {
  return useSimpleSortedArrayQuery(["lotNumbers"], "/lot-number", enabled);
}

export function useSpoolmanLocations(enabled: boolean = false) {
  return useSimpleSortedArrayQuery(["locations"], "/location", enabled);
}
