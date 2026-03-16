import { useQueries } from "@tanstack/react-query";
import { ExternalFilament } from "../../utils/queryExternalDB";
import { getAPIURL } from "../../utils/url";
import { getOrCreateVendorFromExternal } from "../vendors/functions";
import { IFilament } from "./model";

// Mirror an external catalog filament into the local API while preserving the source color representation.
export async function createFilamentFromExternal(externalFilament: ExternalFilament): Promise<IFilament> {
  const vendor = await getOrCreateVendorFromExternal(externalFilament.manufacturer);

  let color_hex: string | undefined = undefined;
  let multi_color_hexes: string | undefined = undefined;
  let multi_color_direction: string | undefined = undefined;
  // External catalogs send either a single swatch or a multi-color list; keep the API payload mutually exclusive.
  if (externalFilament.color_hex) {
    color_hex = externalFilament.color_hex;
  } else if (externalFilament.color_hexes && externalFilament.color_hexes.length > 0) {
    multi_color_hexes = externalFilament.color_hexes.join(",");
    multi_color_direction = externalFilament.multi_color_direction;
  }

  const body: Omit<IFilament, "id" | "registered" | "extra"> & { vendor_id: number } = {
    name: externalFilament.name,
    material: externalFilament.material,
    vendor_id: vendor.id,
    density: externalFilament.density,
    diameter: externalFilament.diameter,
    weight: externalFilament.weight,
    spool_weight: externalFilament.spool_weight || undefined,
    color_hex: color_hex,
    multi_color_hexes: multi_color_hexes,
    multi_color_direction: multi_color_direction,
    settings_extruder_temp: externalFilament.extruder_temp || undefined,
    settings_bed_temp: externalFilament.bed_temp || undefined,
    external_id: externalFilament.id,
  };

  const response = await fetch(getAPIURL() + "/filament", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}

// Fetch selected filaments in parallel so print/export dialogs can render labels as soon as each item resolves.
export function useGetFilamentsByIds(ids: number[]) {
  return useQueries({
    queries: ids.map((id) => {
      return {
        queryKey: ["filament", id],
        queryFn: async () => {
          const res = await fetch(getAPIURL() + "/filament/" + id);
          return (await res.json()) as IFilament;
        },
      };
    }),
  });
}
