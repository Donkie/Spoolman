import { useSelect, useTranslate } from "@refinedev/core";
import { formatLength, formatWeight } from "../../utils/parsing";
import { getAPIURL } from "../../utils/url";
import { ISpool } from "./model";
import { IFilament } from "../filaments/model";
import { useGetExternalDBFilaments } from "../../utils/queryExternalDB";

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
 * Formats a filament label with the given parameters.
 */
export function formatFilamentLabel(
  name: string,
  diameter: number,
  vendorName?: string,
  material?: string,
  weight?: number
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
  const filamentSelectInternal: SelectOption[] =
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
  filamentSelectInternal.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  // Format and sort external filament options
  const filamentSelectExternal: SelectOption[] =
    externalFilaments.data?.map((item) => {
      return {
        label: formatFilamentLabel(item.name, item.diameter, item.manufacturer, item.material, item.weight),
        value: item.id,
        weight: item.weight,
        spool_weight: item.spool_weight || undefined,
        is_internal: false,
      };
    }) ?? [];
  filamentSelectExternal.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

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
    getById: (id: number | string | null) => {
      // id is a number of it's an internal filament, and a string of it's an external filament.
      if (typeof id === "number") {
        return (
          filamentSelectInternal?.find((obj) => {
            return obj.value === id;
          }) ?? null
        );
      } else if (typeof id === "string") {
        return (
          filamentSelectExternal?.find((obj) => {
            return obj.value === id;
          }) ?? null
        );
      } else {
        return null;
      }
    },
    allExternalFilaments: externalFilaments.data,
  };
}
