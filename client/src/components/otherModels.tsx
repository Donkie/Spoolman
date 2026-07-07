import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "antd";
import { ColumnFilterItem } from "antd/es/table/interface";
import { IFilament } from "../pages/filaments/model";
import { IVendor } from "../pages/vendors/model";
import { getAPIURL } from "../utils/url";

/**
 * Factory function to create a reusable query hook for fetching and sorting string arrays from API endpoints.
 * @param queryKey - Unique cache key for react-query
 * @param endpoint - API endpoint to fetch from
 * @param enabled - Whether the query should be enabled
 */
function useSimpleSortedArrayQuery<T>(queryKey: string[], endpoint: string, enabled: boolean = false) {
  return useQuery<T[], unknown, T[]>({
    enabled,
    queryKey,
    queryFn: async () => {
      const response = await fetch(getAPIURL() + endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch from ${endpoint}: ${response.statusText}`);
      }
      return response.json();
    },
    select: (data) => {
      if (Array.isArray(data)) {
        return [...data].sort();
      }
      return [];
    },
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
          let name = "";
          if (filament.vendor?.name) {
            name = `${filament.vendor.name} - ${filament.name ?? "<unknown>"}`;
          } else {
            name = `${filament.name ?? "<unknown>"}`;
          }

          const tooltipParts: React.ReactNode[] = [];
          if (filament.color_hex) {
            tooltipParts.push(
              <div
                key="color"
                style={{
                  borderRadius: ".4em",
                  width: "1.4em",
                  height: "1.4em",
                  backgroundColor: "#" + filament.color_hex,
                }}
              ></div>,
            );
          }
          if (filament.material) {
            tooltipParts.push(<div key="material">{filament.material}</div>);
          }
          if (filament.weight) {
            tooltipParts.push(<div key="weight">{filament.weight}g</div>);
          }

          return {
            text: (
              <Tooltip
                title={
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      gap: ".5em",
                      alignContent: "center",
                    }}
                  >
                    {tooltipParts}
                  </div>
                }
              >
                {name}
              </Tooltip>
            ),
            value: filament.id,
            sortId: name,
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
  return useQuery<IFilament[], unknown, string[]>({
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
  return useSimpleSortedArrayQuery<string>(["materials"], "/material", enabled);
}

export function useSpoolmanArticleNumbers(enabled: boolean = false) {
  return useSimpleSortedArrayQuery<string>(["articleNumbers"], "/article-number", enabled);
}

export function useSpoolmanLotNumbers(enabled: boolean = false) {
  return useSimpleSortedArrayQuery<string>(["lotNumbers"], "/lot-number", enabled);
}

export function useSpoolmanLocations(enabled: boolean = false) {
  return useSimpleSortedArrayQuery<string>(["locations"], "/location", enabled);
}
