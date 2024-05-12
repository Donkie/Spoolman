import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAPIURL } from "./url";

interface ExternalFilament {
  id: string;
  manufacturer: string;
  name: string;
  material: string;
  density: number | null;
  weight: number;
  spool_weight: number | null;
  diameter: number;
  color_hex: string;
  extruder_temp: number | null;
  bed_temp: number | null;
}

interface ExternalMaterial {
  material: string;
  density: number;
}

export function useGetExternalDBFilaments() {
  return useQuery<ExternalFilament[]>({
    queryKey: ["external", "filaments"],
    staleTime: 60,
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/external/filament`);
      return response.json();
    },
  });
}

export function useGetExternalDBMaterials() {
  return useQuery<ExternalMaterial[]>({
    queryKey: ["external", "materials"],
    staleTime: 60,
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/external/material`);
      return response.json();
    },
  });
}
