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
