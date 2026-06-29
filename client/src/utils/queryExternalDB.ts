import { axiosInstance } from "@refinedev/simple-rest";
import { useQuery } from "@tanstack/react-query";
import { getAPIURL } from "./url";

export enum SpoolType {
  PLASTIC = "plastic",
  CARDBOARD = "cardboard",
  METAL = "metal",
}

export enum Finish {
  MATTE = "matte",
  GLOSSY = "glossy",
}

export enum MultiColorDirection {
  COAXIAL = "coaxial",
  LONGITUDINAL = "longitudinal",
}

export enum Pattern {
  MARBLE = "marble",
  SPARKLE = "sparkle",
}

export interface ExternalFilament {
  id: string;
  manufacturer: string;
  name: string;
  material: string;
  density: number;
  weight: number;
  spool_weight?: number;
  spool_type?: SpoolType;
  diameter: number;
  color_hex?: string;
  color_hexes?: string[];
  extruder_temp?: number;
  bed_temp?: number;
  finish?: Finish;
  multi_color_direction?: MultiColorDirection;
  pattern?: Pattern;
  translucent: boolean;
  glow: boolean;
}

export interface ExternalMaterial {
  material: string;
  density: number;
  extruder_temp: number | null;
  bed_temp: number | null;
}

/**
 * Fetches an external filament profile by its profile ID and maps it onto an ExternalFilament.
 *
 * Uses the configured axios instance (the same one used by the data provider) so the request
 * carries the auth/credentials needed when running behind forward-auth.
 *
 * @param profileId The external profile ID to fetch.
 * @returns The mapped ExternalFilament.
 */
export async function fetchExternalProfile(profileId: string): Promise<ExternalFilament> {
  const { data } = await axiosInstance.get(`${getAPIURL()}/external/profile/${profileId}`);

  return {
    id: profileId,
    manufacturer: data.manufacturer,
    name: data.name,
    material: data.material,
    density: data.density,
    diameter: data.diameter,
    weight: data.weight,
    spool_weight: data.spool_weight,
    color_hex: data.color_hex,
    color_hexes: data.color_hexes,
    multi_color_direction: data.multi_color_direction,
    extruder_temp: data.extruder_temp,
    bed_temp: data.bed_temp,
    translucent: false,
    glow: false,
  };
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
