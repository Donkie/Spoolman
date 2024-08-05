import { useSelect, useTranslate } from "@refinedev/core";
import { formatLength, formatWeight } from "../../utils/parsing";
import { getAPIURL } from "../../utils/url";
import { ISpool } from "./model";
import { IFilament } from "../filaments/model";
import { SpoolType, useGetExternalDBFilaments } from "../../utils/queryExternalDB";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

export async function setSpoolArchived(spool: ISpool, archived: boolean) {
  const init: RequestInit = {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      archived: archived,
    }),
  };
  const request = new Request(getAPIURL() + "/spool/" + spool.id);
  await fetch(request, init);
}

/**
 * Returns an array of queries using the useQueries hook from @tanstack/react-query.
 * Each query fetches a spool by its ID from the server.
 *
 * @param {number[]} ids - An array of spool IDs to fetch.
 * @return An array of query results, each containing the fetched spool data.
 */
export function useGetSpoolsByIds(ids: number[]) {
  return useQueries({
    queries: ids.map((id) => {
      return {
        queryKey: ["spool", id],
        queryFn: async () => {
          const res = await fetch(getAPIURL() + "/spool/" + id);
          return (await res.json()) as ISpool;
        },
      };
    }),
  });
}

/**
 * Formats a filament label with the given parameters.
 */
export function formatFilamentLabel(
  name: string,
  diameter: number,
  vendorName?: string,
  material?: string,
  weight?: number,
  spoolType?: SpoolType
): string {
  const portions = [];
  if (vendorName) {
    portions.push(vendorName);
  }
  portions.push(name);
  const extras = [];
  if (material) {
    extras.push(material);
  }
  extras.push(formatLength(diameter));
  if (weight) {
    extras.push(formatWeight(weight));
  }
  if (spoolType) {
    extras.push(spoolType.charAt(0).toUpperCase() + spoolType.slice(1) + " spool");
  }
  return `${portions.join(" - ")} (${extras.join(", ")})`;
}

interface SelectOption {
  label: string;
  value: string | number;
  weight?: number;
  spool_weight?: number;
  is_internal: boolean;
}

export function useGetFilamentSelectOptions() {
  // Setup hooks
  const t = useTranslate();
  const { queryResult: internalFilaments } = useSelect<IFilament>({
    resource: "filament",
  });
  const externalFilaments = useGetExternalDBFilaments();

  // Format and sort internal filament options
  const filamentSelectInternal: SelectOption[] = useMemo(() => {
    const data =
      internalFilaments.data?.data.map((item) => {
        return {
          label: formatFilamentLabel(
            item.name ?? `ID ${item.id}`,
            item.diameter,
            item.vendor?.name,
            item.material,
            item.weight
          ),
          value: item.id,
          weight: item.weight,
          spool_weight: item.spool_weight,
          is_internal: true,
        };
      }) ?? [];
    data.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return data;
  }, [internalFilaments.data?.data]);

  // Format and sort external filament options
  const filamentSelectExternal: SelectOption[] = useMemo(() => {
    const data =
      externalFilaments.data?.map((item) => {
        return {
          label: formatFilamentLabel(
            item.name,
            item.diameter,
            item.manufacturer,
            item.material,
            item.weight,
            item.spool_type
          ),
          value: item.id,
          weight: item.weight,
          spool_weight: item.spool_weight || undefined,
          is_internal: false,
        };
      }) ?? [];
    data.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return data;
  }, [externalFilaments.data]);

  return {
    options: [
      {
        label: <span>{t("spool.fields.filament_internal")}</span>,
        options: filamentSelectInternal,
      },
      {
        label: <span>{t("spool.fields.filament_external")}</span>,
        options: filamentSelectExternal,
      },
    ],
    internalSelectOptions: filamentSelectInternal,
    externalSelectOptions: filamentSelectExternal,
    allExternalFilaments: externalFilaments.data,
  };
}
