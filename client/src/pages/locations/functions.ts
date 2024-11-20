import { useMemo } from "react";
import { useGetSetting } from "../../utils/querySettings";
import { getAPIURL } from "../../utils/url";
import { ISpool } from "../spools/model";

export async function setSpoolLocation(spool_id: number, location: string | null): Promise<ISpool> {
  const response = await fetch(getAPIURL() + "/spool/" + spool_id, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location: location,
    }),
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}

export async function renameSpoolLocation(location: string, newName: string): Promise<string> {
  const response = await fetch(getAPIURL() + "/location/" + location, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: newName,
    }),
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return await response.text();
}

export function useLocations(): string[] {
  const query = useGetSetting("locations");

  return useMemo(() => {
    if (!query.data) return [];

    try {
      return JSON.parse(query.data.value) as string[];
    } catch {
      console.warn("Failed to parse locations", query.data.value);
      return [];
    }
  }, [query.data]);
}

export function useLocationsSpoolOrders(): Record<string, number[]> {
  const query = useGetSetting("locations_spoolorders");

  return useMemo(() => {
    if (!query.data) return {};

    try {
      return JSON.parse(query.data.value) as Record<string, number[]>;
    } catch {
      console.warn("Failed to parse locations spool orders", query.data.value);
      return {};
    }
  }, [query.data]);
}
