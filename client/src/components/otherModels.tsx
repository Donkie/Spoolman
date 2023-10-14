import { useQuery } from "@tanstack/react-query";
import { IFilament } from "../pages/filaments/model";
import { IVendor } from "../pages/vendors/model";
import { ColumnFilterItem } from "antd/es/table/interface";

export function useSpoolmanFilamentFilter(enabled: boolean = false) {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<IFilament[], unknown, ColumnFilterItem[]>({
    enabled: enabled,
    queryKey: ["filaments"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/filament");
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
          let name = "";
          if (filament.vendor?.name) {
            name = `${filament.vendor.name} - ${filament.name ?? "<unknown>"}`;
          } else {
            name = `${filament.name ?? "<unknown>"}`;
          }
          return {
            text: name,
            value: filament.id,
          };
        })
        // Remove duplicates
        .filter((item, index, self) => self.findIndex((t) => t.value === item.value) === index)
        // Sort by name
        .sort((a, b) => a.text.localeCompare(b.text));
      return names;
    },
  });
}

export function useSpoolmanFilamentNames(enabled: boolean = false) {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<IFilament[], unknown, string[]>({
    enabled: enabled,
    queryKey: ["filaments"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/filament");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      // Concatenate vendor name and filament name
      let names = data
        .filter((filament) => {
          return filament.name !== null && filament.name !== undefined && filament.name !== "";
        })
        .map((filament) => {
          return filament.name ?? "<unknown>";
        })
        .sort();
      // Remove duplicates
      names = [...new Set(names)];
      return names;
    },
  });
}

export function useSpoolmanVendors(enabled: boolean = false) {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<IVendor[], unknown, string[]>({
    enabled: enabled,
    queryKey: ["vendors"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/vendor");
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
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["materials"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/material");
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
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["articleNumbers"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/article-number");
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
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["lotNumbers"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/lot-number");
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
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<string[]>({
    enabled: enabled,
    queryKey: ["locations"],
    queryFn: async () => {
      const response = await fetch(apiEndpoint + "/location");
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
