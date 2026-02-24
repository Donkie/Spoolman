import { useQuery } from "@tanstack/react-query";
import { ColumnFilterItem } from "antd/es/table/interface";
import { IFilament } from "../pages/filaments/model";
import { IVendor } from "../pages/vendors/model";
import { getAPIURL } from "../utils/url";

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
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["filamentNames"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/filament-name");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      return data.sort();
    },
  });
}

export function useSpoolmanVendors(enabled: boolean = false) {
  return useQuery<IVendor[], unknown, string[]>({
    enabled: enabled,
    queryKey: ["vendors"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/vendor");
      if (!response.ok) {
        throw new Error("Network response was not ok");
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
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["materials"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/material");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      return data.sort();
    },
  });
}

export function useSpoolmanArticleNumbers(enabled: boolean = false) {
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["articleNumbers"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/article-number");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      return data.sort();
    },
  });
}

export function useSpoolmanLotNumbers(enabled: boolean = false) {
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["lotNumbers"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/lot-number");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      return data.sort();
    },
  });
}

export function useSpoolmanLocations(enabled: boolean = false) {
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["locations"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/location");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      return data.sort();
    },
  });
}
