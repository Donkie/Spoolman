import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "antd";
import { ColumnFilterItem } from "antd/es/table/interface";
import { IFilament } from "../pages/filaments/model";
import { IVendor } from "../pages/vendors/model";
import { getAPIURL, getBasePath } from "../utils/url";

// Build shared table-filter options here so selection dialogs can reuse labels and tooltip metadata.
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
      // Concatenate vendor name and filament name.
      const names = data
        // Remove empty names before building filter entries.
        .filter((filament) => {
          return filament.name !== null && filament.name !== undefined && filament.name !== "";
        })
        // Transform each filament into the table filter shape.
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
            // Keep a plain string sort key because the rendered label itself is wrapped in JSX.
            sortId: name,
          };
        })
        // Remove duplicates so each filament only appears once in the filter dropdown.
        .filter((item, index, self) => self.findIndex((t) => t.value === item.value) === index)
        // Sort by the plain string key instead of the JSX label.
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

export function useSpoolmanVendorExternalIds(enabled: boolean = false) {
  return useQuery<IVendor[], unknown, string[]>({
    enabled: enabled,
    queryKey: ["vendorExternalIds"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/vendor");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    select: (data) => {
      const externalIds = data
        .map((vendor) => vendor.external_id)
        .filter(
          (externalId): externalId is string => externalId !== null && externalId !== undefined && externalId !== "",
        )
        .sort();
      return [...new Set(externalIds)];
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

interface VendorLogoManifest {
  web_files?: string[];
  print_files?: string[];
}

// Missing bundled/runtime logo packs should degrade to empty suggestions instead of breaking vendor forms.
export function useVendorLogoManifest(enabled: boolean = true) {
  return useQuery<VendorLogoManifest>({
    enabled,
    queryKey: ["vendor-logo-manifest"],
    queryFn: async () => {
      const response = await fetch(`${getBasePath()}/vendor-logos/manifest.json`, { cache: "no-store" });
      if (!response.ok) {
        return { web_files: [], print_files: [] };
      }
      return response.json();
    },
  });
}
